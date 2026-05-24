"""
Testes template — substitua pelos testes reais do módulo.
Consulte: docs/modules/COMO-CRIAR-MODULO.md (seção 6)
"""
import pytest


def test_placeholder():
    """Remova este teste e adicione os testes reais do módulo."""
    assert True


# Exemplos de testes a implementar:
#
# def test_download_creates_file(tmp_path):
#     from ..downloader import download
#     path = download(tmp_path, config={"dry_run": True})
#     assert path.exists()
#
# def test_process_returns_ok(tmp_path, sample_geojson):
#     from ..processor import process
#     result = process(sample_geojson, config={"dry_run": True})
#     assert result["status"] == "ok"
#     assert result["records"] > 0
#
# def test_run_dry_run():
#     from ..manifest import run
#     result = run({"dry_run": True})
#     assert result["status"] == "ok"
