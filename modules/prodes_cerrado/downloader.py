"""modules/prodes_cerrado/downloader.py — Lê PRODES-Cerrado do arquivo local."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import geopandas as gpd

_ROOT = Path(__file__).resolve().parent.parent.parent
_FILE = _ROOT / "data" / "raw" / "PRODES_Cerrado_PI.geojson"

log = logging.getLogger(__name__)


def download() -> Optional[gpd.GeoDataFrame]:
    """Retorna GDF com polígonos PRODES-Cerrado, ou None se o arquivo não existir."""
    if not _FILE.exists():
        log.warning("PRODES não encontrado em %s — validação desativada", _FILE)
        return None
    log.info("  Lendo PRODES: %s", _FILE.name)
    gdf = gpd.read_file(_FILE)
    log.info("    → %d features | Colunas: %s", len(gdf), list(gdf.columns))
    return gdf
