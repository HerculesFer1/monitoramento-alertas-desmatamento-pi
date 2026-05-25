"""modules/municipios_ibge/downloader.py — Download da malha municipal do Piauí (IBGE)."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import requests

_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_OUT = _ROOT / "data" / "raw" / "municipios_pi.geojson"
_IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/22"
    "?formato=application/vnd.geo+json&resolucao=5"
)

log = logging.getLogger(__name__)


def _is_valid_geojson(path: Path) -> bool:
    """Verifica se o arquivo é um GeoJSON válido e não está corrompido/truncado."""
    if path.stat().st_size < 1000:
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("type") in ("FeatureCollection", "Feature") and bool(
            data.get("features") or data.get("geometry")
        )
    except Exception:
        return False


def download(out_path: Path | None = None, timeout: int = 60) -> Optional[Path]:
    """Baixa a malha municipal do Piauí via API IBGE.

    Reutiliza arquivo em cache se existir **e** for válido.
    Baixa novamente se o cache estiver corrompido.

    Returns:
        Path do arquivo baixado, ou None se o download falhou.
    """
    out = Path(out_path) if out_path else _DEFAULT_OUT

    if out.exists():
        if _is_valid_geojson(out):
            log.info("  %s já existe e é válido — reutilizando", out.name)
            return out
        else:
            log.warning(
                "  %s existe mas está corrompido ou vazio — baixando novamente",
                out.name,
            )

    log.info("  Baixando malha municipal IBGE: %s", _IBGE_URL)
    try:
        r = requests.get(_IBGE_URL, timeout=timeout)
        r.raise_for_status()
        out.parent.mkdir(parents=True, exist_ok=True)
        # Escrita atômica: evita arquivo corrompido se interrompido
        tmp = out.with_suffix(".tmp")
        try:
            tmp.write_bytes(r.content)
            tmp.replace(out)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
        log.info("  → %s (%d KB)", out.name, out.stat().st_size // 1024)
        return out
    except Exception as exc:
        log.warning("  Download IBGE falhou: %s — malha municipal indisponível", exc)
        return None  # Retorna None explicitamente (não um path inexistente)
