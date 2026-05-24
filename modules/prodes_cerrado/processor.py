"""modules/prodes_cerrado/processor.py — Corrige geometrias do PRODES."""
from __future__ import annotations

from typing import Optional

import geopandas as gpd

from core.spatial_core import fix_geoms


def process(gdf: Optional[gpd.GeoDataFrame]) -> Optional[gpd.GeoDataFrame]:
    """Corrige geometrias inválidas. Retorna None se gdf for None."""
    if gdf is None:
        return None
    return fix_geoms(gdf, "prodes")
