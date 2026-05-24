"""modules/municipios_ibge/downloader.py — Download da malha municipal do Piauí (IBGE)."""
from __future__ import annotations

import logging
from pathlib import Path

import requests

_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_OUT = _ROOT / "base de dados" / "municipios_pi.geojson"
_IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/22"
    "?formato=application/vnd.geo+json&resolucao=5"
)

log = logging.getLogger(__name__)


def download(out_path: Path | None = None, timeout: int = 60) -> Path:
    """Baixa a malha municipal do Piauí via API IBGE. Reutiliza arquivo se já existir."""
    out = Path(out_path) if out_path else _DEFAULT_OUT
    if out.exists():
        log.info("  %s já existe — reutilizando", out.name)
        return out
    log.info("  Baixando malha municipal IBGE: %s", _IBGE_URL)
    try:
        r = requests.get(_IBGE_URL, timeout=timeout)
        r.raise_for_status()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(r.content)
        log.info("  → %s (%d KB)", out.name, out.stat().st_size // 1024)
    except Exception as exc:
        log.warning("  Download IBGE falhou: %s", exc)
    return out
