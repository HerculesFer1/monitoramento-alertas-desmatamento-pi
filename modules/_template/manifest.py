"""
Template de manifest para novos módulos de análise.
Copie modules/_template/ para modules/<nome>/ e preencha os campos marcados com <>.

Guia completo: docs/modules/COMO-CRIAR-MODULO.md
Contrato:      docs/architecture/ADR-003-module-contract.md
"""
from __future__ import annotations

MODULE_MANIFEST = {
    # ── Identidade ───────────────────────────────────────────────────────────
    "id":          "<nome_snake_case>",       # igual ao nome da pasta; imutável
    "name":        "<Nome Legível>",
    "version":     "1.0.0",
    "description": "<Uma linha do que este módulo faz.>",

    # ── Metadados de UI ──────────────────────────────────────────────────────
    "icon":            "📊",                  # emoji exibido na sidebar
    "frontend_module": "<nome_snake_case>",   # pasta em frontend/src/modules/
    "tags":            [],

    # ── Orquestração ─────────────────────────────────────────────────────────
    "schedule":  None,           # ex: "0 3 1 * *" para mensal; None = só manual
    "priority":  50,             # ordem de execução (menor = primeiro)
    "enabled":   False,          # manter False até pronto para produção

    # ── Outputs ──────────────────────────────────────────────────────────────
    "outputs": [                 # tabelas Supabase que este módulo escreve
        "<nome_tabela>",
    ],
}


def run(config: dict) -> dict:
    """
    Entry point chamado pelo platform/orchestrator.py.

    Args:
        config: dry_run (bool), ano (int), verbose (bool)

    Returns:
        {"status": "ok"|"error", "records": int, "message": str}
    """
    from pathlib import Path
    from .downloader import download
    from .processor import process

    dry_run = config.get("dry_run", False)
    dest = Path("data/raw") / MODULE_MANIFEST["id"]
    dest.mkdir(parents=True, exist_ok=True)

    raw_path = download(dest, config)

    if dry_run:
        return {"status": "ok", "records": 0, "message": "dry-run: download OK, upload ignorado"}

    return process(raw_path, config)
