"""modules/prodes_cerrado/downloader.py — Lê PRODES-Cerrado do arquivo local."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import geopandas as gpd

_ROOT = Path(__file__).resolve().parent.parent.parent
_FILE = _ROOT / "data" / "raw" / "PRODES_Cerrado_PI.geojson"

log = logging.getLogger(__name__)


def download() -> Optional[gpd.GeoDataFrame]:
    """Retorna GDF com polígonos PRODES-Cerrado, ou None se indisponível.

    Retorna None em dois casos:
      - arquivo não existe (validação cruzada desativada intencionalmente)
      - arquivo corrompido ou ilegível (falha silenciosa que seria pior)
    """
    if not _FILE.exists():
        log.warning("PRODES não encontrado em %s — validação desativada", _FILE)
        return None

    log.info("  Lendo PRODES: %s", _FILE.name)
    try:
        gdf = gpd.read_file(_FILE)
    except Exception as exc:
        log.error(
            "  PRODES: falha ao ler %s — %s. "
            "Validação cruzada desativada para esta execução.",
            _FILE.name, exc,
        )
        return None

    log.info("    → %d features | Colunas: %s", len(gdf), list(gdf.columns))
    return gdf
