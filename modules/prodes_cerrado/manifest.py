"""modules/prodes_cerrado/manifest.py — Contrato do módulo PRODES-Cerrado."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "prodes_cerrado",
    "name":        "PRODES Cerrado",
    "version":     "1.0.0",
    "description": "Ingestão dos polígonos PRODES-Cerrado (INPE) para validação cruzada de alertas.",
    "icon":        "🛰️",
    "frontend_module": "prodes_cerrado",
    "tags":        ["prodes", "inpe", "cerrado", "validacao"],
    "schedule":    "0 3 1 10 *",  # anual — 1º de outubro (ciclo PRODES)
    "priority":    3,
    "enabled":     True,
    "outputs":     ["prodes_cerrado"],
}


def run(config: dict) -> dict:
    from .downloader import download
    from .processor import process
    from core.uploader import upload_geodataframe

    dry_run = config.get("dry_run", False)

    gdf_raw = download()
    if gdf_raw is None:
        return {
            "status": "ok",
            "records": 0,
            "message": "PRODES_Cerrado_PI.geojson não encontrado — validação cruzada desativada",
        }

    gdf = process(gdf_raw)
    n = len(gdf)
    log.info("  [prodes_cerrado] %d polígonos carregados", n)

    if not dry_run and n > 0:
        upload_geodataframe(gdf, table="prodes_cerrado", if_exists="upsert")
        log.info("  [prodes_cerrado] Upload concluído")

    return {"status": "ok", "records": n, "message": f"{n} polígonos PRODES processados"}
