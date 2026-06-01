"""
processor.py — Módulo queimadas_bdq
Cruzamento vetorial cicatrizes AQ1km × classes de prioridade × municípios.

Pipeline:
  1. Carregar SHPs mensais AQ1km → GeoDataFrame concat com coluna 'mes'
  2. Detectar campo de área (area_km → ha) ou calcular da geometria
  3. Clip ao Piauí (bbox + municípios IBGE)
  4. Carregar classes de prioridade (GPKG, 5 classes)
  5. gpd.overlay(classes, municipios) → ~1120 células (igual areas_prioritarias)
  6. gpd.overlay(células, cicatrizes) → interseção área queimada × classe × município
  7. Calcular area_queimada_ha (EPSG:5880) e n_cicatrizes por célula × mês
  8. Agregar → gdf_classes (por municip × classe × mês) e gdf_resumo (por municip)

Stateless — sem efeitos colaterais além dos paths recebidos.
Reutiliza core/spatial_core.py para reparos geométricos.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from core.spatial_core import fix_geoms

log = logging.getLogger(__name__)

_CRS_WORK   = "EPSG:4674"   # SIRGAS 2000 geográfico (trabalho + interseções)
_CRS_AREA   = "EPSG:5880"   # SIRGAS 2000 / Brasil Policônico (cálculo de área)
_CRS_UPLOAD = "EPSG:4326"   # WGS84 (upload/frontend)

# Piauí bbox (EPSG:4326) — lon_min, lat_min, lon_max, lat_max
_BBOX_PI = (-45.98, -11.80, -40.37, -2.75)

_PRIORIDADE_LABEL: dict[int, str] = {
    1: "Muito Baixo",
    2: "Baixo",
    3: "Médio",
    4: "Alto",
    5: "Muito Alto",
}
_VALID_CLASSES = frozenset(range(1, 6))

# Possíveis nomes de campo de área na aq1km shapefile (DBF 10-char limit)
_AREA_FIELD_CANDIDATES = ("area_km", "area_km2", "AREAKM2", "areakm2", "AREA_KM")


def process(
    shp_paths:     list[Path],
    classes_path:  Path,
    ano:           int  = 2025,
    verbose:       bool = False,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, dict[str, Any]]:
    """
    Executa o cruzamento vetorial.

    Parâmetros:
        shp_paths    : lista de Paths para SHPs mensais (saída do downloader)
        classes_path : Path do GPKG de classes de prioridade (5 classes)
        ano          : ano em análise (default 2025)
        verbose      : log detalhado

    Retorna:
        gdf_classes : GeoDataFrame por (municipio_cod, classe_prioridade, mes, ano)
                      Colunas: area_queimada_ha, n_cicatrizes, prioridade_label, ...
        gdf_resumo  : GeoDataFrame por municipio_cod com totais anuais + geom IBGE
        meta        : dict com estatísticas do processamento
    """
    log.info("Iniciando processamento queimadas_bdq | ano=%d", ano)

    # ── 1. Carregar cicatrizes mensais ────────────────────────────────────────
    cicatrizes_pi = _load_cicatrizes(shp_paths, ano, verbose)
    log.info("Cicatrizes carregadas (Brasil + PI): %d feições", len(cicatrizes_pi))

    if len(cicatrizes_pi) == 0:
        raise ValueError(
            "Nenhuma cicatriz encontrada no Piauí para o ano informado. "
            "Verifique os SHPs baixados."
        )

    n_piaui = len(cicatrizes_pi)

    # ── 2. Carregar classes de prioridade ─────────────────────────────────────
    classes = _load_classes(classes_path)
    classes = classes.to_crs(_CRS_WORK)

    # ── 3. Carregar municípios do Piauí (via downloader areas_prioritarias) ──
    municipios = _load_municipios_from_cache()
    municipios = municipios.to_crs(_CRS_WORK)

    # ── 4. Criar células: classes × municípios ────────────────────────────────
    log.info(
        "Overlay: classes × municípios (%d × %d)...", len(classes), len(municipios)
    )
    cells = gpd.overlay(
        classes[["classe_prioridade", "prioridade_label", "geometry"]],
        municipios[["CD_MUN", "NM_MUN", "geometry"]],
        how            = "intersection",
        keep_geom_type = False,
        make_valid     = True,
    ).rename(columns={"CD_MUN": "municipio_cod", "NM_MUN": "municipio_nome"})
    cells = _clean_geoms(cells).reset_index(drop=True)
    log.info("Células classes × municípios: %d", len(cells))

    # ── 5. Cruzar cicatrizes × células (por mês) ─────────────────────────────
    cicatrizes_pi = cicatrizes_pi.to_crs(_CRS_WORK)
    records_classes = _intersect_by_month(cicatrizes_pi, cells, verbose)

    if len(records_classes) == 0:
        raise ValueError(
            "Nenhuma interseção cicatrizes × células encontrada. "
            "Verifique CRS e sobreposição geográfica."
        )

    # ── 6. Montar gdf_classes (por municipio × classe × mês) ─────────────────
    gdf_classes = (
        records_classes
        .groupby(["municipio_cod", "municipio_nome", "classe_prioridade",
                  "prioridade_label", "mes"], as_index=False)
        .agg(
            area_queimada_ha = ("area_queimada_ha", "sum"),
            n_cicatrizes     = ("n_cicatrizes",     "sum"),
        )
    )
    gdf_classes["area_queimada_ha"] = gdf_classes["area_queimada_ha"].round(4)
    gdf_classes["uf"]  = "PI"
    gdf_classes["ano"] = ano

    meses_com_dados = sorted(gdf_classes["mes"].unique().tolist())
    area_total_ha   = round(gdf_classes["area_queimada_ha"].sum(), 4)

    log.info(
        "Agregado: %d registros | meses=%s | área total PI=%.1f ha",
        len(gdf_classes), meses_com_dados, area_total_ha,
    )

    # ── 7. Montar gdf_resumo (por município) ──────────────────────────────────
    gdf_resumo = _build_resumo(gdf_classes, municipios, ano)

    # ── 8. Validar ────────────────────────────────────────────────────────────
    _validate_output(gdf_classes, gdf_resumo)

    meta = {
        "n_cicatrizes_piaui":    n_piaui,
        "area_queimada_total_ha": area_total_ha,
        "meses_com_dados":       meses_com_dados,
        "n_municipios_afetados": int((gdf_resumo["area_queimada_total_ha"] > 0).sum()),
    }

    return gdf_classes, gdf_resumo, meta


# ── Carregamento de cicatrizes ────────────────────────────────────────────────

def _load_cicatrizes(
    shp_paths: list[Path],
    ano:       int,
    verbose:   bool,
) -> gpd.GeoDataFrame:
    """
    Carrega todos os SHPs mensais, concatena, clip ao Piauí e retorna
    GeoDataFrame com colunas padronizadas: geometry, mes, area_km, area_ha.
    """
    frames: list[gpd.GeoDataFrame] = []

    for shp in sorted(shp_paths):
        mes = _mes_from_path(shp, ano)
        if mes is None:
            log.warning("Não foi possível extrair mês de %s — ignorado.", shp.name)
            continue

        gdf = gpd.read_file(str(shp))
        gdf = fix_geoms(gdf, f"aq1km_mes{mes:02d}")

        if len(gdf) == 0:
            log.info("Mês %02d: SHP vazio.", mes)
            continue

        # Reprojetar para WGS84 se necessário
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        elif gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs("EPSG:4326")

        # Clip ao Piauí via bbox (pré-filtro barato)
        gdf = gdf.cx[_BBOX_PI[0]:_BBOX_PI[2], _BBOX_PI[1]:_BBOX_PI[3]].copy()

        if len(gdf) == 0:
            log.info("Mês %02d: sem cicatrizes no bbox do Piauí.", mes)
            continue

        # Detectar campo de área em km²
        area_col = _detect_area_col(gdf)
        if area_col:
            gdf = gdf.rename(columns={area_col: "_area_km_src"})
            gdf["area_km"] = pd.to_numeric(gdf["_area_km_src"], errors="coerce").fillna(0.0)
        else:
            # Calcular da geometria (reprojetar para EPSG:5880 momentaneamente)
            gdf["area_km"] = gdf.to_crs(_CRS_AREA).geometry.area / 1_000_000

        gdf["mes"] = mes

        # Manter só o necessário
        gdf = gdf[["geometry", "mes", "area_km"]].copy()
        frames.append(gdf)

        if verbose:
            log.info(
                "Mês %02d: %d cicatrizes no bbox PI | área=%.1f km²",
                mes, len(gdf), gdf["area_km"].sum(),
            )

    if not frames:
        return gpd.GeoDataFrame(
            columns=["geometry", "mes", "area_km"],
            geometry="geometry",
            crs="EPSG:4326",
        )

    combined = gpd.GeoDataFrame(
        pd.concat(frames, ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )
    combined = fix_geoms(combined, "cicatrizes_pi_combined")
    return combined


def _mes_from_path(shp: Path, ano: int) -> int | None:
    """Extrai mês do nome do arquivo. Ex.: aq2025_03.shp → 3."""
    stem = shp.stem  # ex.: aq2025_03
    parts = stem.replace(str(ano), "").replace("aq", "").strip("_")
    try:
        return int(parts)
    except ValueError:
        # Tentar extrair qualquer número de 1-2 dígitos
        import re
        nums = re.findall(r"\d+", stem)
        for n in nums:
            v = int(n)
            if 1 <= v <= 12:
                return v
        return None


def _detect_area_col(gdf: gpd.GeoDataFrame) -> str | None:
    """Detecta a coluna de área em km² no shapefile."""
    cols_lower = {c.lower(): c for c in gdf.columns}
    for candidate in _AREA_FIELD_CANDIDATES:
        if candidate.lower() in cols_lower:
            return cols_lower[candidate.lower()]
    return None


# ── Carregamento de classes e municípios ──────────────────────────────────────

def _load_classes(path: Path) -> gpd.GeoDataFrame:
    """Carrega GPKG de classes de prioridade (mesmo arquivo do areas_prioritarias)."""
    gdf = gpd.read_file(str(path))
    gdf = fix_geoms(gdf, "classes_prioritarias")
    # Garantir CRS_WORK — aborta mistura silenciosa de CRS antes do overlay.
    if gdf.crs is None:
        gdf = gdf.set_crs(_CRS_WORK)
    elif gdf.crs.to_epsg() not in (4674, 4326):
        gdf = gdf.to_crs(_CRS_WORK)

    if "DN" in gdf.columns:
        gdf = gdf.rename(columns={"DN": "classe_prioridade"})
    elif "classe_prioridade" not in gdf.columns:
        raise ValueError("GPKG de classes não tem coluna 'DN' nem 'classe_prioridade'.")

    gdf["classe_prioridade"] = gdf["classe_prioridade"].astype(int)
    gdf["prioridade_label"]  = gdf["classe_prioridade"].map(_PRIORIDADE_LABEL)
    gdf = gdf[["classe_prioridade", "prioridade_label", "geometry"]]

    invalid = set(gdf["classe_prioridade"].unique()) - _VALID_CLASSES
    if invalid:
        raise ValueError(f"Classes inválidas no GPKG: {invalid}")

    log.info(
        "Classes carregadas: %d feições, classes=%s",
        len(gdf), sorted(gdf["classe_prioridade"].unique()),
    )
    return gdf


def _load_municipios_from_cache() -> gpd.GeoDataFrame:
    """
    Carrega municípios do Piauí do cache do módulo areas_prioritarias.
    Tenta múltiplos caminhos antes de lançar erro.
    """
    _candidates = [
        Path("C:/11. REDD+/monitoramento-alertas-desmatamento-pi/data/raw/"
             "areas_prioritarias/municipios_piaui_ibge2022.gpkg"),
        Path("C:/11. REDD+/monitoramento-alertas-desmatamento-pi/data/raw/"
             "areas_prioritarias/PI_Municipios_2022.shp"),
    ]
    for p in _candidates:
        if p.exists():
            gdf = gpd.read_file(str(p))
            gdf = fix_geoms(gdf, "municipios_ibge")
            if gdf.crs is None:
                gdf = gdf.set_crs(_CRS_WORK)
            elif gdf.crs.to_epsg() not in (4674, 4326):
                gdf = gdf.to_crs(_CRS_WORK)
            if "SIGLA_UF" in gdf.columns:
                gdf = gdf[gdf["SIGLA_UF"] == "PI"].copy()
            elif "CD_UF" in gdf.columns:
                gdf = gdf[gdf["CD_UF"] == "22"].copy()
            if len(gdf) == 0:
                continue
            log.info("Municípios carregados de cache: %d | %s", len(gdf), p.name)
            return gdf

    # Fallback: baixar via IBGE FTP
    log.info("Cache de municípios não encontrado — baixando do IBGE...")
    from modules.areas_prioritarias.downloader import download as _ap_download
    dest = Path("C:/11. REDD+/monitoramento-alertas-desmatamento-pi/data/raw/"
                "areas_prioritarias")
    mun_path = _ap_download(dest, {"verbose": False})
    gdf = gpd.read_file(str(mun_path))
    gdf = fix_geoms(gdf, "municipios_ibge")
    if "SIGLA_UF" in gdf.columns:
        gdf = gdf[gdf["SIGLA_UF"] == "PI"].copy()
    elif "CD_UF" in gdf.columns:
        gdf = gdf[gdf["CD_UF"] == "22"].copy()
    return gdf


# ── Interseção por mês ────────────────────────────────────────────────────────

def _intersect_by_month(
    cicatrizes: gpd.GeoDataFrame,
    cells:      gpd.GeoDataFrame,
    verbose:    bool,
) -> gpd.GeoDataFrame:
    """
    Para cada mês, intersecta cicatrizes × células (classe × município).
    Retorna GeoDataFrame com colunas:
      municipio_cod, municipio_nome, classe_prioridade, prioridade_label,
      mes, area_queimada_ha, n_cicatrizes
    """
    meses = sorted(cicatrizes["mes"].unique())
    frames: list[pd.DataFrame] = []

    cells_work = cells.to_crs(_CRS_WORK)

    for mes in meses:
        sub = cicatrizes[cicatrizes["mes"] == mes].copy()
        if len(sub) == 0:
            continue

        n_raw = len(sub)

        # Overlay cicatrizes × células
        try:
            intersected = gpd.overlay(
                cells_work[["municipio_cod", "municipio_nome",
                             "classe_prioridade", "prioridade_label", "geometry"]],
                sub[["geometry"]],
                how            = "intersection",
                keep_geom_type = False,
                make_valid     = True,
            )
        except Exception as exc:
            log.warning("Overlay falhou para mês %02d: %s — mês ignorado.", mes, exc)
            continue

        intersected = _clean_geoms(intersected)
        if len(intersected) == 0:
            log.debug("Mês %02d: sem interseção cicatrizes × células.", mes)
            continue

        # Limpa geometrias pós-overlay antes de calcular área —
        # overlay pode produzir polígonos inválidos que distorceriam a reprojeção.
        intersected = _clean_geoms(intersected)
        if len(intersected) == 0:
            continue

        # Área queimada em ha (EPSG:5880 — projeção equivalente)
        intersected["area_queimada_ha"] = (
            intersected.to_crs(_CRS_AREA).geometry.area / 10_000
        ).round(4)

        # Contagem de cicatrizes originais que contribuíram
        intersected["n_cicatrizes"] = 1

        intersected["mes"] = mes

        agg = (
            intersected
            .groupby(["municipio_cod", "municipio_nome",
                      "classe_prioridade", "prioridade_label", "mes"],
                     as_index=False)
            .agg(
                area_queimada_ha = ("area_queimada_ha", "sum"),
                n_cicatrizes     = ("n_cicatrizes",     "sum"),
            )
        )
        frames.append(agg)

        if verbose:
            log.info(
                "Mês %02d: %d cicatrizes brutas → %d células com queimada | "
                "área=%.1f ha",
                mes, n_raw, len(agg), agg["area_queimada_ha"].sum(),
            )

    if not frames:
        return pd.DataFrame(
            columns=["municipio_cod", "municipio_nome", "classe_prioridade",
                     "prioridade_label", "mes", "area_queimada_ha", "n_cicatrizes"]
        )

    return pd.concat(frames, ignore_index=True)


# ── Resumo por município ──────────────────────────────────────────────────────

def _build_resumo(
    gdf_classes: pd.DataFrame,
    municipios:  gpd.GeoDataFrame,
    ano:         int,
) -> gpd.GeoDataFrame:
    """
    Agrega gdf_classes por município e une geometria IBGE.
    """
    # Totais anuais por município
    agg = gdf_classes.groupby("municipio_cod", as_index=False).agg(
        municipio_nome          = ("municipio_nome",   "first"),
        area_queimada_total_ha  = ("area_queimada_ha", "sum"),
        n_cicatrizes_total      = ("n_cicatrizes",     "sum"),
    )
    agg["area_queimada_total_ha"] = agg["area_queimada_total_ha"].round(4)

    # Mês pico (maior área queimada)
    mes_pico = (
        gdf_classes.groupby(["municipio_cod", "mes"])["area_queimada_ha"]
        .sum()
        .reset_index()
        .sort_values("area_queimada_ha", ascending=False)
        .drop_duplicates("municipio_cod")[["municipio_cod", "mes"]]
        .rename(columns={"mes": "mes_pico"})
    )
    agg = agg.merge(mes_pico, on="municipio_cod", how="left")

    # Classe com maior área queimada
    classe_max = (
        gdf_classes.groupby(["municipio_cod", "classe_prioridade"])["area_queimada_ha"]
        .sum()
        .reset_index()
        .sort_values("area_queimada_ha", ascending=False)
        .drop_duplicates("municipio_cod")[["municipio_cod", "classe_prioridade"]]
        .rename(columns={"classe_prioridade": "classe_max_queimada"})
    )
    agg = agg.merge(classe_max, on="municipio_cod", how="left")

    # % em classes prioritárias (4 e 5)
    area_prior = (
        gdf_classes[gdf_classes["classe_prioridade"] >= 4]
        .groupby("municipio_cod")["area_queimada_ha"]
        .sum()
        .reset_index()
        .rename(columns={"area_queimada_ha": "_area_prior"})
    )
    agg = agg.merge(area_prior, on="municipio_cod", how="left")
    total_safe = agg["area_queimada_total_ha"].replace(0, pd.NA)
    agg["pct_area_prioritaria"] = (
        agg["_area_prior"].fillna(0) / total_safe * 100
    ).fillna(0).round(2).clip(0, 100)
    agg = agg.drop(columns=["_area_prior"])

    # Distribuição por classe como JSONB (para frontend)
    area_por_classe = (
        gdf_classes.groupby(["municipio_cod", "classe_prioridade"])["area_queimada_ha"]
        .sum()
        .reset_index()
    )
    pivot = (
        area_por_classe
        .pivot(index="municipio_cod", columns="classe_prioridade",
               values="area_queimada_ha")
        .fillna(0.0)
        .round(4)
        .rename(columns=lambda c: f"ha_classe_{c}")
        .reset_index()
    )
    agg = agg.merge(pivot, on="municipio_cod", how="left")

    agg["uf"]  = "PI"
    agg["ano"] = ano

    # Unir geometria IBGE
    mun_geom = (
        municipios[["CD_MUN", "geometry"]]
        .copy()
        .rename(columns={"CD_MUN": "municipio_cod"})
        .to_crs(_CRS_UPLOAD)
    )

    gdf_resumo = gpd.GeoDataFrame(
        agg.merge(mun_geom, on="municipio_cod", how="left"),
        geometry="geometry",
        crs=_CRS_UPLOAD,
    )

    # bbox para MapLibre
    gdf_resumo["bbox"] = gdf_resumo.geometry.apply(
        lambda g: [[g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]]
        if g is not None and not g.is_empty else None
    )

    return gdf_resumo


# ── Utilitários ───────────────────────────────────────────────────────────────

def _clean_geoms(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Remove geometrias nulas, vazias ou inválidas."""
    mask = (
        gdf.geometry.notna() &
        ~gdf.geometry.is_empty &
        gdf.geometry.is_valid
    )
    n_removed = (~mask).sum()
    if n_removed > 0:
        log.debug("Removidas %d geometrias inválidas/vazias.", n_removed)
    return gdf[mask].copy()


def _validate_output(
    gdf_classes: pd.DataFrame,
    gdf_resumo:  gpd.GeoDataFrame,
) -> None:
    if len(gdf_resumo) == 0:
        raise ValueError("Nenhum município no resumo — verificar dados de entrada.")

    invalid = set(gdf_classes["classe_prioridade"].unique()) - _VALID_CLASSES
    if invalid:
        raise ValueError(f"Classes inválidas no resultado: {invalid}")

    bad_pct = gdf_resumo[
        (gdf_resumo["pct_area_prioritaria"] < 0) |
        (gdf_resumo["pct_area_prioritaria"] > 100)
    ]
    if len(bad_pct) > 0:
        raise ValueError(
            f"{len(bad_pct)} municípios com pct_area_prioritaria fora de [0, 100]."
        )

    log.info(
        "Validação OK: %d municípios afetados | %d registros (mun × classe × mês) "
        "| classes=%s",
        int((gdf_resumo["area_queimada_total_ha"] > 0).sum()),
        len(gdf_classes),
        sorted(gdf_classes["classe_prioridade"].unique()),
    )
