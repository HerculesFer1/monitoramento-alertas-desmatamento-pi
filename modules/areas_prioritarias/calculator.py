"""
calculator.py — Módulo areas_prioritarias v2
Enriquecimento com biomassa + pct_floresta_estado + upload Supabase.

Responsabilidades:
  1. Zonal stats de AGB sobre geometrias de interseção (classe × município)
  2. Calcular biomassa_total_tc = agb_medio × area_floresta_ha (por classe)
  3. Agregar agb_medio_tc_ha e biomassa_floresta_tc por município
  4. Calcular pct_floresta_estado (% da floresta total do PI)
  5. Upload para Supabase via core/uploader.py

Stateless — sem efeitos colaterais além do upload ao Supabase.
"""
from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd

log = logging.getLogger(__name__)

_CRS_UPLOAD = "EPSG:4326"


def calculate_and_upload(
    gdf_classes:  gpd.GeoDataFrame,
    gdf_resumo:   gpd.GeoDataFrame,
    biomass_dir:  Path,
    ano:          int  = 2025,
    dry_run:      bool = False,
    verbose:      bool = False,
) -> int:
    """
    Enriquece com biomassa, calcula pct_floresta_estado e faz upload.
    Retorna total de registros inseridos em ap_classes_municipio.
    """
    biomass_dir = Path(biomass_dir)

    # ── 1. Enriquecimento de biomassa ────────────────────────────────────────
    gdf_classes, gdf_resumo = _enrich_biomass(
        gdf_classes, gdf_resumo, biomass_dir, verbose
    )

    # ── 2. pct_floresta_estado ───────────────────────────────────────────────
    total_floresta = gdf_resumo["area_floresta_ha"].sum()
    if total_floresta > 0:
        gdf_resumo = gdf_resumo.copy()
        gdf_resumo["pct_floresta_estado"] = (
            gdf_resumo["area_floresta_ha"] / total_floresta * 100
        ).round(2)
    else:
        gdf_resumo["pct_floresta_estado"] = 0.0

    log.info(
        "Floresta total Piauí: %.2f ha | Municípios: %d",
        total_floresta, len(gdf_resumo),
    )

    # ── 3. Preparar para upload ──────────────────────────────────────────────
    df_classes        = _prepare_classes_for_upload(gdf_classes)
    gdf_resumo_upload = _prepare_resumo_for_upload(gdf_resumo)

    if dry_run:
        log.info(
            "DRY RUN — sem upload. Prontos: classes=%d, resumo=%d",
            len(df_classes), len(gdf_resumo_upload),
        )
        return len(df_classes)

    # ── 4. Upload Supabase ───────────────────────────────────────────────────
    from core.uploader import upload_geodataframe, upload_json

    log.info("Enviando ap_classes_municipio (%d registros)...", len(df_classes))
    upload_json(
        data         = df_classes.to_dict("records"),
        table        = "ap_classes_municipio",
        conflict_col = "municipio_cod,classe_prioridade,ano_prodes",
    )

    log.info("Enviando ap_municipios_resumo (%d registros)...", len(gdf_resumo_upload))
    upload_geodataframe(
        gdf          = gdf_resumo_upload,
        table        = "ap_municipios_resumo",
        conflict_col = "municipio_cod",
    )

    log.info("Upload concluído.")
    return len(df_classes)


# ── Biomassa ──────────────────────────────────────────────────────────────────

