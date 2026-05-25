"""
Template de manifest para novos módulos de análise.
Copie modules/_template/ para modules/<nome>/ e preencha os campos marcados com <>.

Guia completo: docs/modules/COMO-CRIAR-MODULO.md
Contrato:      docs/architecture/ADR-003-module-contract.md
"""
from __future__ import annotations

from pathlib import Path

# _ROOT calculado a partir do arquivo — nunca usar Path("data/raw") relativo ao cwd
_ROOT = Path(__file__).resolve().parent.parent.parent

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
    Entry point chamado pelo core/orchestrator.py.

    Args:
        config: dry_run (bool), ano (int), verbose (bool)

    Returns:
        {"status": "ok"|"warning"|"error", "records": int, "message": str}
        records = número de registros enviados ao Supabase (0 se só uso local).
    """
    from .downloader import download
    from .processor import process

    dry_run = config.get("dry_run", False)

    # CORRETO: usar _ROOT absoluto, nunca Path("data/raw") relativo ao cwd
    dest = _ROOT / "data" / "raw" / MODULE_MANIFEST["id"]
    dest.mkdir(parents=True, exist_ok=True)

    try:
        raw_path = download(dest, config)
    except Exception as exc:
        return {"status": "error", "records": 0, "message": f"Download falhou: {exc}"}

    if dry_run:
        return {"status": "ok", "records": 0, "message": "dry-run: download OK, upload ignorado"}

    try:
        return process(raw_path, config)
    except Exception as exc:
        return {"status": "error", "records": 0, "message": f"Processamento falhou: {exc}"}

    # ── Exemplo de upload (descomentar e adaptar) ─────────────────────────────
    # from core.uploader import upload_geodataframe, upload_json
    #
    # upload_geodataframe(
    #     gdf,
    #     table="<nome_tabela>",
    #     if_exists="upsert",
    #     conflict_col="<coluna_chave_primaria>",  # OBRIGATÓRIO para upsert correto
    # )
    # return {"status": "ok", "records": len(gdf), "message": f"{len(gdf)} registros processados"}
