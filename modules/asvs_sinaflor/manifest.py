"""modules/asvs_sinaflor/manifest.py — Contrato do módulo ASVs SINAFLOR."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "asvs_sinaflor",
    "name":        "ASVs SINAFLOR",
    "version":     "1.0.0",
    "description": "Download e armazenamento de Autorizações de Supressão Vegetal (IBAMA/SINAFLOR).",
    "icon":        "🌳",
    "frontend_module": "asvs_sinaflor",
    "tags":        ["autorizacao", "sinaflor", "ibama"],
    "schedule":    "0 4 * * 1",  # toda segunda-feira 4h UTC
    "priority":    1,
    "enabled":     True,
    "outputs":     ["asvs_sinaflor"],
}


def run(config: dict) -> dict:
    from .downloader import main as download_main
    from .processor import load
    from core.uploader import upload_geodataframe

    dry_run = config.get("dry_run", False)

    log.info("  [asvs_sinaflor] Iniciando download WFS IBAMA...")
    try:
        download_main()
    except SystemExit as exc:
        return {"status": "error", "records": 0, "message": f"Download falhou: {exc}"}

    gdf = load()
    n = len(gdf)
    log.info("  [asvs_sinaflor] %d ASVs carregadas", n)

    if not dry_run and n > 0:
        upload_geodataframe(gdf, table="asvs_sinaflor", if_exists="upsert")
        log.info("  [asvs_sinaflor] Upload concluído")

    return {"status": "ok", "records": n, "message": f"{n} ASVs processadas"}
