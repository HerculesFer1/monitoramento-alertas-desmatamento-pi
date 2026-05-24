"""Testes unitários do módulo asvs_sinaflor."""
import pytest
import geopandas as gpd
from shapely.geometry import Polygon

from modules.asvs_sinaflor.processor import _FILE


def test_processor_file_constant():
    """Verifica que a constante de caminho aponta para o diretório correto."""
    assert "base de dados" in str(_FILE)
    assert _FILE.name == "ASVs Emitidas-PI(SINAFLOR+).geojson"


def test_manifest_fields():
    """Verifica que o manifest tem todos os campos obrigatórios."""
    from modules.asvs_sinaflor.manifest import MODULE_MANIFEST
    required = {"id", "name", "version", "description", "enabled", "outputs"}
    assert required <= set(MODULE_MANIFEST)
    assert MODULE_MANIFEST["enabled"] is True
    assert "asvs_sinaflor" in MODULE_MANIFEST["outputs"]
    assert MODULE_MANIFEST["priority"] < 10  # roda antes de alertas_mapbiomas
