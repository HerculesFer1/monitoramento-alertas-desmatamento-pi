"""modules/municipios_ibge/downloader.py — Download da malha municipal do Piauí (IBGE).

O endpoint `/malhas/estados/22` retorna 1 polígono (fronteira do estado inteiro).
Para obter os 224 municípios individualmente é preciso listar os códigos via
`/localidades/estados/22/municipios` e baixar a malha de cada um.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import requests

_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_OUT = _ROOT / "data" / "raw" / "municipios_pi.geojson"

_IBGE_LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/22/municipios"
_IBGE_MALHA_MUN   = "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{cod}?formato=application/vnd.geo+json&qualidade=maxima"

_MIN_MUNICIPIOS_ESPERADOS = 200   # PI tem 224; abaixo disso o cache é considerado incompleto

log = logging.getLogger(__name__)


def _is_valid_geojson(path: Path) -> bool:
    """Cache válido: > 200 features (Piauí tem 224 municípios)."""
    if path.stat().st_size < 100_000:
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("type") != "FeatureCollection":
            return False
        return len(data.get("features") or []) >= _MIN_MUNICIPIOS_ESPERADOS
    except Exception:
        return False


def _write_atomic(path: Path, payload: bytes) -> None:
    """Escreve payload em path via arquivo temporário para evitar corrupção."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_bytes(payload)
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def download(out_path: Path | None = None, timeout: int = 30) -> Optional[Path]:
    """Baixa a malha municipal do Piauí — 224 municípios — via API IBGE.

    Estratégia:
      1. Lista os 224 códigos municipais em /localidades/estados/22/municipios
      2. Baixa a malha individual de cada município via /malhas/municipios/{cod}
      3. Consolida em um único FeatureCollection e escreve atomicamente

    Reutiliza cache se existir e tiver ≥ 200 municípios.

    Returns:
        Path do arquivo baixado, ou None se o download falhou.
    """
    out = Path(out_path) if out_path else _DEFAULT_OUT

    if out.exists():
        if _is_valid_geojson(out):
            log.info("  %s já existe e contém municípios válidos — reutilizando", out.name)
            return out
        log.warning(
            "  %s existe mas está incompleto (< %d municípios) — baixando novamente",
            out.name, _MIN_MUNICIPIOS_ESPERADOS,
        )

    log.info("  Listando municípios do Piauí: %s", _IBGE_LOCALIDADES)
    try:
        r = requests.get(_IBGE_LOCALIDADES, timeout=timeout)
        r.raise_for_status()
        municipios = r.json()
    except Exception as exc:
        log.warning("  IBGE localidades falhou: %s", exc)
        return None

    log.info("  IBGE: %d municípios encontrados — baixando malhas…", len(municipios))

    features_all: list[dict] = []
    n_falhas = 0
    for i, m in enumerate(municipios, start=1):
        cod  = m["id"]
        nome = m["nome"]
        try:
            rm = requests.get(_IBGE_MALHA_MUN.format(cod=cod), timeout=timeout)
            rm.raise_for_status()
            fc = rm.json()
            for feat in fc.get("features", []) or []:
                # Sobrescreve as propriedades por metadados úteis para spatial join
                feat["properties"] = {
                    "CD_MUN":   str(cod),
                    "NM_MUN":   nome,
                    "SIGLA_UF": "PI",
                }
                features_all.append(feat)
        except Exception as exc:
            n_falhas += 1
            log.warning("  [%d/%d] %s (%s): %s", i, len(municipios), nome, cod, exc)

        if i % 50 == 0:
            log.info("  IBGE: %d/%d municípios processados…", i, len(municipios))

    if len(features_all) < _MIN_MUNICIPIOS_ESPERADOS:
        log.error(
            "  Malha incompleta: %d features (esperado ≥ %d, falhas=%d) — abortando",
            len(features_all), _MIN_MUNICIPIOS_ESPERADOS, n_falhas,
        )
        return None

    payload = json.dumps(
        {"type": "FeatureCollection", "features": features_all},
        ensure_ascii=False,
    ).encode("utf-8")

    try:
        _write_atomic(out, payload)
    except Exception as exc:
        log.warning("  Escrita da malha falhou: %s", exc)
        return None

    log.info(
        "  → %s: %d municípios, %.1f MB%s",
        out.name, len(features_all), out.stat().st_size / 1_048_576,
        f" ({n_falhas} falhas parciais)" if n_falhas else "",
    )
    return out
