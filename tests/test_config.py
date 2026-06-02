"""Testes para core/config.py — resolução de paths externos.

Achado A5 da auditoria GIS 2026-06-02.

Garante que:
  - Override via env var tem precedência sobre default.
  - Default sai do caminho histórico CGEO/SEMARH-PI quando env ausente.
  - Helpers retornam Path (não str) e respeitam REDD_DATA_ROOT.
  - Caminhos internos (cache, repo) independem de REDD_DATA_ROOT.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from core import config as cfg


# ── data_root_external ────────────────────────────────────────────────────

def test_data_root_default_quando_env_ausente(monkeypatch):
    monkeypatch.delenv("REDD_DATA_ROOT", raising=False)
    assert cfg.data_root_external() == Path("C:/11. REDD+")


def test_data_root_respeita_env_override(monkeypatch):
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    assert cfg.data_root_external() == Path("/srv/redd")


def test_data_root_ignora_env_vazio(monkeypatch):
    """String vazia deve ser tratada como ausência → default."""
    monkeypatch.setenv("REDD_DATA_ROOT", "")
    assert cfg.data_root_external() == Path("C:/11. REDD+")


def test_data_root_strip_whitespace(monkeypatch):
    monkeypatch.setenv("REDD_DATA_ROOT", "  /srv/redd  ")
    assert cfg.data_root_external() == Path("/srv/redd")


# ── Helpers específicos ──────────────────────────────────────────────────

def test_classes_gpkg_deriva_do_root(monkeypatch):
    monkeypatch.delenv("REDD_CLASSES_GPKG", raising=False)
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    assert cfg.classes_prioritarias_gpkg() == Path(
        "/srv/redd/16_prioridade_classes_final/classes_prioritarias.gpkg"
    )


def test_classes_gpkg_override_individual(monkeypatch):
    """Override específico vence sobre derivação do root."""
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    monkeypatch.setenv("REDD_CLASSES_GPKG", "/alt/classes.gpkg")
    assert cfg.classes_prioritarias_gpkg() == Path("/alt/classes.gpkg")


def test_forest_mask_tif_deriva_do_root(monkeypatch):
    monkeypatch.delenv("REDD_FOREST_MASK_TIF", raising=False)
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    assert cfg.forest_mask_tif() == Path(
        "/srv/redd/Forest_mask/Forest_mask/Mascara_de_floresta_2025.tif"
    )


def test_biomass_dir_deriva_do_root(monkeypatch):
    monkeypatch.delenv("REDD_BIOMASS_DIR", raising=False)
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    assert cfg.biomass_rasters_dir() == Path("/srv/redd/Biomass_rasters/Biomass_rasters")


def test_queimadas_raw_dir_deriva_do_root(monkeypatch):
    monkeypatch.delenv("REDD_QUEIMADAS_RAW_DIR", raising=False)
    monkeypatch.setenv("REDD_DATA_ROOT", "/srv/redd")
    assert cfg.queimadas_raw_dir() == Path("/srv/redd/Focos de Queimadas/raw")


# ── Caminhos internos (independem de REDD_DATA_ROOT) ─────────────────────

def test_repo_root_e_caminho_real():
    root = cfg.repo_root()
    assert root.is_dir()
    # `core/` deve existir dentro do repo
    assert (root / "core").is_dir()
    assert (root / "core" / "config.py").is_file()


def test_areas_prioritarias_cache_e_dentro_do_repo(monkeypatch):
    """Cache de municipios é interno ao repo, não muda com REDD_DATA_ROOT."""
    monkeypatch.setenv("REDD_DATA_ROOT", "/totalmente/diferente")
    cache = cfg.areas_prioritarias_cache_dir()
    assert cache == cfg.repo_root() / "data" / "raw" / "areas_prioritarias"


# ── Manifests devem importar sem erro ────────────────────────────────────

def test_manifest_areas_prioritarias_importa():
    """Manifest deve resolver paths via config sem erro de import."""
    from modules.areas_prioritarias.manifest import MODULE_MANIFEST
    ld = MODULE_MANIFEST["local_data"]
    assert isinstance(ld["priority_classes"], Path)
    assert isinstance(ld["forest_mask_tif"], Path)
    assert isinstance(ld["biomass_dir"], Path)


def test_manifest_queimadas_bdq_importa():
    from modules.queimadas_bdq.manifest import MODULE_MANIFEST
    ld = MODULE_MANIFEST["local_data"]
    assert isinstance(ld["raw_dir"], Path)
    assert isinstance(ld["priority_classes"], Path)


# ── Smoke: nenhum hardcode de C:/11. fora de core/config ──────────────────

def test_no_hardcoded_paths_in_modules():
    """A5 — garantia estrutural: módulos não podem hardcodar C:/11.

    Bloqueia regressões futuras. Se um colaborador adicionar
    `Path("C:/11. REDD+/...")` em qualquer módulo, este teste falha.
    """
    import re
    root = cfg.repo_root()
    pattern = re.compile(r"C:[/\\]+11\.")
    offenders: list[str] = []
    for py_path in (root / "modules").rglob("*.py"):
        if "__pycache__" in py_path.parts:
            continue
        text = py_path.read_text(encoding="utf-8")
        if pattern.search(text):
            offenders.append(str(py_path.relative_to(root)))
    assert not offenders, (
        f"Paths hardcoded C:/11. encontrados em: {offenders}\n"
        "Use core.config helpers (classes_prioritarias_gpkg, etc.) "
        "ou adicione novo helper se necessário."
    )
