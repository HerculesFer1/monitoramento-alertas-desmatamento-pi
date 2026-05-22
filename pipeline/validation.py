"""pipeline/validation.py — Validação cruzada PRODES-Cerrado (Etapa 4-B)."""
from __future__ import annotations

import logging

import geopandas as gpd
import numpy as np
import pandas as pd

from .constants import (
    CONCORDANCIA_PRODES_MIN_PCT,
    FLAG_CONCORDANTE,
    FLAG_DADOS_PENDENTES,
    FLAG_DISCORDANTE,
    FLAG_NAO_DISPONIVEL_CAA,
    FLAG_SEM_PRODES,
)

log = logging.getLogger(__name__)


def run_prodes_validation(
    gdf_al: gpd.GeoDataFrame,
    gdf_prodes: gpd.GeoDataFrame | None,
) -> gpd.GeoDataFrame:
    """Etapa 4-B: cruza alertas Cerrado com polígonos PRODES por ciclo anual."""
    cerrado_mask = gdf_al["BIOMA"].str.strip().str.lower() == "cerrado"
    n_cerrado = int(cerrado_mask.sum())
    log.info("  Alertas Cerrado: %d | Caatinga: %d", n_cerrado, len(gdf_al) - n_cerrado)

    gdf_al = gdf_al.copy()
    gdf_al["ano_prodes_ref"]          = None
    gdf_al["concordancia_prodes_pct"] = np.nan
    gdf_al["flag_validacao_externa"]  = FLAG_NAO_DISPONIVEL_CAA
    gdf_al.loc[cerrado_mask, "flag_validacao_externa"] = FLAG_DADOS_PENDENTES

    def _ciclo(dt):
        if pd.isna(dt):
            return None
        ts = pd.Timestamp(dt)
        return ts.year + 1 if ts.month >= 8 else ts.year

    gdf_al.loc[cerrado_mask, "ano_prodes_ref"] = (
        gdf_al.loc[cerrado_mask, "DATADETEC"].apply(_ciclo)
    )

    if gdf_prodes is None:
        log.warning("  PRODES não disponível — alertas Cerrado mantidos como DADOS_PENDENTES")
        return gdf_al

    prodes_ano_col = next(
        (c for c in ["ano", "year", "ano_ciclo", "ANO", "YEAR"] if c in gdf_prodes.columns),
        None,
    )
    cycles = sorted(gdf_al.loc[cerrado_mask, "ano_prodes_ref"].dropna().unique().astype(int))
    log.info("  Ciclos PRODES a processar: %s", cycles)

    for cycle in cycles:
        mask_cycle = cerrado_mask & (gdf_al["ano_prodes_ref"] == cycle)
        n_cycle = int(mask_cycle.sum())
        if n_cycle == 0:
            continue

        prodes_cycle = (
            gdf_prodes[gdf_prodes[prodes_ano_col] == cycle] if prodes_ano_col else gdf_prodes
        )
        if prodes_cycle.empty:
            gdf_al.loc[mask_cycle, "flag_validacao_externa"] = FLAG_SEM_PRODES
            log.warning(
                "    Ciclo %d: sem polígonos → %d alertas = SEM_PRODES_NO_CICLO", cycle, n_cycle
            )
            continue

        al_subset = gdf_al.loc[mask_cycle, ["geometry"]].copy()
        al_subset["_idx"] = range(len(al_subset))
        al_areas = al_subset.geometry.area.replace(0, np.nan).values

        try:
            ov = gpd.overlay(
                al_subset[["_idx", "geometry"]],
                prodes_cycle[["geometry"]],
                how="intersection", keep_geom_type=False, make_valid=True,
            )
            if ov.empty:
                pct_arr = np.zeros(len(al_subset))
            else:
                cov_map = ov.groupby("_idx")["geometry"].apply(lambda x: x.area.sum()).to_dict()
                cov_arr = np.array([cov_map.get(i, 0.0) for i in range(len(al_subset))])
                pct_arr = np.clip(np.nan_to_num(cov_arr / al_areas * 100), 0, 100).round(2)
        except Exception as exc:
            log.warning("    Ciclo %d: overlay falhou (%s) — marcando como DISCORDANTE", cycle, exc)
            pct_arr = np.zeros(len(al_subset))

        gdf_al.loc[mask_cycle, "concordancia_prodes_pct"] = pct_arr
        # Limiar configurável: CONCORDANCIA_PRODES_MIN_PCT (padrão 0.0 = qualquer sobreposição).
        # Alterar em constants.py; requer nova execução completa do pipeline.
        concordante = mask_cycle & (gdf_al["concordancia_prodes_pct"] > CONCORDANCIA_PRODES_MIN_PCT)
        gdf_al.loc[concordante, "flag_validacao_externa"]         = FLAG_CONCORDANTE
        gdf_al.loc[~concordante & mask_cycle, "flag_validacao_externa"] = FLAG_DISCORDANTE

        n_conc = int(concordante.sum())
        log.info(
            "    Ciclo %d: %d alertas | Concordante: %d (%.1f%%)",
            cycle, n_cycle, n_conc, n_conc / n_cycle * 100,
        )

    flags = gdf_al.loc[cerrado_mask, "flag_validacao_externa"].value_counts().to_dict()
    log.info("  Resultado PRODES Cerrado: %s", flags)
    return gdf_al
