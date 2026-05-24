"""
pipeline/utils.py — Funções utilitárias puras.

Sem efeitos colaterais, sem I/O, sem dependências internas do pipeline.
Candidatas a testes unitários diretos.
"""
from __future__ import annotations

import re
import time
import unicodedata
from typing import Optional

import pandas as pd

_EXCEL_EPOCH = pd.Timestamp("1899-12-30")
_DATE_FORMATS = (
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%d/%m/%Y",
)


def norm_mun(nome: str) -> str:
    """Normaliza nome de município: remove acentos, lowercase, strip."""
    nfkd = unicodedata.normalize("NFKD", str(nome))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def parse_fonte(s) -> list[str]:
    """Extrai lista de fontes do formato MapBiomas: '{FONTE1,FONTE2}' → ['FONTE1', 'FONTE2']."""
    if not s or pd.isna(s):
        return []
    return [f.strip() for f in re.sub(r"[{}]", "", str(s)).split(",") if f.strip()]


def parse_date_col(series: pd.Series) -> pd.Series:
    """Converte coluna de datas em datetime64, suportando ISO strings e seriais Excel."""
    def _parse(val):
        if pd.isna(val):
            return pd.NaT
        if isinstance(val, (int, float)):
            try:
                return _EXCEL_EPOCH + pd.Timedelta(days=float(val))
            except Exception:
                return pd.NaT
        for fmt in _DATE_FORMATS:
            try:
                return pd.to_datetime(str(val).strip(), format=fmt)
            except Exception:
                pass
        try:
            return pd.to_datetime(str(val))
        except Exception:
            return pd.NaT

    return series.apply(_parse)


def strip_tz(series: pd.Series) -> pd.Series:
    """Remove timezone de uma Series datetime, preservando o valor local."""
    try:
        if hasattr(series.dtype, "tz") and series.dtype.tz is not None:
            return series.dt.tz_localize(None)
    except Exception:
        pass
    return series


def detect_id_col(gdf, candidates: list[str]) -> Optional[str]:
    """Retorna a primeira coluna da lista que existe no GeoDataFrame."""
    return next((c for c in candidates if c in gdf.columns), None)


def elapsed(t0: float) -> str:
    """Formata o tempo decorrido em minutos desde t0 (time.time())."""
    return f"{(time.time() - t0) / 60:.1f}min"
