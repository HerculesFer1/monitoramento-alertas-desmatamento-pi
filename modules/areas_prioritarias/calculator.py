"""
calculator.py — Módulo areas_prioritarias
Enriquecimento com biomassa + cálculo de pct_floresta_estado + upload Supabase.

Responsabilidades:
  1. Zonal stats de biomassa (AGB+BGB+DW+litter) por município × classe
  2. Calcular pct_floresta_estado (% da floresta total do PI)
  3. Preparar geometrias para upload (EPSG:4326)
  4. Upload para Supabase via core/uploader.py

Stateless — sem efeitos colaterais além do upload ao Supabase.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import geopandas as gpd
import pandas as pd

log = logging.getLogger(__name__)

_CRS_UPLOAD = "EPSG:4326"


def calculate_and_upload(
    gdf_classes:  gpd.GeoDataFrame,
    gdf_resumo:   gpd.GeoDataFrame,
    biomass_dir:  Path,
    ano:          int  = 2024,
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
    total_floresta_estado = gdf_resumo["area_floresta_ha"].sum()
    if total_floresta_estado > 0:
        gdf_resumo["pct_floresta_estado"] = (
            gdf_resumo["area_floresta_ha"] / total_floresta_estado * 100
        ).round(2)
    else:
        gdf_resumo["pct_floresta_estado"] = 0.0

    log.info(
        "Floresta total Piauí: %.2f ha | Municípios: %d",
        total_floresta_estado, len(gdf_resumo),
    )

    # ── 3. Preparar para upload ──────────────────────────────────────────────
    df_classes = _prepare_classes_for_upload(gdf_classes)
    gdf_resumo_upload = _prepare_resumo_for_upload(gdf_resumo)

    if dry_run:
        log.info(
            "DRY RUN — sem upload. Registros prontos: classes=%d, resumo=%d",
            len(df_classes), len(gdf_resumo_upload),
        )
        return len(df_classes)

    # ── 4. Upload Supabase ───────────────────────────────────────────────────
    from core.uploader import upload_json, upload_geodataframe, registrar_execucao

    log.info("Enviando ap_classes_municipio (%d registros)...", len(df_classes))
    upload_json(
        data         = df_classes.to_dict("records"),
        table        = "ap_classes_municipio",
        conflict_col = "municipio_cod",
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
    Calcula médias de AGB por (municipio_cod, classe_prioridade)
    e biomassa total por município usando rasterstats.

    Se rasters de biomassa não estiverem disponíveis, mantém colunas como None.
    """
    try:
        from rasterstats import zonal_stats
        import rasterio
    except ImportError:
        log.warning("rasterstats não instalado — biomassa será None.")
        return gdf_classes, gdf_resumo

    agb_path = biomass_dir / "agb.tif"
    if not agb_path.exists():
        log.warning("agb.tif não encontrado em %s — biomassa será None.", biomass_dir)
        return gdf_classes, gdf_resumo

    # Biomassa total = AGB + BGB + DW + litter (tC/ha médio por pixel floresta)
    biomass_files = {
        "agb":    biomass_dir / "agb.tif",
        "bgb":    biomass_dir / "bgb.tif",
        "dw":     biomass_dir / "dw.tif",
        "litter": biomass_dir / "litter.tif",
    }

    # Verificar quais rasters existem
    available = {k: v for k, v in biomass_files.items() if v.exists()}
    if not available:
        log.warning("Nenhum raster de biomassa disponível.")
        return gdf_classes, gdf_resumo

    if verbose:
        log.info("Calculando zonal stats de biomassa para %d municípios...", len(gdf_resumo))

    # Reprojetar resumo para CRS do raster de biomassa
    with rasterio.open(agb_path) as src:
        bio_crs = src.crs.to_epsg()

    gdf_work = gdf_resumo.copy()
    if gdf_work.crs.to_epsg() != bio_crs:
        gdf_work = gdf_work.to_crs(bio_crs)

    # AGB médio por município (sobre todos os pixels dentro do polígono)
    stats_agb = zonal_stats(
        vectors  = gdf_work.geometry,
        raster   = str(agb_path),
        stats    = ["mean"],
        nodata   = -9999,
    )

    agb_by_mun = {
        gdf_work.iloc[i]["municipio_cod"]: (s["mean"] or 0.0)
        for i, s in enumerate(stats_agb)
    }

    # Somar todos os reservatórios para biomassa total
    total_by_mun: dict[str, float] = {k: v for k, v in agb_by_mun.items()}
    for key, path in available.items():
        if key == "agb":
            continue
        stats = zonal_stats(
            vectors = gdf_work.geometry,
            raster  = str(path),
            stats   = ["mean"],
            nodata  = -9999,
        )
        for i, s in enumerate(stats):
            cod = gdf_work.iloc[i]["municipio_cod"]
            total_by_mun[cod] = total_by_mun.get(cod, 0.0) + (s["mean"] or 0.0)

    # Aplicar na tabela de classes (agb_medio = média do município para a classe)
    gdf_classes = gdf_classes.copy()
    gdf_classes["agb_medio_tc_ha"] = gdf_classes["municipio_cod"].map(
        lambda cod: round(agb_by_mun.get(cod, 0.0), 3)
    )
    gdf_classes["biomassa_total_tc"] = gdf_classes.apply(
        lambda row: round(
            total_by_mun.get(row["municipio_cod"], 0.0) * row["area_floresta_ha"], 4
        ),
        axis=1,
    )

    # Aplicar no resumo
    gdf_resumo = gdf_resumo.copy()
    gdf_resumo["biomassa_floresta_tc"] = gdf_resumo["municipio_cod"].map(
        lambda cod: round(total_by_mun.get(cod, 0.0) * agb_by_mun.get(cod, 0.0), 4)
    )

    log.info("Biomassa calculada para %d municípios.", len(agb_by_mun))
    return gdf_classes, gdf_resumo


# ── Preparação para upload ────────────────────────────────────────────────────

def _prepare_classes_for_upload(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """Remove geometria (não necessária nesta tabela) e limpa tipos."""
    df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))

    # Garantir tipos corretos
    numeric_cols = [
        "area_total_ha", "area_floresta_ha", "area_desmat_ha",
        "area_nao_floresta_ha", "pct_floresta", "pct_desmat",
        "agb_medio_tc_ha", "biomassa_total_tc",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").round(4)

    # None onde NaN
    df = df.where(pd.notnull(df), other=None)
    return df


def _prepare_resumo_for_upload(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reprojetar para EPSG:4326 e serializar bbox como lista JSON."""
    gdf = gdf.copy()

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(_CRS_UPLOAD)

    # bbox como lista para JSONB do Supabase
    gdf["bbox"] = gdf.geometry.apply(
        lambda g: [[g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]]
        if g is not None else None
    )

    # Limpar NaN
    float_cols = [
        "area_total_ha", "area_floresta_ha", "area_desmat_ha",
        "pct_floresta_estado", "biomassa_floresta_tc",
    ]
    for col in float_cols:
        if col in gdf.columns:
            gdf[col] = pd.to_numeric(gdf[col], errors="coerce").round(4)

    return gdf
