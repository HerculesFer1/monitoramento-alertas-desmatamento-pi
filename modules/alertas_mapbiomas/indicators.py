"""pipeline/indicators.py — Etapa 7: rename de colunas, reincidência e schema de saída."""
from __future__ import annotations

import logging

import pandas as pd
import geopandas as gpd

log = logging.getLogger(__name__)

_COL_MAP: dict[str, str] = {
    "CODEALERTA": "codealerta",
    "BIOMA":      "bioma",
    "MUNICIPIO":  "municipio",
    "ANODETEC":   "ano",
    "VPRESSAO":   "vpressao",
    "DATADETEC":  "datadetec",
    "dias_pub":   "dias_ate_publicacao",
}

# Ordem canônica das colunas do schema alertas_classificados.geojson
_SCHEMA: list[str] = [
    "id_fragmento", "codealerta",
    "classificacao", "pct_cobertura", "fonte_classificacao",
    "instrumento_ref", "data_validade_instrumento",
    "ano", "bioma", "municipio",
    "area_ha", "area_original_ha",
    "vpressao", "vpressao_ptbr", "fonte_list",
    "datadetec", "dias_ate_publicacao",
    "matopiba", "reincidente",
    "ano_prodes_ref", "concordancia_prodes_pct", "flag_validacao_externa",
    "geometry",
]


def apply_indicators(gdf_out: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Rename de colunas brutas, calcula reincidência e aplica schema canônico."""
    gdf_out = gdf_out.rename(columns={k: v for k, v in _COL_MAP.items() if k in gdf_out.columns})

    irr_anos = (
        gdf_out[gdf_out["classificacao"] == "IRREGULAR"]
        .groupby("municipio")["ano"].nunique()
    )
    reincidentes = set(irr_anos[irr_anos >= 3].index)
    gdf_out["reincidente"] = gdf_out["municipio"].isin(reincidentes)
    log.info("  Municípios reincidentes (≥3 anos IRREGULAR): %s", sorted(reincidentes))

    if "dias_ate_publicacao" in gdf_out.columns:
        def_media = gdf_out.groupby("ano")["dias_ate_publicacao"].apply(
            lambda s: pd.to_numeric(s, errors="coerce").mean()
        ).round(1).to_dict()
        log.info("  Defasagem média publicação (dias): %s", def_media)

    for c in _SCHEMA:
        if c not in gdf_out.columns:
            gdf_out[c] = None
    return gdf_out[[c for c in _SCHEMA if c in gdf_out.columns]]
