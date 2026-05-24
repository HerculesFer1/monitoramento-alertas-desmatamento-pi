"""modules/municipios_ibge/manifest.py — Contrato do módulo Municípios IBGE."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "municipios_ibge",
    "name":        "Municípios IBGE",
    "version":     "1.0.0",
    "description": "Download da malha municipal do Piauí via API IBGE para agregação espacial.",
    "icon":        "🗺️",
    "frontend_module": "municipios_ibge",
    "tags":        ["ibge", "municipios", "malha"],
    "schedule":    None,  # manual — malha IBGE raramente muda
    "priority":    4,
    "enabled":     True,
    "outputs":     ["municipios_pi"],
}


def run(config: dict) -> dict:
    from .downloader import download
    from .processor import load
    from core.uploader import upload_geodataframe

    dry_run = config.get("dry_run", False)

    path = download()
    gdf = load(path)
    if gdf is None:
        return {
            "status": "ok",
            "records": 0,
            "message": "Malha municipal indisponível (download falhou ou arquivo ausente)",
        }

    n = len(gdf)
    log.info("  [municipios_ibge] %d municípios", n)

    if not dry_run and n > 0:
        upload_geodataframe(gdf, table="municipios_pi", if_exists="upsert")
        log.info("  [municipios_ibge] Upload concluído")

    return {"status": "ok", "records": n, "message": f"{n} municípios do Piauí processados"}
