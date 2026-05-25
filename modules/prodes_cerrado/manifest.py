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

    # Os polígonos PRODES são usados apenas para validação cruzada local (cross-join com
    # alertas_mapbiomas). Não há tabela prodes_cerrado no Supabase — os resultados da
    # validação são gravados diretamente em alertas_classificados.flag_validacao_externa.
    log.info("  [prodes_cerrado] Disponível localmente para validação cruzada")

    return {"status": "ok", "records": n, "message": f"{n} polígonos PRODES disponíveis localmente"}