def _enrich_biomass(
    gdf_classes: gpd.GeoDataFrame,
    gdf_resumo:  gpd.GeoDataFrame,
    biomass_dir: Path,
    verbose:     bool,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """
    Calcula AGB médio por (municipio_cod × classe_prioridade) usando geometrias
    de interseção (mais preciso que média municipal) com rasterstats.

    Estratégia:
      - zonal_stats(gdf_classes.geometry, agb.tif) → agb_medio_tc_ha por célula
      - biomassa_total_tc = agb_medio × area_floresta_ha
      - Para resumo: agb_medio ponderado por area_floresta + biomassa_floresta_tc = soma

    Se rasters indisponíveis, mantém colunas como None (sem erro).
    """
    try:
        import rasterio
        from rasterstats import zonal_stats
    except ImportError:
        log.warning("rasterstats não instalado — biomassa será None.")
        return gdf_classes, gdf_resumo

    agb_path = biomass_dir / "agb.tif"
    if not agb_path.exists():
        log.warning("agb.tif não encontrado em %s — biomassa será None.", biomass_dir)
        return gdf_classes, gdf_resumo

    # Verificar todos os rasters disponíveis
    biomass_files: dict[str, Path] = {}
    for key in ("agb", "bgb", "dw", "litter"):
        p = biomass_dir / f"{key}.tif"
        if p.exists():
            biomass_files[key] = p

    if not biomass_files:
        log.warning("Nenhum raster de biomassa disponível.")
        return gdf_classes, gdf_resumo

    if verbose:
        log.info(
            "Zonal stats sobre %d geometrias de interseção | rasters: %s",
            len(gdf_classes), list(biomass_files),
        )

    # Reprojetar para CRS do raster de biomassa (geralmente EPSG:4326)
    with rasterio.open(str(agb_path)) as src:
        bio_epsg = src.crs.to_epsg()

    gdf_work = gdf_classes.copy()
    if gdf_work.crs.to_epsg() != bio_epsg:
        gdf_work = gdf_work.to_crs(bio_epsg)

    # AGB médio por célula (interseção classe × município)
    stats_agb = zonal_stats(
        vectors = gdf_work.geometry.tolist(),
        raster  = str(agb_path),
        stats   = ["mean"],
        nodata  = -9999,
    )
    agb_values = [s.get("mean") or 0.0 for s in stats_agb]

    # Somar todos os reservatórios (AGB+BGB+DW+Litter) para biomassa total
    total_values = list(agb_values)  # começa com AGB
    for key, path in biomass_files.items():
        if key == "agb":
            continue
        stats = zonal_stats(
            vectors = gdf_work.geometry.tolist(),
            raster  = str(path),
            stats   = ["mean"],
            nodata  = -9999,
        )
        for i, s in enumerate(stats):
            total_values[i] += (s.get("mean") or 0.0)

    # Aplicar na tabela de classes
    gdf_classes = gdf_classes.copy()
    gdf_classes["agb_medio_tc_ha"] = [round(v, 3) for v in agb_values]
    gdf_classes["biomassa_total_tc"] = [
        round(total_values[i] * float(row["area_floresta_ha"]), 4)
        for i, (_, row) in enumerate(gdf_classes.iterrows())
    ]

    # Agregar para o resumo municipal
    # AGB médio ponderado por area_floresta_ha
    agg_bio = (
        gdf_classes[gdf_classes["area_floresta_ha"] > 0]
        .groupby("municipio_cod")
        .apply(
            lambda df: pd.Series({
                "biomassa_floresta_tc": round(df["biomassa_total_tc"].sum(), 4),
                "agb_medio_tc_ha": round(
                    (df["agb_medio_tc_ha"] * df["area_floresta_ha"]).sum()
                    / df["area_floresta_ha"].sum(),
                    3,
                ) if df["area_floresta_ha"].sum() > 0 else 0.0,
            })
        )
        .reset_index()
    )

    gdf_resumo = gdf_resumo.copy()
    gdf_resumo = gdf_resumo.drop(
        columns=["biomassa_floresta_tc", "agb_medio_tc_ha"], errors="ignore"
    )
    gdf_resumo = gdf_resumo.merge(agg_bio, on="municipio_cod", how="left")
    gdf_resumo["biomassa_floresta_tc"] = gdf_resumo["biomassa_floresta_tc"].fillna(0.0)
    gdf_resumo["agb_medio_tc_ha"]      = gdf_resumo["agb_medio_tc_ha"].fillna(0.0)

    log.info(
        "Biomassa calculada: %d células | biomassa total PI: %.0f tC",
        len(gdf_classes),
        gdf_resumo["biomassa_floresta_tc"].sum(),
    )
    return gdf_classes, gdf_resumo


# ── Preparação para upload ────────────────────────────────────────────────────

def _prepare_classes_for_upload(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Remove geometria (não necessária nesta tabela) e normaliza tipos.
    Inclui prioridade_label para tabela Supabase.
    """
    df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))

    # Colunas numéricas
    numeric_cols = [
        "area_total_ha", "area_floresta_ha", "area_desmat_ha",
        "area_nao_floresta_ha", "pct_floresta", "pct_desmat",
        "ha_deter_recente", "agb_medio_tc_ha", "biomassa_total_tc",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").round(4)

    # Garantir prioridade_label
    if "prioridade_label" not in df.columns:
        _LABELS = {1: "Muito Baixo", 2: "Baixo", 3: "Médio", 4: "Alto", 5: "Muito Alto"}
        df["prioridade_label"] = df["classe_prioridade"].map(_LABELS)

    # Coluna uf (garantir)
    if "uf" not in df.columns:
        df["uf"] = "PI"

    # None onde NaN
    df = df.where(pd.notnull(df), other=None)
    return df


def _prepare_resumo_for_upload(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reprojetar para EPSG:4326, serializar bbox, normalizar tipos."""
    gdf = gdf.copy()

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(_CRS_UPLOAD)

    # bbox como lista para JSONB do Supabase
    gdf["bbox"] = gdf.geometry.apply(
        lambda g: [[g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]]
        if g is not None and not g.is_empty else None
    )

    # Normalizar colunas numéricas
    float_cols = [
        "area_total_ha", "area_floresta_ha", "area_desmat_ha",
        "pct_floresta_estado", "biomassa_floresta_tc", "agb_medio_tc_ha",
        "ha_deter_recente",
    ]
    for col in float_cols:
        if col in gdf.columns:
            gdf[col] = pd.to_numeric(gdf[col], errors="coerce").round(4)

    # None onde NaN (include="object" + "string" — Pandas 4 compat)
    for col in gdf.select_dtypes(include=["object", "string"]).columns:
        if col != "geometry":
            gdf[col] = gdf[col].where(pd.notnull(gdf[col]), other=None)

    return gdf
