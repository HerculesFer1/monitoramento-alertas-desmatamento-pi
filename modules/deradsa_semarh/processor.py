"""modules/deradsa_semarh/processor.py — Carrega DERADSAs e corrige geometrias."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from core.spatial_core import fix_geoms

_ROOT = Path(__file__).resolve().parent.parent.parent
_FILES: dict[int, Path] = {
    2024: _ROOT / "data" / "raw" / "DERADSAs Emitidas[SEMARH-2024].geojson",
    2025: _ROOT / "data" / "raw" / "DERADSAs Emitidas[SEMARH-2025].geojson",
}


def load(ano: int) -> gpd.GeoDataFrame:
    """Lê o arquivo DERADSA de um ano e corrige geometrias. Retorna GDF vazio se ausente."""
    f = _FILES.get(ano)
    if f is None or not f.exists():
        return gpd.GeoDataFrame(geometry=gpd.GeoSeries(dtype="geometry"), crs="EPSG:4326")
    return fix_geoms(gpd.read_file(f), f"deradsa_{ano}")


def load_all() -> dict[int, gpd.GeoDataFrame]:
    """Retorna {ano: GeoDataFrame} para todos os anos configurados."""
    return {ano: load(ano) for ano in _FILES}
