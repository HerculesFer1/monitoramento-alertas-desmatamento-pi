"""
processor.py — Módulo areas_prioritarias v2
Cruzamento vetorial para quantificação de áreas REDD+.

Abordagem: gpd.overlay() em vez de contagem de pixels.

Pipeline:
  1. Carregar classes GPKG (5 MultiPolygons, ESRI:102033)
  2. Carregar municípios Piauí (IBGE)
  3. gpd.overlay(classes, municipios) → ~1120 células (classe × município)
  4. gpd.overlay(células, floresta_2025.gpkg) → area_floresta_ha por célula
  5. gpd.overlay(células, PRODES_local[ano]) → area_desmat_ha por célula
  6. Calcular pct_floresta, pct_desmat, area_nao_floresta_ha
  7. Agregar por município → gdf_resumo (+ geom IBGE + bbox)

Retorna gdf_classes COM geometria (usada por calculator.py para zonal_stats).
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

# CRS de trabalho — SIRGAS 2000 Geográfico (compatível com PRODES e IBGE)
_CRS_WORK   = "EPSG:4674"
# CRS para cálculo de área — SIRGAS 2000 / Brasil Policônico (projeção equivalente)
_CRS_AREA   = "EPSG:5880"
# CRS de upload — WGS84 (padrão GeoJSON do projeto)
_CRS_UPLOAD = "EPSG:4326"

# Mapeamento classe → rótulo canônico de prioridade
_PRIORIDADE_LABEL: dict[int, str] = {
    1: "Muito Baixo",
    2: "Baixo",
    3: "Médio",
    4: "Alto",
    5: "Muito Alto",
}

_VALID_CLASSES = frozenset(range(1, 6))  # 1..5


def process(
    municipios_path: Path,
    config:          dict[str, Any],
    ano:             int  = 2025,
    verbose:         bool = False,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """
    Executa o cruzamento vetorial.

    Parâmetros:
        municipios_path : Path para GPKG/SHP de municípios IBGE (Piauí)
        config          : dict com keys:
                            priority_classes  → Path do GPKG de classes
                            forest_mask_gpkg  → Path do GPKG florestal vetorizado
                            prodes_geojson    → Path do GeoJSON PRODES local
        ano             : ano PRODES a processar (default 2025)
        verbose         : log detalhado

    Retorna:
        gdf_classes : GeoDataFrame COM geometria —
                      (municipio_cod, classe_prioridade, area_*_ha, ...)
                      Geometria = interseção classe × município (usada para zonal_stats)
        gdf_resumo  : GeoDataFrame — (municipio_cod, resumo + geom IBGE + bbox)
    """
    log.info("Iniciando processamento areas_prioritarias v2 | ano=%s", ano)

    # ── 1. Carregar e validar classes de prioridade ───────────────────────────
    classes_path = Path(config["priority_classes"])
    if not classes_path.exists():
        raise FileNotFoundError(f"GPKG de classes não encontrado: {classes_path}")

    classes = gpd.read_file(str(classes_path))
    classes = fix_geoms(classes, "classes_prioritarias")
    classes = classes.to_crs(_CRS_WORK)

    # Normalizar colunas DN → classe_prioridade
    if "DN" in classes.columns:
        classes = classes.rename(columns={"DN": "classe_prioridade"})
    elif "classe_prioridade" not in classes.columns:
        raise ValueError("GPKG de classes não tem coluna 'DN' nem 'classe_prioridade'.")

    classes["classe_prioridade"] = classes["classe_prioridade"].astype(int)
    classes["prioridade_label"]  = classes["classe_prioridade"].map(_PRIORIDADE_LABEL)
    classes = classes[["classe_prioridade", "prioridade_label", "geometry"]]

    invalid_cls = set(classes["classe_prioridade"].unique()) - _VALID_CLASSES
    if invalid_cls:
        raise ValueError(f"Classes inválidas no GPKG: {invalid_cls} — esperado 1..5.")

    log.info(
        "Classes carregadas: %d feições, classes=%s",
        len(classes), sorted(classes["classe_prioridade"].unique()),
    )

    # ── 2. Carregar municípios Piauí ──────────────────────────────────────────
    municipios = _load_municipios(municipios_path)
    municipios = municipios.to_crs(_CRS_WORK)

    # ── 3. Overlay: classes × municípios ──────────────────────────────────────
    log.info("Overlay: classes × municípios (%d × %d)...", len(classes), len(municipios))
    gdf_cls_mun = gpd.overlay(
        classes[["classe_prioridade", "prioridade_label", "geometry"]],
        municipios[["CD_MUN", "NM_MUN", "geometry"]],
        how            = "intersection",
        keep_geom_type = False,
        make_valid     = True,
    )
    gdf_cls_mun = gdf_cls_mun.rename(
        columns={"CD_MUN": "municipio_cod", "NM_MUN": "municipio_nome"}
    )
    gdf_cls_mun = _clean_geoms(gdf_cls_mun)
    gdf_cls_mun = gdf_cls_mun.reset_index(drop=True)

    if len(gdf_cls_mun) == 0:
        raise ValueError(
            "Overlay classes × municípios resultou em zero células. "
            "Verifique se os CRS são compatíveis e as geometrias se sobrepõem."
        )
    log.info("Cruzamento classes × municípios: %d células", len(gdf_cls_mun))

    # ── 4. Área total por célula (projeção equivalente) ───────────────────────
    gdf_cls_mun = _calc_area_ha(gdf_cls_mun, "area_total_ha")

    # ── 5. Área florestal via rasterstats no TIF original ─────────────────────
    # Estratégia: rasterstats.zonal_stats() no TIF (valor 100 = floresta).
    # Muito mais rápido que gpd.overlay() contra ~96k patches vetorizados.
    forest_tif = Path(config["forest_mask_tif"])
    if not forest_tif.exists():
        raise FileNotFoundError(
            f"Máscara florestal TIF não encontrada: {forest_tif}"
        )

    log.info("Calculando área florestal via rasterstats: %s...", forest_tif.name)
    forest_agg = _calc_forest_area_raster(gdf_cls_mun, forest_tif)
    log.info(
        "Floresta agregada: %d células com área florestal (total=%.0f ha)",
        len(forest_agg[forest_agg["area_floresta_ha"] > 0]),
        forest_agg["area_floresta_ha"].sum(),
    )

    # ── 6. Carregar e filtrar PRODES por ano ──────────────────────────────────
    prodes_path = Path(config["prodes_geojson"])
    if not prodes_path.exists():
        raise FileNotFoundError(f"PRODES GeoJSON não encontrado: {prodes_path}")

    prodes = _load_prodes(prodes_path, ano)
    prodes = prodes.to_crs(_CRS_WORK)
    log.info("PRODES %d carregado: %d feições", ano, len(prodes))

    # ── 7. Overlay: células × PRODES ──────────────────────────────────────────
    prodes_agg = _aggregate_desmatamento(gdf_cls_mun, prodes)

    # ── 8. Consolidar áreas ───────────────────────────────────────────────────
    gdf_cls_mun = (
        gdf_cls_mun
        .merge(forest_agg, on=["municipio_cod", "classe_prioridade"], how="left")
        .merge(prodes_agg, on=["municipio_cod", "classe_prioridade"], how="left")
    )
    gdf_cls_mun["area_floresta_ha"] = (
        gdf_cls_mun["area_floresta_ha"].fillna(0.0).round(4)
    )
    gdf_cls_mun["area_desmat_ha"] = (
        gdf_cls_mun["area_desmat_ha"].fillna(0.0).round(4)
    )
    gdf_cls_mun["area_nao_floresta_ha"] = (
        gdf_cls_mun["area_total_ha"]
        - gdf_cls_mun["area_floresta_ha"]
        - gdf_cls_mun["area_desmat_ha"]
    ).clip(lower=0.0).round(4)

    # ── 9. Percentuais ────────────────────────────────────────────────────────
    total_safe = gdf_cls_mun["area_total_ha"].replace(0, pd.NA)
    gdf_cls_mun["pct_floresta"] = (
        gdf_cls_mun["area_floresta_ha"] / total_safe * 100
    ).fillna(0.0).round(2).clip(0, 100)
    gdf_cls_mun["pct_desmat"] = (
        gdf_cls_mun["area_desmat_ha"] / total_safe * 100
    ).fillna(0.0).round(2).clip(0, 100)

    # ── 10. Metadados ─────────────────────────────────────────────────────────
    gdf_cls_mun["uf"]               = "PI"
    gdf_cls_mun["ano_prodes"]       = ano
    gdf_cls_mun["ha_deter_recente"] = None  # gap DETER: preenchido quando disponível
    gdf_cls_mun["agb_medio_tc_ha"]  = None  # preenchido por calculator.py
    gdf_cls_mun["biomassa_total_tc"]= None  # preenchido por calculator.py

    # gdf_classes retém geometria para zonal_stats em calculator.py
    gdf_classes = gdf_cls_mun.copy()

    # ── 11. Resumo por município ──────────────────────────────────────────────
    gdf_resumo = _build_resumo(gdf_classes, municipios, ano)

    # ── 12. Validação ─────────────────────────────────────────────────────────
    _validate_output(gdf_classes, gdf_resumo)

    log.info(
        "Processamento concluído: %d municípios, %d registros de classe | "
        "Floresta total=%.0f ha, Desmatado total=%.0f ha",
        len(gdf_resumo), len(gdf_classes),
        gdf_resumo["area_floresta_ha"].sum(),
        gdf_resumo["area_desmat_ha"].sum(),
    )
    return gdf_classes, gdf_resumo


# ── Funções auxiliares ────────────────────────────────────────────────────────

def _load_municipios(path: Path) -> gpd.GeoDataFrame:
    """Carrega e valida municípios do Piauí."""
    gdf = gpd.read_file(str(path))
    gdf = fix_geoms(gdf, "municipios_ibge")

    required = {"CD_MUN", "NM_MUN"}
    missing  = required - set(gdf.columns)
    if missing:
        raise ValueError(f"Colunas ausentes nos municípios IBGE: {missing}")

    # Filtrar Piauí se arquivo nacional
    if "SIGLA_UF" in gdf.columns:
        gdf = gdf[gdf["SIGLA_UF"] == "PI"].copy()
    elif "CD_UF" in gdf.columns:
        gdf = gdf[gdf["CD_UF"] == "22"].copy()  # Piauí IBGE code = 22

    if len(gdf) == 0:
        raise ValueError("Nenhum município do Piauí encontrado no arquivo IBGE.")

    log.info("Municípios carregados: %d", len(gdf))
    return gdf


def _load_prodes(path: Path, ano: int) -> gpd.GeoDataFrame:
    """Carrega PRODES local e filtra por ano."""
    gdf = gpd.read_file(str(path))
    gdf = fix_geoms(gdf, "prodes")

    if "ano" not in gdf.columns:
        raise ValueError("PRODES GeoJSON não tem coluna 'ano'.")

    gdf = gdf[gdf["ano"] == ano].copy()

    if len(gdf) == 0:
        log.warning("PRODES: nenhuma feição para ano=%d — desmatamento será zero.", ano)

    return gdf


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


def _calc_area_ha(gdf: gpd.GeoDataFrame, col: str) -> gpd.GeoDataFrame:
    """
    Calcula área em hectares reprojetando para _CRS_AREA (projeção equivalente).
    Não altera o CRS original do GeoDataFrame.
    """
    areas_m2 = gdf.to_crs(_CRS_AREA).geometry.area
    gdf = gdf.copy()
    gdf[col] = (areas_m2 / 10_000).round(4)
    return gdf


def _calc_forest_area_raster(
    gdf_cls_mun: gpd.GeoDataFrame,
    forest_tif:  Path,
) -> pd.DataFrame:
    """
    Calcula área florestal (ha) por célula (municipio × classe) usando
    rasterstats.zonal_stats() sobre o TIF original.

    Estratégia:
      - Forest mask: pixels com valor 100 = floresta, 0 = não-floresta.
      - zonal_stats(..., stats=["sum"]) → soma dos pixels na célula.
      - area_floresta_ha = (soma / FOREST_VALUE) × pixel_area_ha
      - pixel_area_ha calculado reprojetando 1 pixel do TIF para EPSG:5880.

    Vantagem sobre gpd.overlay(): ordens de magnitude mais rápido —
    não há necessidade de vetorizar ou cruzar ~96k patches.

    Retorna DataFrame com colunas [municipio_cod, classe_prioridade, area_floresta_ha].
    """
    import rasterio
    from rasterstats import zonal_stats as _zonal_stats
    from shapely.geometry import box as sbox

    FOREST_VALUE = 100  # valor de pixel correspondente a floresta

    with rasterio.open(str(forest_tif)) as src:
        tif_crs = src.crs
        tfm     = src.transform
        # Área de 1 pixel em hectares — reprojetando para EPSG:5880 (projeção equiv.)
        px_poly = gpd.GeoDataFrame(
            geometry=[sbox(tfm.c, tfm.f + tfm.e, tfm.c + tfm.a, tfm.f)],
            crs=tif_crs,
        )
        pixel_area_ha = px_poly.to_crs(_CRS_AREA).iloc[0].geometry.area / 10_000

    log.info(
        "TIF florestal: CRS=%s | pixel_area=%.6f ha | células=%d",
        tif_crs, pixel_area_ha, len(gdf_cls_mun),
    )

    # Reprojetar células para o CRS do TIF
    gdf_work = gdf_cls_mun[["municipio_cod", "classe_prioridade", "geometry"]].copy()
    if gdf_work.crs.to_epsg() != tif_crs.to_epsg():
        gdf_work = gdf_work.to_crs(tif_crs)

    # all_touched=True para incluir pixels de borda — evita subestimação
    # de área florestal em células pequenas (A3 da auditoria).
    stats = _zonal_stats(
        vectors      = gdf_work.geometry.tolist(),
        raster       = str(forest_tif),
        stats        = ["sum"],
        nodata       = 0,
        all_touched  = True,
    )

    forest_ha = [
        round((s.get("sum") or 0.0) / FOREST_VALUE * pixel_area_ha, 4)
        for s in stats
    ]

    result = gdf_cls_mun[["municipio_cod", "classe_prioridade"]].copy()
    result["area_floresta_ha"] = forest_ha
    return result


def _aggregate_desmatamento(
    gdf_cls_mun: gpd.GeoDataFrame,
    prodes:      gpd.GeoDataFrame,
) -> pd.DataFrame:
    """
    Intersecta células com polígonos PRODES e agrega área desmatada por célula.
    Retorna DataFrame com colunas [municipio_cod, classe_prioridade, area_desmat_ha].
    """
    empty = pd.DataFrame(
        columns=["municipio_cod", "classe_prioridade", "area_desmat_ha"]
    )

    if len(prodes) == 0:
        log.warning("PRODES vazio — area_desmat_ha será zero para todas as células.")
        return empty

    log.info("Overlay: células × PRODES (%d feições)...", len(prodes))
    gdf_int = gpd.overlay(
        gdf_cls_mun[["municipio_cod", "classe_prioridade", "geometry"]],
        prodes[["geometry"]],
        how            = "intersection",
        keep_geom_type = False,
        make_valid     = True,
    )
    gdf_int = _clean_geoms(gdf_int)

    if len(gdf_int) == 0:
        log.warning("Nenhuma interseção PRODES × células — verificar CRS e sobreposição.")
        return empty

    gdf_int = _calc_area_ha(gdf_int, "area_desmat_ha")

    agg = (
        gdf_int.groupby(["municipio_cod", "classe_prioridade"])["area_desmat_ha"]
        .sum()
        .reset_index()
    )
    log.info(
        "PRODES agregado: %d células com desmatamento (total=%.0f ha)",
        len(agg), agg["area_desmat_ha"].sum(),
    )
    return agg


def _build_resumo(
    gdf_classes: gpd.GeoDataFrame,
    municipios:  gpd.GeoDataFrame,
    ano:         int,
) -> gpd.GeoDataFrame:
    """
    Agrega gdf_classes por município e une geometria IBGE para gdf_resumo.
    """
    # Agregar áreas por município
    agg = gdf_classes.groupby("municipio_cod", as_index=False).agg(
        municipio_nome   = ("municipio_nome",    "first"),
        area_total_ha    = ("area_total_ha",      "sum"),
        area_floresta_ha = ("area_floresta_ha",   "sum"),
        area_desmat_ha   = ("area_desmat_ha",     "sum"),
    )
    for col in ["area_total_ha", "area_floresta_ha", "area_desmat_ha"]:
        agg[col] = agg[col].round(4)

    # classe_max_prioridade = maior classe com floresta (5 = Muito Alto = mais urgente)
    classe_max = (
        gdf_classes[gdf_classes["area_floresta_ha"] > 0]
        .groupby("municipio_cod")["classe_prioridade"]
        .max()
        .reset_index()
        .rename(columns={"classe_prioridade": "classe_max_prioridade"})
    )
    agg = agg.merge(classe_max, on="municipio_cod", how="left")

    # Metadados
    agg["uf"]                 = "PI"
    agg["pct_floresta_estado"] = None   # calculado em calculator.py
    agg["biomassa_floresta_tc"] = None  # calculado em calculator.py
    agg["ha_deter_recente"]    = None   # gap DETER
    agg["agb_medio_tc_ha"]     = None   # calculado em calculator.py
    agg["ano_prodes"]          = ano

    # Unir geometria IBGE (para upload + bbox)
    mun_geom = municipios[["CD_MUN", "geometry"]].copy().rename(
        columns={"CD_MUN": "municipio_cod"}
    ).to_crs(_CRS_UPLOAD)

    gdf_resumo = gpd.GeoDataFrame(
        agg.merge(mun_geom, on="municipio_cod", how="left"),
        geometry="geometry",
        crs=_CRS_UPLOAD,
    )

    # bbox para MapLibre GL fitBounds: [[minX,minY],[maxX,maxY]]
    gdf_resumo["bbox"] = gdf_resumo.geometry.apply(
        lambda g: [[g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]]
        if g is not None and not g.is_empty else None
    )

    return gdf_resumo


def _validate_output(
    gdf_classes: gpd.GeoDataFrame,
    gdf_resumo:  gpd.GeoDataFrame,
) -> None:
    """Validações críticas pós-processamento. Levanta ValueError se inconsistente."""
    if len(gdf_resumo) == 0:
        raise ValueError("Nenhum município processado — verificar dados de entrada.")

    if len(gdf_resumo) < 50:
        log.warning(
            "Apenas %d municípios processados — esperado ~224 para o Piauí. "
            "Verifique a sobreposição entre classes de prioridade e municípios.",
            len(gdf_resumo),
        )

    invalid_classes = set(gdf_classes["classe_prioridade"].unique()) - _VALID_CLASSES
    if invalid_classes:
        raise ValueError(f"Classes inválidas no resultado: {invalid_classes}")

    bad_pct = gdf_classes[
        (gdf_classes["pct_floresta"] < 0) | (gdf_classes["pct_floresta"] > 100) |
        (gdf_classes["pct_desmat"]   < 0) | (gdf_classes["pct_desmat"]   > 100)
    ]
    if len(bad_pct) > 0:
        raise ValueError(f"{len(bad_pct)} registros com percentual fora de [0, 100].")

    log.info(
        "Validação OK: %d municípios | %d registros | classes=%s",
        len(gdf_resumo),
        len(gdf_classes),
        sorted(gdf_classes["classe_prioridade"].unique()),
    )
