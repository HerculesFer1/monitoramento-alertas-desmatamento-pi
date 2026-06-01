"""Testes para validação de CRS no uploader.

Coberto pela FASE 2 da auditoria — achados A1 (CRS sem validação)
e A2 (geom inválida silenciosamente descartada pelo PostGIS).
"""
import pytest
import geopandas as gpd
from shapely.geometry import Polygon

from core.uploader import _ensure_crs_4326


def _gdf(crs):
    return gpd.GeoDataFrame(
        {"id": [1]},
        geometry=[Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])],
        crs=crs,
    )


def test_ensure_crs_4326_passthrough():
    gdf = _gdf(4326)
    result = _ensure_crs_4326(gdf, "t")
    assert result.crs.to_epsg() == 4326


def test_ensure_crs_4326_reproject_from_4674():
    gdf = _gdf(4674)
    result = _ensure_crs_4326(gdf, "t")
    assert result.crs.to_epsg() == 4326


def test_ensure_crs_4326_reproject_from_5880():
    # EPSG:5880 (Brasil Policônico) — válido como CRS de cálculo
    gdf = gpd.GeoDataFrame(
        {"id": [1]},
        geometry=[Polygon([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])],
        crs=5880,
    )
    result = _ensure_crs_4326(gdf, "t")
    assert result.crs.to_epsg() == 4326


def test_ensure_crs_rejects_missing():
    """A1: GDF sem CRS deve abortar, não reprojetar silenciosamente."""
    gdf = gpd.GeoDataFrame(
        {"id": [1]},
        geometry=[Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])],
        crs=None,
    )
    with pytest.raises(ValueError, match="sem CRS"):
        _ensure_crs_4326(gdf, "t")


def test_ensure_crs_rejects_unknown_epsg():
    """CRS exótico (ex: 3857 Web Mercator) não está na lista — deve abortar."""
    gdf = _gdf(3857)
    with pytest.raises(ValueError, match="não está na lista de aceitos"):
        _ensure_crs_4326(gdf, "t")
