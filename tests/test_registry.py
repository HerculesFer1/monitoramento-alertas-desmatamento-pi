"""Testes do platform/registry.py — valida descoberta de módulos."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.registry import ModuleRegistry


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_module_dir(tmp_path: Path) -> Path:
    """Cria uma estrutura mínima de módulos para testar o registry."""
    # Módulo habilitado
    mod_a = tmp_path / "mod_alpha"
    mod_a.mkdir()
    (mod_a / "__init__.py").write_text("")
    (mod_a / "manifest.py").write_text(
        'MODULE_MANIFEST = {"id": "mod_alpha", "name": "Alpha", "version": "1.0.0",'
        ' "description": "Teste", "outputs": ["tab_alpha"], "enabled": True,'
        ' "priority": 10}\n\ndef run(config): return {"status": "ok", "records": 1, "message": "ok"}\n'
    )

    # Módulo desabilitado
    mod_b = tmp_path / "mod_beta"
    mod_b.mkdir()
    (mod_b / "__init__.py").write_text("")
    (mod_b / "manifest.py").write_text(
        'MODULE_MANIFEST = {"id": "mod_beta", "name": "Beta", "version": "1.0.0",'
        ' "description": "Desabilitado", "outputs": [], "enabled": False}\n\ndef run(config): pass\n'
    )

    # Pasta _template — deve ser ignorada
    tmpl = tmp_path / "_template"
    tmpl.mkdir()
    (tmpl / "manifest.py").write_text(
        'MODULE_MANIFEST = {"id": "_template", "name": "T", "version": "0.0.0",'
        ' "description": "Template", "outputs": [], "enabled": True}\ndef run(config): pass\n'
    )

    return tmp_path


# ── Testes de descoberta ───────────────────────────────────────────────────────

def test_discover_loads_enabled_modules(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    ids = [m["id"] for m in registry.list()]
    assert "mod_alpha" in ids


def test_discover_ignores_disabled(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    ids = [m["id"] for m in registry.list()]
    assert "mod_beta" not in ids


def test_discover_ignores_template_prefix(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    ids = [m["id"] for m in registry.list()]
    assert "_template" not in ids


def test_discover_missing_dir(tmp_path):
    registry = ModuleRegistry(tmp_path / "nonexistent")
    registry.discover()
    assert registry.list() == []


# ── Testes de get / run ───────────────────────────────────────────────────────

def test_get_returns_module(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    entry = registry.get("mod_alpha")
    assert entry["manifest"]["id"] == "mod_alpha"


def test_get_unknown_raises(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    with pytest.raises(KeyError, match="mod_xyz"):
        registry.get("mod_xyz")


def test_run_returns_ok(fake_module_dir):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    result = registry.run("mod_alpha", {})
    assert result["status"] == "ok"
    assert result["records"] == 1


# ── Testes de export_json ─────────────────────────────────────────────────────

def test_export_json_creates_file(fake_module_dir, tmp_path):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    out = tmp_path / "module-registry.json"
    registry.export_json(out)
    assert out.exists()
    data = json.loads(out.read_text())
    assert isinstance(data, list)
    assert any(m["id"] == "mod_alpha" for m in data)


def test_export_json_excludes_disabled(fake_module_dir, tmp_path):
    registry = ModuleRegistry(fake_module_dir)
    registry.discover()
    out = tmp_path / "module-registry.json"
    registry.export_json(out)
    data = json.loads(out.read_text())
    assert not any(m["id"] == "mod_beta" for m in data)
