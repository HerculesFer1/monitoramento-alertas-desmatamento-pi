#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/_baixar_mapbiomas.py — Download de alertas MapBiomas Alerta (GraphQL).

Baixa os alertas de desmatamento do Piauí via API GraphQL do MapBiomas Alerta
e salva em "base de dados/Alertas de Desmatamento(MAPBIOMAS).geojson".

Uso:
    python pipeline/_baixar_mapbiomas.py
    python pipeline/_baixar_mapbiomas.py --anos 2024 2025

Requer:
    - MAPBIOMAS_TOKEN no .env (obter em https://plataforma.alerta.mapbiomas.org)
    - requests (já no environment.yml)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Configuração ──────────────────────────────────────────────────────────
_ROOT  = Path(__file__).resolve().parent.parent
_OUT   = _ROOT / "base de dados" / "Alertas de Desmatamento(MAPBIOMAS).geojson"

load_dotenv(_ROOT / ".env")

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)

# MapBiomas Alerta GraphQL API v2
ENDPOINT = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql"

# Código do Piauí no MapBiomas territorial hierarchy
# territory.id = 22 corresponde ao estado do Piauí
TERRITORIO_PI = 22

# Campos da query GraphQL — ajustar se a API mudar
QUERY = """
query GetAlertas($territorio: Int!, $anos: [Int]) {
  allAlerts(
    filters: {
      territory: { id: $territorio, category: "state" }
      detectionYear: $anos
    }
    pagination: { page: 1, pageSize: 50000 }
  ) {
    alertCode
    source
    detectedAt
    publishedAt
    uf
    city
    biome
    areaHa
    pressureVector
    imageBeforeDate
    imageAfterDate
    geometry {
      type
      coordinates
    }
  }
}
"""


def baixar(token: str, anos: list[int]) -> list[dict]:
    """Executa a query GraphQL e retorna os alertas como lista de dicts."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    payload = {
        "query": QUERY,
        "variables": {
            "territorio": TERRITORIO_PI,
            "anos":       anos if anos else None,
        },
    }

    log.info("Conectando à API MapBiomas Alerta...")
    log.info("  Endpoint: %s", ENDPOINT)
    log.info("  Território: PI (%d) | Anos: %s", TERRITORIO_PI, anos or "todos")

    for attempt in range(1, 4):
        try:
            resp = requests.post(ENDPOINT, json=payload, headers=headers, timeout=120)
            resp.raise_for_status()
            data = resp.json()

            if "errors" in data:
                raise RuntimeError(f"Erros GraphQL: {data['errors']}")

            alertas = data.get("data", {}).get("allAlerts", [])
            log.info("  %d alertas recebidos", len(alertas))
            return alertas

        except requests.HTTPError as exc:
            if exc.response.status_code == 401:
                raise RuntimeError(
                    "Token MapBiomas inválido ou expirado. "
                    "Verifique MAPBIOMAS_TOKEN no .env"
                ) from exc
            if attempt < 3:
                log.warning("  Tentativa %d falhou (%s) — aguardando 5s...", attempt, exc)
                time.sleep(5)
            else:
                raise

    return []


def converter_geojson(alertas: list[dict]) -> dict:
    """Converte lista de alertas em FeatureCollection GeoJSON."""
    features = []
    n_sem_geo = 0

    for al in alertas:
        geo = al.get("geometry")
        if not geo or not geo.get("coordinates"):
            n_sem_geo += 1
            continue

        # Normalizar campo FONTE (remover chaves do formato {A,B})
        fonte_raw = al.get("source", "") or ""
        if fonte_raw.startswith("{") and fonte_raw.endswith("}"):
            fonte_raw = fonte_raw[1:-1]

        features.append({
            "type": "Feature",
            "geometry": geo,
            "properties": {
                "CODEALERTA":  al.get("alertCode"),
                "FONTE":       fonte_raw,
                "BIOMA":       al.get("biome"),
                "MUNICIPIO":   al.get("city"),
                "AREAHA":      al.get("areaHa"),
                "ANODETEC":    int(al["detectedAt"][:4]) if al.get("detectedAt") else None,
                "DATADETEC":   al.get("detectedAt"),
                "DTPUBLI":     al.get("publishedAt"),
                "VPRESSAO":    al.get("pressureVector"),
                "DTIMGDEP":    al.get("imageAfterDate"),
                "DTIMGANT":    al.get("imageBeforeDate"),
            },
        })

    if n_sem_geo:
        log.warning("  %d alertas sem geometria — descartados", n_sem_geo)

    return {
        "type":     "FeatureCollection",
        "features": features,
    }


def main():
    parser = argparse.ArgumentParser(description="Download MapBiomas Alerta (PI)")
    parser.add_argument(
        "--anos", nargs="*", type=int, default=[],
        help="Anos a baixar (padrão: todos disponíveis)"
    )
    parser.add_argument(
        "--out", type=Path, default=_OUT,
        help=f"Arquivo de saída (padrão: {_OUT})"
    )
    args = parser.parse_args()

    token = os.environ.get("MAPBIOMAS_TOKEN")
    if not token:
        raise SystemExit(
            "MAPBIOMAS_TOKEN não definido no .env\n"
            "Obter em: https://plataforma.alerta.mapbiomas.org (criar conta gratuita)"
        )

    log.info("=" * 60)
    log.info("Download MapBiomas Alerta — Piauí")
    log.info("=" * 60)

    alertas = baixar(token, args.anos)
    if not alertas:
        log.error("Nenhum alerta retornado — verifique token e filtros")
        raise SystemExit(1)

    geojson = converter_geojson(alertas)
    log.info("  Features GeoJSON: %d", len(geojson["features"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    sz_mb = args.out.stat().st_size / 1_048_576
    log.info("  → %s (%.1f MB)", args.out.name, sz_mb)
    log.info("=" * 60)
    log.info("Download concluído. Execute o pipeline para processar os dados.")


if __name__ == "__main__":
    main()
