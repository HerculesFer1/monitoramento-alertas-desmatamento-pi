"""Testes unitários do módulo municipios_ibge."""
from modules.municipios_ibge.processor import _FILE
from modules.municipios_ibge.downloader import _IBGE_URL


def test_processor_file_constant():
    assert "municipios_pi.geojson" in str(_FILE)


def test_downloader_url():
    assert "servicodados.ibge.gov.br" in _IBGE_URL
    assert "22" in _IBGE_URL  # código IBGE do Piauí


def test_manifest_fields():
    from modules.municipios_ibge.manifest import MODULE_MANIFEST
    required = {"id", "name", "version", "description", "enabled", "outputs"}
    assert required <= set(MODULE_MANIFEST)
    assert MODULE_MANIFEST["id"] == "municipios_ibge"
    assert "municipios_pi" in MODULE_MANIFEST["outputs"]
