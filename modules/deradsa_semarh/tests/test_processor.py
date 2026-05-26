"""Testes unitários do módulo deradsa_semarh."""
import geopandas as gpd

from modules.deradsa_semarh.processor import load


def test_load_returns_empty_for_missing_year():
    """Ano sem arquivo → GeoDataFrame vazio (não levanta exceção)."""
    gdf = load(9999)
    assert isinstance(gdf, gpd.GeoDataFrame)
    assert len(gdf) == 0


def test_manifest_fields():
    from modules.deradsa_semarh.manifest import MODULE_MANIFEST
    required = {"id", "name", "version", "description", "enabled", "outputs"}
    assert required <= set(MODULE_MANIFEST)
    assert MODULE_MANIFEST["id"] == "deradsa_semarh"
    assert "deradsa_semarh" in MODULE_MANIFEST["outputs"]
