"""modules/municipios_ibge/processor.py — Carrega malha municipal do Piauí."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import geopandas as gpd

from core.spatial_core import fix_geoms

_ROOT = Path(__file__).resolve().parent.parent.parent
_FILE = _ROOT / "base de dados" / "municipios_pi.geojson"

log = logging.getLogger(__name__)


def load(path: Path | None = None) -> Optional[gpd.GeoDataFrame]:
    """Lê a malha municipal. Retorna None se o arquivo não existir."""
    f = Path(path) if path else _FILE
    if not f.exists():
        log.warning("  Malha municipal não encontrada: %s", f)
        return None
    gdf = gpd.read_file(f)
    log.info("  Malha IBGE: %d municípios | CRS: %s", len(gdf), gdf.crs)
    return fix_geoms(gdf, "municipios")
