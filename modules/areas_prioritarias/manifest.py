"""
Módulo: areas_prioritarias
Programa Jurisdicional REDD+ Piauí

Cruzamento PRODES 2025 × 5 classes de prioridade (GPKG vetorial)
→ quantificação de área (ha) por município × classe.
Enriquecido com biomassa AGB via rasterstats.

Segue contrato ADR-003 (_template/manifest.py).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

# Caminho absoluto raiz do repositório (independente do cwd)
_ROOT = Path(__file__).resolve().parent.parent.parent

MODULE_MANIFEST: dict[str, Any] = {
    # ── Identidade ──────────────────────────────────────────
    "id":          "areas_prioritarias",
    "name":        "Áreas Prioritárias REDD+",
    "version":     "1.0.0",
    "description": (
        "Cruzamento vetorial PRODES 2025 × 5 classes de prioridade (GPKG) "
        "para quantificação de área de floresta remanescente e desmatamento "
        "por município do Piauí. Enriquecido com biomassa AGB (tC/ha) via "
        "rasterstats. Pipeline: gpd.overlay() em vez de pixel-counting."
    ),

    # ── UI ──────────────────────────────────────────────────
    "icon":            "🌿",
    "frontend_module": "areas_prioritarias",
    "tags":            ["redd+", "prioridade", "desmatamento", "cerrado", "piaui"],

    # ── Orquestração ────────────────────────────────────────
    "schedule": None,   # manual — acionar via Prefect UI ou CLI
    "priority": 20,     # executa após módulos base (municipios_ibge=10)
    "enabled":  True,

    # ── Outputs (tabelas Supabase que este módulo escreve) ──
    "outputs": [
        "ap_classes_municipio",
        "ap_municipios_resumo",
        "ap_execucoes",
    ],

    # ── Dados locais necessários ────────────────────────────
    # Todos os caminhos são absolutos e independentes do cwd.
    # Executar vectorize_forest.py antes da primeira execução do pipeline.
    "local_data": {
        # 5 classes de prioridade AHP (MultiPolygon, ESRI:102033)
        "priority_classes": Path(
            "C:/11. REDD+/16_prioridade_classes_final/classes_prioritarias.gpkg"
        ),
        # Máscara florestal 2025 — TIF original (valor 100 = floresta)
        # Usado via rasterstats — NÃO precisa vetorizar antes
        "forest_mask_tif": Path(
            "C:/11. REDD+/Forest_mask/Forest_mask/Mascara_de_floresta_2025.tif"
        ),
        # Rasters de biomassa (AGB, BGB, DW, Litter) — usados via rasterstats
        "biomass_dir": Path(
            "C:/11. REDD+/Biomass_rasters/Biomass_rasters"
        ),
        # PRODES 2022-2025 pré-classificado (local — não baixar via WFS)
        "prodes_geojson": Path(
            "C:/9.1 Monitoramento de Alertas de Desmatamento"
            "/PRODES/Resultado/prodes_classificados.geojson"
        ),
    },
}


def run(config: dict[str, Any]) -> dict[str, Any]:
    """
    Entry point do módulo. Chamado pelo Orchestrator.

    Parâmetros esperados em config:
        dry_run       (bool): se True, processa mas não faz upload. Default False.
        ano           (int) : ano PRODES a processar. Default 2025.
        verbose       (bool): log detalhado. Default False.
        skip_download (bool): pula download de municípios se já existirem. Default False.

    Retorna dict com status da execução.
    """
    import time
    from modules.areas_prioritarias.downloader  import download
    from modules.areas_prioritarias.processor   import process
    from modules.areas_prioritarias.calculator  import calculate_and_upload

    t0 = time.perf_counter()

    ano     = int(config.get("ano", 2025))
    dry_run = bool(config.get("dry_run", False))
    verbose = bool(config.get("verbose", False))
    skip_dl = bool(config.get("skip_download", False))

    dest_dir   = _ROOT / "data" / "raw" / "areas_prioritarias"
    local_data = MODULE_MANIFEST["local_data"]

    # Validar dados locais obrigatórios
    prodes_path = local_data["prodes_geojson"]
    if not prodes_path.exists():
        return {
            "status": "erro",
            "erro":   f"PRODES local não encontrado: {prodes_path}",
            "duracao_segundos": 0,
        }

    if not local_data["forest_mask_tif"].exists():
        return {
            "status": "erro",
            "erro": (
                f"Máscara florestal TIF não encontrada: {local_data['forest_mask_tif']}"
            ),
            "duracao_segundos": 0,
        }

    try:
        # Fase 1 — Download de municípios IBGE (PRODES, classes e biomassa são locais)
        if not skip_dl:
            municipios_path = download(dest_dir, {"verbose": verbose})
        else:
            for _mun in [
                dest_dir / "municipios_piaui_ibge2022.gpkg",
                dest_dir / "PI_Municipios_2022.shp",
            ]:
                if _mun.exists():
                    municipios_path = _mun
                    break
            else:
                raise FileNotFoundError(
                    "Dados de municípios não encontrados. Execute sem --skip_download."
                )

        # Fase 2 — Processamento espacial (vector overlay)
        gdf_classes, gdf_resumo = process(
            municipios_path = municipios_path,
            config          = local_data,
            ano             = ano,
            verbose         = verbose,
        )

        # Fase 3 — Cálculo de biomassa + upload
        total_registros = calculate_and_upload(
            gdf_classes  = gdf_classes,
            gdf_resumo   = gdf_resumo,
            biomass_dir  = local_data["biomass_dir"],
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
