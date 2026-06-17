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

import logging
from typing import Any

from core.config import (
    classes_prioritarias_gpkg,
    queimadas_raw_dir,
    repo_root,
)

log = logging.getLogger(__name__)

_ROOT = repo_root()

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
    # Resolvidos por core/config.py (.env REDD_DATA_ROOT).
    "local_data": {
        # Diretório onde os ZIPs/SHPs mensais são salvos pelo downloader
        "raw_dir":           queimadas_raw_dir(),
        # Classes de prioridade AHP (mesmo GPKG do módulo areas_prioritarias)
        "priority_classes":  classes_prioritarias_gpkg(),
    },
}


def _anos_a_processar(config: dict[str, Any]) -> list[int]:
    """
    Resolve a lista de anos a partir do config.
    Aceita (em ordem de precedência):
      - `anos`:       list[int]               — lista explícita
      - `ano_inicio` + `ano_fim`: int + int    — intervalo inclusivo
      - `ano`:        int                     — ano único (compat. retroativa)
      - fallback: [2025]
    """
    anos = config.get("anos")
    if anos:
        return sorted({int(a) for a in anos})

    if "ano_inicio" in config or "ano_fim" in config:
        ini = int(config.get("ano_inicio", 2022))
        fim = int(config.get("ano_fim", 2025))
        if fim < ini:
            ini, fim = fim, ini
        return list(range(ini, fim + 1))

    return [int(config.get("ano", 2025))]


def run(config: dict[str, Any]) -> dict[str, Any]:
    """
    Entry point do módulo. Chamado pelo Orchestrator.

    Parâmetros esperados em config:
        dry_run       (bool):           se True, processa mas não faz upload. Default False.
        anos          (list[int]):      lista explícita de anos a processar.
        ano_inicio    (int):            início do intervalo (default 2022).
        ano_fim       (int):            fim do intervalo (default 2025).
        ano           (int):            ano único (compat. retroativa — default 2025).
        verbose       (bool):           log detalhado. Default False.
        skip_download (bool):           pula download se ZIPs já existem. Default False.

    Cada ano é processado de forma independente — falha em um ano não interrompe
    os demais. O resumo retorna o detalhamento por ano + totais agregados.
    """
    import time

    from modules.queimadas_bdq.calculator import calculate_and_upload
    from modules.queimadas_bdq.downloader import download
    from modules.queimadas_bdq.processor import process

    t0 = time.perf_counter()

    anos    = _anos_a_processar(config)
    dry_run = bool(config.get("dry_run", False))
    verbose = bool(config.get("verbose", False))
    skip_dl = bool(config.get("skip_download", False))

    local_data   = MODULE_MANIFEST["local_data"]
    classes_path = local_data["priority_classes"]
    raw_base     = local_data["raw_dir"]

    if not classes_path.exists():
        return {
            "status": "erro",
            "erro":   f"GPKG de classes não encontrado: {classes_path}",
            "duracao_segundos": 0,
        }

    log.info("Anos a processar: %s | dry_run=%s", anos, dry_run)

    por_ano: list[dict[str, Any]] = []
    n_sucesso = 0
    area_acumulada_ha = 0.0
    registros_acumulados = 0

    for ano in anos:
        t_ano = time.perf_counter()
        raw_dir = raw_base / str(ano)

        try:
            shp_paths = download(raw_dir, ano, skip=skip_dl, verbose=verbose)
            gdf_classes, gdf_resumo, meta = process(
                shp_paths    = shp_paths,
                classes_path = classes_path,
                ano          = ano,
                verbose      = verbose,
            )
            total_registros = calculate_and_upload(
                gdf_classes = gdf_classes,
                gdf_resumo  = gdf_resumo,
                meta        = meta,
                ano         = ano,
                dry_run     = dry_run,
                verbose     = verbose,
            )

            area_ano = float(meta.get("area_queimada_total_ha", 0.0))
            por_ano.append({
                "ano":                    ano,
                "status":                 "sucesso" if not dry_run else "dry_run",
                "total_municipios":       len(gdf_resumo),
                "total_registros":        total_registros,
                "meses_com_dados":        meta.get("meses_com_dados", []),
                "area_queimada_total_ha": area_ano,
                "duracao_segundos":       round(time.perf_counter() - t_ano, 2),
            })
            n_sucesso             += 1
            area_acumulada_ha     += area_ano
            registros_acumulados  += total_registros

        except Exception as exc:
            log.exception("Falha ao processar ano %d", ano)
            por_ano.append({
                "ano":              ano,
                "status":           "erro",
                "erro":             str(exc),
                "duracao_segundos": round(time.perf_counter() - t_ano, 2),
            })

    duracao = round(time.perf_counter() - t0, 2)
    status_global = (
        "sucesso" if n_sucesso == len(anos)
        else ("parcial" if n_sucesso > 0 else "erro")
    )
    return {
        "status":                 status_global,
        "anos":                   anos,
        "anos_com_sucesso":       n_sucesso,
        "area_queimada_total_ha": round(area_acumulada_ha, 4),
        "total_registros":        registros_acumulados,
        "por_ano":                por_ano,
        "duracao_segundos":       duracao,
    }
