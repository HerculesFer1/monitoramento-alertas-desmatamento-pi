"""modules/asvs_sinaflor/processor.py — Carrega ASVs e corrige geometrias."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from core.spatial_core import fix_geoms

_ROOT = Path(__file__).resolve().parent.parent.parent
_FILE = _ROOT / "base de dados" / "ASVs Emitidas-PI(SINAFLOR+).geojson"


def load() -> gpd.GeoDataFrame:
    """Lê o arquivo ASV baixado e corrige geometrias inválidas."""
    if not _FILE.exists():
        raise FileNotFoundError(f"Arquivo ASV não encontrado: {_FILE}")
    gdf = gpd.read_file(_FILE)
    return fix_geoms(gdf, "asvs")
