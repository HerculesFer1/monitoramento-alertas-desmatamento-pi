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

    # A malha municipal é usada apenas como input para operações espaciais locais
    # (spatial join em classify.py). Não existe tabela municipios_pi no Supabase —
    # os dados municipais chegam ao frontend via agregado_municipios e frontend/public/data/.
    log.info("  [municipios_ibge] Malha salva localmente em data/raw/municipios_pi.geojson")

    return {"status": "ok", "records": n, "message": f"{n} municípios do Piauí disponíveis localmente"}
