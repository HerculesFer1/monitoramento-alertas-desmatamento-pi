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
        # Verificar colunas obrigatórias antes do upload
        _REQUIRED = {"nu_autoriz", "dt_valid_i", "dt_valid_f", "status_aut", "bioma_pamg"}
        _missing = _REQUIRED - set(gdf.columns)
        if _missing:
            log.warning(
                "  [asvs_sinaflor] Colunas ausentes no GDF: %s — "
                "ajuste MAPA_CAMPOS em downloader.py. Upload abortado.",
                sorted(_missing),
            )
            return {"status": "warning", "records": n,
                    "message": f"{n} ASVs carregadas mas não enviadas — colunas ausentes: {sorted(_missing)}"}
        # conflict_col obrigatório: sem ele o uploader usa a 1ª coluna (não determinístico)
        upload_geodataframe(gdf, table="asvs_sinaflor", if_exists="upsert",
                            conflict_col="nu_autoriz")
        log.info("  [asvs_sinaflor] Upload concluído")

    return {"status": "ok", "records": n, "message": f"{n} ASVs processadas"}
