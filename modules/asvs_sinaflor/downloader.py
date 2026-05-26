#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
modules/asvs_sinaflor/downloader.py — Download de ASVs SINAFLOR (WFS IBAMA).

Baixa as Autorizações de Supressão de Vegetação do Piauí via WFS ArcGIS
do IBAMA/SINAFLOR e salva em "base de dados/ASVs Emitidas-PI(SINAFLOR+).geojson".

Uso:
    python -m modules.asvs_sinaflor.downloader

Fonte: IBAMA SINAFLOR — WFS ArcGIS REST Service
       Atualização planejada: semanal (segunda-feira)

Nota: o endpoint WFS pode mudar sem aviso. Verificar regularmente em:
      https://siscom.ibama.gov.br/geoserver/ows (WFS padrão OGC)
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import requests

# ── Configuração ──────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent.parent
_OUT  = _ROOT / "data" / "raw" / "ASVs Emitidas-PI(SINAFLOR+).geojson"

# logging.basicConfig NÃO deve ser chamado em módulos importáveis —
# apenas em __main__. O orchestrator configura o logging globalmente.
log = logging.getLogger(__name__)

# ── Endpoints WFS (testar o que estiver ativo) ────────────────────────────
# Fonte primária: IBAMA SISCOM WFS OGC
# Parâmetros separados para que requests faça o URL-encoding correto
# (aspas simples e caracteres acentuados causam HTTP 400 se concatenados na URL)
WFS_BASE = "https://siscom.ibama.gov.br/geoserver/ows"
WFS_PARAMS = {
    "service":       "WFS",
    "version":       "2.0.0",
    "request":       "GetFeature",
    "typeName":      "sinaflor:vw_autorizacao_supressao_vegetacao",
    "outputFormat":  "application/json",
    "CQL_FILTER":    "uf='PI' AND status_aut='Autorização Emitida'",
    "srsName":       "EPSG:4326",
}

# Fonte alternativa: ArcGIS REST (caso o WFS OGC esteja indisponível)
ARCGIS_BASE = (
    "https://servicos.ibama.gov.br/arcgis/rest/services/"
    "SINAFLOR/SINAFLOR_ASV/MapServer/0/query"
)
ARCGIS_PARAMS = {
    "where":            "uf='PI' AND status_aut='Autorização Emitida'",
    "outFields":        "*",
    "geometryType":     "esriGeometryPolygon",
    "outSR":            "4326",
    "f":                "geojson",
    "resultRecordCount": "5000",
}

TIMEOUT = 300   # segundos — WFS pode ser lento para datasets grandes


def _write_atomic(path: Path, text: str) -> None:
    """Escreve text em path de forma atômica (temp → rename) para evitar corrupção."""
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _baixar_url(base_url: str, params: dict, descricao: str) -> dict | None:
    """Tenta baixar GeoJSON de uma URL com params. Retorna None em caso de falha."""
    log.info("  Tentando %s...", descricao)
    try:
        resp = requests.get(base_url, params=params, timeout=TIMEOUT, stream=True)
        log.debug("  URL final: %s", resp.url)
        resp.raise_for_status()
        data = resp.json()
        if data.get("type") == "FeatureCollection" and data.get("features"):
            log.info("  ✓ %s: %d features", descricao, len(data["features"]))
            return data
        log.warning("  %s: resposta inesperada ou vazia — %s", descricao,
                    str(data)[:200])
    except requests.Timeout:
        log.warning("  %s: timeout após %ds", descricao, TIMEOUT)
    except requests.HTTPError as exc:
        log.warning("  %s: HTTP %s — %s", descricao,
                    exc.response.status_code, exc.response.text[:300])
    except Exception as exc:
        log.warning("  %s: erro — %s", descricao, exc)
    return None


def normalizar_campos(geojson: dict) -> dict:
    """
    Normaliza nomes de campos para o schema esperado pelo pipeline.

    O pipeline espera: nu_autoriz, dt_valid_i, dt_valid_f, status_aut, bioma_pamg
    O WFS pode retornar variações nesses nomes.
    """
    MAPA_CAMPOS = {
        # WFS OGC
        "numero_autorizacao": "nu_autoriz",
        "data_inicio_vigencia": "dt_valid_i",
        "data_fim_vigencia": "dt_valid_f",
        "situacao": "status_aut",
        "bioma": "bioma_pamg",
        # ArcGIS REST (nomes alternativos comuns)
        "NUM_AUTORIZACAO": "nu_autoriz",
        "DT_INICIO_VIGENCIA": "dt_valid_i",
        "DT_FIM_VIGENCIA": "dt_valid_f",
        "STATUS_AUTORIZACAO": "status_aut",
        "BIOMA": "bioma_pamg",
    }

    features_norm = []
    for feat in geojson.get("features", []):
        props = feat.get("properties", {}) or {}
        props_norm = {}
        for k, v in props.items():
            novo_k = MAPA_CAMPOS.get(k, k)
            props_norm[novo_k] = v
        features_norm.append({**feat, "properties": props_norm})

    return {**geojson, "features": features_norm}


def main():
    log.info("=" * 60)
    log.info("Download ASVs SINAFLOR — Piauí")
    log.info("=" * 60)

    data = None

    # Tenta fonte primária (WFS OGC)
    data = _baixar_url(WFS_BASE, WFS_PARAMS, "WFS OGC IBAMA")

    # Fallback para ArcGIS REST
    if data is None:
        log.warning("  Fonte primária indisponível — tentando fallback ArcGIS...")
        time.sleep(2)
        data = _baixar_url(ARCGIS_BASE, ARCGIS_PARAMS, "ArcGIS REST IBAMA")

    if data is None:
        log.error("Ambas as fontes falharam. Verifique a conectividade.")
        log.error("URLs testadas:")
        log.error("  Primária: %s", WFS_BASE)
        log.error("  Fallback:  %s", ARCGIS_BASE)
        raise SystemExit(1)

    data = normalizar_campos(data)

    n_features = len(data.get("features", []))
    log.info("  Features normalizadas: %d", n_features)

    if n_features == 0:
        log.error("Nenhuma ASV encontrada — verifique o filtro UF='PI'")
        raise SystemExit(1)

    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _write_atomic(_OUT, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    sz_mb = _OUT.stat().st_size / 1_048_576
    log.info("  → %s (%.1f MB)", _OUT.name, sz_mb)
    log.info("=" * 60)
    log.info("Download concluído.")
    log.info("")
    log.info("AVISO: Verificar se os campos 'nu_autoriz', 'dt_valid_i', 'dt_valid_f',")
    log.info("       'status_aut' e 'bioma_pamg' estão presentes no arquivo gerado.")
    log.info("       Se não, ajustar MAPA_CAMPOS em normalizar_campos().")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    main()
