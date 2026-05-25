"""modules/municipios_ibge/manifest.py — Contrato do módulo Municípios IBGE."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "municipios_ibge",
    "name":        "Municípios IBGE",
    "version":     "1.1.0",
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

    # download() retorna None em caso de falha (não um Path inexistente)
    if path is None:
        return {
            "status":  "warning",
            "records": 0,
            "message": "Download da malha IBGE falhou — spatial joins usarão cache anterior se disponível",
        }

    gdf = load(path)
    if gdf is None:
        return {
            "status":  "warning",
            "records": 0,
            "message": "Malha municipal indisponível (arquivo não pôde ser lido)",
        }

    n = len(gdf)
    log.info("  [municipios_ibge] %d municípios carregados", n)
    # A malha é usada apenas como input para spatial joins locais em classify.py.
    # Não há tabela municipios_pi no Supabase — dados municipais chegam ao frontend
    # via agregado_municipios e frontend/public/data/.
    log.info("  [municipios_ibge] Disponível localmente em data/raw/municipios_pi.geojson")

    return {
        "status":  "ok",
        "records": 0,   # 0 = nada foi enviado ao Supabase (uso local apenas)
        "message": f"{n} municípios do Piauí disponíveis localmente para spatial joins",
    }
