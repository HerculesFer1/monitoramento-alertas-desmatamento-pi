"""
Módulo: queimadas_bdq
Programa Jurisdicional REDD+ Piauí

Cruzamento Cicatrizes AQ1km (BD Queimadas INPE) × 5 classes de prioridade × municípios.
→ área queimada (ha) e contagem de cicatrizes por município × classe × mês.

Fonte de dados:
  BD Queimadas INPE — Área Queimada 1km (AQ1km) Coleção 2
  http://dataserver-coids.inpe.br/queimadas/queimadas/area_queimada/colecao2/shp/

Segue contrato ADR-003 (_template/manifest.py).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent

MODULE_MANIFEST: dict[str, Any] = {
    # ── Identidade ──────────────────────────────────────────
    "id":          "queimadas_bdq",
    "name":        "Cicatrizes de Queimadas BD-Queimadas INPE",
    "version":     "1.0.0",
    "description": (
        "Cruzamento vetorial das cicatrizes de queimadas (AQ1km V6 Coleção 2 — "
        "INPE/LASA-UFRJ) com as 5 classes de prioridade AHP e municípios do Piauí. "
        "Quantifica área queimada (ha) e número de cicatrizes por "
        "município × classe × mês para diagnóstico de áreas prioritárias "
        "com maior pressão de fogo."
    ),

    # ── UI ──────────────────────────────────────────────────
    "icon":            "🔥",
    "frontend_module": "queimadas_bdq",
    "tags":            ["redd+", "queimadas", "fogo", "cicatrizes", "prioridade", "piaui"],

    # ── Orquestração ────────────────────────────────────────
    "schedule": None,   # manual — acionar via Prefect UI ou CLI
    "priority": 25,     # executa após areas_prioritarias (priority=20)
    "enabled":  True,

    # ── Outputs (tabelas Supabase que este módulo escreve) ──
    "outputs": [
        "qb_cicatrizes_classes",
        "qb_municipios_resumo",
        "qb_execucoes",
    ],

    # ── Dados locais necessários ────────────────────────────
    "local_data": {
        # Diretório onde os ZIPs/SHPs mensais são salvos pelo downloader
        "raw_dir": Path("C:/11. REDD+/Focos de Queimadas/raw"),

        # Classes de prioridade AHP (mesmo GPKG do módulo areas_prioritarias)
        "priority_classes": Path(
            "C:/11. REDD+/16_prioridade_classes_final/classes_prioritarias.gpkg"
        ),
    },
}


def run(config: dict[str, Any]) -> dict[str, Any]:
    """
    Entry point do módulo. Chamado pelo Orchestrator.

    Parâmetros esperados em config:
        dry_run       (bool): se True, processa mas não faz upload. Default False.
        ano           (int) : ano a processar. Default 2025.
        verbose       (bool): log detalhado. Default False.
        skip_download (bool): pula download se ZIPs já existem. Default False.

    Retorna dict com status da execução.
    """
    import time

    from modules.queimadas_bdq.calculator import calculate_and_upload
    from modules.queimadas_bdq.downloader import download
    from modules.queimadas_bdq.processor import process

    t0 = time.perf_counter()

    ano     = int(config.get("ano", 2025))
    dry_run = bool(config.get("dry_run", False))
    verbose = bool(config.get("verbose", False))
    skip_dl = bool(config.get("skip_download", False))

    local_data = MODULE_MANIFEST["local_data"]
    raw_dir    = local_data["raw_dir"] / str(ano)

    # Validar classes de prioridade
    classes_path = local_data["priority_classes"]
    if not classes_path.exists():
        return {
            "status": "erro",
            "erro":   f"GPKG de classes não encontrado: {classes_path}",
            "duracao_segundos": 0,
        }

    try:
        # Fase 1 — Download mensal BD Queimadas
        shp_paths = download(raw_dir, ano, skip=skip_dl, verbose=verbose)

        # Fase 2 — Processamento espacial
        gdf_classes, gdf_resumo, meta = process(
            shp_paths      = shp_paths,
            classes_path   = classes_path,
            ano            = ano,
            verbose        = verbose,
        )

        # Fase 3 — Upload Supabase
        total_registros = calculate_and_upload(
            gdf_classes = gdf_classes,
            gdf_resumo  = gdf_resumo,
            meta        = meta,
            ano         = ano,
            dry_run     = dry_run,
            verbose     = verbose,
        )

        duracao = round(time.perf_counter() - t0, 2)
        return {
            "status":                "sucesso" if not dry_run else "dry_run",
            "ano":                   ano,
            "total_municipios":      len(gdf_resumo),
            "total_registros":       total_registros,
            "meses_com_dados":       meta.get("meses_com_dados", []),
            "area_queimada_total_ha": meta.get("area_queimada_total_ha", 0.0),
            "duracao_segundos":      duracao,
        }

    except Exception as exc:
        duracao = round(time.perf_counter() - t0, 2)
        return {
            "status":           "erro",
            "erro":             str(exc),
            "duracao_segundos": duracao,
        }
