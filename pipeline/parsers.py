"""
pipeline/parsers.py — Parsing e enriquecimento dos dados brutos (Etapa 4).

Transforma os GeoDataFrames crus em estruturas prontas para classificação:
campos de data parseados, flags calculadas, colunas normalizadas.
Todas as funções são puras: recebem GDF, retornam GDF enriquecido.
"""
from __future__ import annotations

import logging
from typing import Optional

import geopandas as gpd
import pandas as pd

from .constants import MATOPIBA_PI, STATUS_INVALIDOS_KW, STATUS_VALIDOS_KW, VP_PTBR
from .utils import detect_id_col, norm_mun, parse_date_col, parse_fonte, strip_tz

log = logging.getLogger(__name__)

# Candidatos de ID para ASVs e DERADSAs (ordem de prioridade)
_ASV_ID_CANDIDATES = [
    "nu_autoriz", "numero_ato", "num_ato", "id_asv",
    "cod_ato", "Numero_Ato", "NumeroAto", "objectid", "id",
]
_DER_ID_CANDIDATES = [
    "Id", "id", "ID", "numero_auto", "num_auto",
    "id_deradsa", "NumeroAuto", "cod",
]

# Normalização dos nomes MATOPIBA para lookup rápido
_MATOPIBA_NORM: frozenset[str] = frozenset(norm_mun(m) for m in MATOPIBA_PI)


def parse_alertas(gdf_al: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Parseia e enriquece os alertas MapBiomas.

    Adiciona: fonte_list, DATADETEC (datetime), DTPUBLI (datetime),
    dias_pub, vpressao_ptbr, matopiba (bool), _area_m2_orig.
    """
    gdf = gdf_al.copy()
    gdf["fonte_list"]    = gdf["FONTE"].apply(parse_fonte)
    gdf["DATADETEC"]     = pd.to_datetime(gdf["DATADETEC"], errors="coerce")
    gdf["DTPUBLI"]       = pd.to_datetime(gdf["DTPUBLI"],   errors="coerce")
    gdf["dias_pub"]      = (gdf["DTPUBLI"] - gdf["DATADETEC"]).dt.days
    gdf["vpressao_ptbr"] = (
        gdf["VPRESSAO"].map(VP_PTBR).fillna(gdf["VPRESSAO"].astype(str).fillna(""))
    )
    gdf["matopiba"]      = gdf["MUNICIPIO"].apply(
        lambda x: norm_mun(str(x)) in _MATOPIBA_NORM
    )
    gdf["_area_m2_orig"] = gdf.geometry.area

    n_sem_data = int(gdf["DATADETEC"].isna().sum())
    if n_sem_data:
        log.warning("  %d alertas sem DATADETEC → serão classificados como IRREGULAR", n_sem_data)

    return gdf


def parse_asvs(gdf_asv: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, str | None]:
    """Parseia as ASVs SINAFLOR+.

    Detecta STATUS_VALIDOS automaticamente a partir dos valores presentes.
    Retorna (gdf_enriquecido, coluna_id).
    """
    gdf = gdf_asv.copy()

    all_status = set(gdf["status_aut"].dropna().astype(str).unique())
    log.info("  Status ASV únicos: %s", sorted(all_status))

    # Detecção automática de status válidos
    validos = {s for s in all_status if any(k in s.lower() for k in STATUS_VALIDOS_KW)}
    if not validos:
        # Fallback: tudo que não é explicitamente inválido
        validos = {s for s in all_status if not any(k in s.lower() for k in STATUS_INVALIDOS_KW)}
    log.info("  STATUS_VALIDOS detectados: %s", validos)

    gdf["_status_valido"] = gdf["status_aut"].isin(validos)
    gdf["_dti"]           = strip_tz(parse_date_col(gdf["dt_valid_i"]))
    gdf["_dtf"]           = strip_tz(parse_date_col(gdf["dt_valid_f"]))

    id_col = detect_id_col(gdf, _ASV_ID_CANDIDATES)
    log.info("  Campo ID ASV: %s", id_col or "(índice)")

    return gdf, id_col


def parse_deradsa(
    gdf_der24: gpd.GeoDataFrame,
    gdf_der25: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, str | None]:
    """Parseia as DERADSAs e detecta a coluna de ID.

    Retorna (gdf_der24_parsed, gdf_der25_parsed, coluna_id).
    """
    id_col = detect_id_col(gdf_der24, _DER_ID_CANDIDATES)
    log.info("  Campo ID DERADSA: %s", id_col or "(índice)")
    return gdf_der24, gdf_der25, id_col


def build_asv_base(
    gdf_asv: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Filtra ASVs com status válido e datas completas — base de candidatas."""
    mask_valido = gdf_asv["_status_valido"]
    mask_datas  = gdf_asv["_dti"].notna() & gdf_asv["_dtf"].notna()

    n_desc_st = int((~mask_valido).sum())
    n_desc_dt = int((mask_valido & ~mask_datas).sum())

    log.info("  ASVs descartadas por status inativo  : %d", n_desc_st)
    log.info("  ASVs descartadas por datas ausentes  : %d", n_desc_dt)

    base = gdf_asv[mask_valido & mask_datas].copy()
    log.info("  ASVs candidatas (status + datas OK)  : %d", len(base))
    return base
