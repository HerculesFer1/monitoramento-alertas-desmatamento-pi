"""Testes unitários do módulo alertas_mapbiomas."""
import geopandas as gpd
import pandas as pd
from shapely.geometry import Polygon

from modules.alertas_mapbiomas.processor import parse_alertas, build_asv_base


def _make_alert_gdf(n=3, crs="EPSG:5880"):
    geoms = [Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]) for _ in range(n)]
    return gpd.GeoDataFrame(
        {
            "CODEALERTA": [f"AL{i:04d}" for i in range(n)],
            "FONTE":      ["{S2,L8}"] * n,
            "BIOMA":      ["Cerrado"] * n,
            "MUNICIPIO":  ["Teresina"] * n,
            "AREAHA":     [10.0] * n,
            "ANODETEC":   [2024] * n,
            "DATADETEC":  ["2024-06-01"] * n,
            "DTPUBLI":    ["2024-07-01"] * n,
            "VPRESSAO":   ["AGRICULTURE"] * n,
        },
        geometry=geoms,
        crs=crs,
    )


def test_parse_alertas_adds_columns():
    gdf = parse_alertas(_make_alert_gdf())
    assert "fonte_list" in gdf.columns
    assert "matopiba" in gdf.columns
    assert "dias_pub" in gdf.columns


def test_parse_alertas_fonte_list_is_list():
    gdf = parse_alertas(_make_alert_gdf())
    for fl in gdf["fonte_list"]:
        assert isinstance(fl, list)


def test_build_asv_base_empty_input():
    empty = gpd.GeoDataFrame(
        {"status_aut": [], "_status_valido": [], "_dti": [], "_dtf": []},
        geometry=[],
        crs="EPSG:5880",
    )
    result = build_asv_base(empty)
    assert len(result) == 0


def test_manifest_fields():
    from modules.alertas_mapbiomas.manifest import MODULE_MANIFEST
    required = {"id", "name", "version", "description", "enabled", "outputs"}
    assert required <= set(MODULE_MANIFEST)
    assert MODULE_MANIFEST["id"] == "alertas_mapbiomas"
    assert "alertas_classificados" in MODULE_MANIFEST["outputs"]
    assert "agregado_municipios" in MODULE_MANIFEST["outputs"]
    assert MODULE_MANIFEST["priority"] >= 10  # roda por último
