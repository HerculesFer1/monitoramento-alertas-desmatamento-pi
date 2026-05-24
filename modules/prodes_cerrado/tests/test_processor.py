"""Testes unitários do módulo prodes_cerrado."""
from modules.prodes_cerrado.processor import process
from modules.prodes_cerrado.downloader import _FILE


def test_process_none_returns_none():
    """process(None) deve retornar None (sem arquivo PRODES disponível)."""
    assert process(None) is None


def test_downloader_file_constant():
    assert "PRODES_Cerrado_PI.geojson" in str(_FILE)


def test_manifest_fields():
    from modules.prodes_cerrado.manifest import MODULE_MANIFEST
    required = {"id", "name", "version", "description", "enabled", "outputs"}
    assert required <= set(MODULE_MANIFEST)
    assert MODULE_MANIFEST["id"] == "prodes_cerrado"
    assert "prodes_cerrado" in MODULE_MANIFEST["outputs"]
