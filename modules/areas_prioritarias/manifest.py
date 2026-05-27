"""
Módulo: areas_prioritarias
Programa Jurisdicional REDD+ Piauí

Cruzamento PRODES 2024 × 16 classes de prioridade AHP
→ quantificação de área (ha) por município × classe.

Segue contrato ADR-003 (_template/manifest.py).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

# Caminho absoluto raiz do repositório (independente do cwd)
_ROOT = Path(__file__).resolve().parent.parent.parent

MANIFEST: dict[str, Any] = {
    # ── Identidade ──────────────────────────────────────────
    "id":          "areas_prioritarias",   # snake_case, igual ao nome da pasta
    "name":        "Áreas Prioritárias REDD+",
    "version":     "0.2.0",
    "description": (
        "Cruzamento PRODES 2025 × raster de 16 classes de prioridade AHP "
        "para quantificação de área de vegetação nativa e desmatamento "
        "por município do Piauí. Inclui gap DETER Cerrado (ago/2025–presente)."
    ),

    # ── UI ──────────────────────────────────────────────────
    "icon":           "🌿",
    "frontend_module": "areas_prioritarias",
    "tags":           ["redd+", "prioridade", "desmatamento", "cerrado", "piaui"],

    # ── Orquestração ────────────────────────────────────────
    "schedule": None,           # manual — acionar via Prefect UI ou CLI
    "priority": 20,             # executa após módulos base (municipios_ibge=10)
    "enabled":  True,           # QA validado 2026-05-27 — dados 2025 populados

    # ── Outputs (tabelas Supabase que este módulo escreve) ──
    "outputs": [
        "ap_classes_municipio",
        "ap_municipios_resumo",
        "ap_execucoes",
    ],

    # ── Dados locais necessários ────────────────────────────
    "local_data": {
        "priority_raster": _ROOT / "data" / "raw" / "areas_prioritarias" / "16_prioridade_classes_final.tif",
        "forest_mask":     _ROOT / "data" / "raw" / "areas_prioritarias" / "Mascara_de_floresta_2025.tif",
        "biomass_dir":     _ROOT / "data" / "raw" / "areas_prioritarias" / "biomass",
    },
}


def run(config: dict[str, Any]) -> dict[str, Any]:
    """
    Entry point do módulo. Chamado pelo Orchestrator.

    Parâmetros esperados em config:
        dry_run  (bool)  : se True, processa mas não faz upload. Default False.
        ano      (int)   : ano PRODES a baixar e processar. Default 2024.
        verbose  (bool)  : log detalhado. Default False.
        skip_download (bool): pula download se dados já existem. Default False.

    Retorna dict com status da execução.
    """
    import time
    from modules.areas_prioritarias.downloader  import download
    from modules.areas_prioritarias.processor   import process
    from modules.areas_prioritarias.calculator  import calculate_and_upload

    t0 = time.perf_counter()

    ano          = int(config.get("ano", 2025))
    dry_run      = bool(config.get("dry_run", False))
    verbose      = bool(config.get("verbose", False))
    skip_dl      = bool(config.get("skip_download", False))

    dest_dir = _ROOT / "data" / "raw" / "areas_prioritarias"

    try:
        # Fase 1 — Download
        if not skip_dl:
            prodes_path, municipios_path = download(dest_dir, {"ano": ano, "verbose": verbose})
        else:
            prodes_path = dest_dir / f"prodes_{ano}_piaui.geojson"
            # Aceita gpkg ou shapefile (dependendo do que o IBGE disponibiliza no zip)
            for _mun in [
                dest_dir / "municipios_piaui_ibge2022.gpkg",
                dest_dir / "PI_Municipios_2022.shp",
            ]:
                if _mun.exists():
                    municipios_path = _mun
                    break
            else:
                raise FileNotFoundError(
                    "Dados de municípios não encontrados. Execute sem skip_download."
                )

        # Fase 2 — Processamento espacial
        gdf_classes, gdf_resumo = process(
            prodes_path     = prodes_path,
            municipios_path = municipios_path,
            config          = MANIFEST["local_data"],
            ano             = ano,
            verbose         = verbose,
        )

        # Fase 3 — Cálculo de biomassa + upload
        total_registros = calculate_and_upload(
            gdf_classes  = gdf_classes,
            gdf_resumo   = gdf_resumo,
            biomass_dir  = MANIFEST["local_data"]["biomass_dir"],
            ano          = ano,
            dry_run      = dry_run,
            verbose      = verbose,
        )

        duracao = round(time.perf_counter() - t0, 2)
        return {
            "status":           "sucesso" if not dry_run else "dry_run",
            "ano_prodes":       ano,
            "total_municipios": len(gdf_resumo),
            "total_registros":  total_registros,
            "duracao_segundos": duracao,
        }

    except Exception as exc:
        duracao = round(time.perf_counter() - t0, 2)
        return {
            "status":           "erro",
            "erro":             str(exc),
            "duracao_segundos": duracao,
        }
