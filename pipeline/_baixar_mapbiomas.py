#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download incremental de alertas de desmatamento via GraphQL API MapBiomas Alerta v2.

Fonte    : MapBiomas Alerta — https://plataforma.alerta.mapbiomas.org/api/v2/graphql
Método   : GraphQL POST com paginação (limit/offset)
Filtros  : estado PI, anos 2022–2025, alertas detectados após a última execução
Saída    : base de dados/Alertas_MapBiomas_PI_update_{data}.geojson
Limitações:
  - Requer MAPBIOMAS_TOKEN válido no .env (Bearer token de autenticação)
  - A API não documenta publicamente o schema completo; campos retornados dependem
    da versão vigente. Este script usa os campos confirmados na versão consultada.
  - Em caso de mudança de schema pela MapBiomas, ajustar a query GraphQL abaixo.
  - Geometrias retornadas em GeoJSON (EPSG:4326); convertidas diretamente para GeoDataFrame.

Uso:
    conda activate desmatamento
    python pipeline/_baixar_mapbiomas.py

    # Para forçar download completo (ignora .last_run_mapbiomas):
    python pipeline/_baixar_mapbiomas.py --full
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from dotenv import load_dotenv
import os

# ── Configuração ──────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

BASE_DADOS = ROOT / "base de dados"
LAST_RUN_F = ROOT / "pipeline" / ".last_run_mapbiomas"

ENDPOINT   = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql"
ANOS_ALVO  = [2022, 2023, 2024, 2025]
PAGE_SIZE  = 200   # alertas por página (ajustar se a API impuser limite menor)
MAX_RETRY  = 3     # tentativas por request com backoff exponencial
DATA_INICIO_PADRAO = "2022-01-01"

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)


# ── Query GraphQL ─────────────────────────────────────────────────────────────
# Adaptar campos conforme o schema vigente da plataforma MapBiomas Alerta.
# O schema real pode ser inspecionado via introspection:
#   POST {"query": "{ __schema { types { name fields { name } } } }"}
QUERY_ALERTAS = """
query ListarAlertasPI($state: String!, $anos: [Int!]!, $desde: String!, $limit: Int!, $offset: Int!) {
  alerts(
    where: {
      state: { _eq: $state }
      year: { _in: $anos }
      detectedAt: { _gte: $desde }
    }
    limit: $limit
    offset: $offset
    order_by: { detectedAt: asc }
  ) {
    id
    alertCode
    detectedAt
    publishedAt
    area
    biome
    municipality
    vegetationPressure
    geometry {
      geojson
    }
  }
}
"""

# Schema alternativo — caso o endpoint use nomes diferentes (v2 observada):
QUERY_ALERTAS_ALT = """
query {
  alerts(where: {state: "PI", year: {_in: [2022,2023,2024,2025]}}) {
    id
    alertCode
    detectedAt
    publishedAt
    area
    biome
    municipality
    vegetationPressure
    geometry { geojson }
  }
}
"""


# ── Helpers ───────────────────────────────────────────────────────────────────
def _ler_ultima_data() -> str:
    """Retorna a data da última execução (ISO YYYY-MM-DD) ou a data padrão."""
    if LAST_RUN_F.exists():
        txt = LAST_RUN_F.read_text(encoding="utf-8").strip()
        try:
            datetime.fromisoformat(txt)
            log.info(f"Última execução registrada: {txt}")
            return txt
        except ValueError:
            log.warning(f"Conteúdo inválido em {LAST_RUN_F}; usando data padrão.")
    log.info(f"Nenhuma execução anterior encontrada. Usando: {DATA_INICIO_PADRAO}")
    return DATA_INICIO_PADRAO


def _salvar_ultima_data(dt: str) -> None:
    LAST_RUN_F.parent.mkdir(parents=True, exist_ok=True)
    LAST_RUN_F.write_text(dt, encoding="utf-8")
    log.info(f"Próxima execução usará data de corte: {dt}")


def _post_graphql(token: str, payload: dict, tentativa: int = 1) -> dict:
    """POST para a API GraphQL com retry e backoff exponencial."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    try:
        resp = requests.post(ENDPOINT, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            erros = data["errors"]
            log.error(f"GraphQL retornou erros: {erros}")
            raise RuntimeError(f"Erros GraphQL: {erros}")
        return data
    except (requests.RequestException, RuntimeError) as exc:
        if tentativa < MAX_RETRY:
            espera = 2 ** tentativa
            log.warning(f"Tentativa {tentativa}/{MAX_RETRY} falhou: {exc}. Aguardando {espera}s...")
            time.sleep(espera)
            return _post_graphql(token, payload, tentativa + 1)
        log.error(f"Todas as {MAX_RETRY} tentativas falharam: {exc}")
        raise


def _alert_para_feature(alerta: dict) -> dict | None:
    """Converte um registro GraphQL para Feature GeoJSON."""
    geom_raw = alerta.get("geometry") or {}
    geojson_str = geom_raw.get("geojson")
    if not geojson_str:
        return None

    try:
        geometry = json.loads(geojson_str) if isinstance(geojson_str, str) else geojson_str
    except (json.JSONDecodeError, TypeError):
        log.warning(f"Geometria inválida no alerta {alerta.get('alertCode')}")
        return None

    props = {
        "CODEALERTA":  alerta.get("alertCode"),
        "DATADETEC":   alerta.get("detectedAt"),
        "DTPUBLI":     alerta.get("publishedAt"),
        "AREAHA":      alerta.get("area"),
        "BIOMA":       alerta.get("biome"),
        "MUNICIPIO":   alerta.get("municipality"),
        "VPRESSAO":    alerta.get("vegetationPressure"),
        "id_api":      alerta.get("id"),
    }

    return {
        "type":       "Feature",
        "geometry":   geometry,
        "properties": props,
    }


def _baixar_paginado(token: str, desde: str) -> list[dict]:
    """Pagina a API GraphQL e retorna lista de features GeoJSON."""
    features = []
    offset   = 0
    pagina   = 1

    while True:
        log.info(f"  Página {pagina} (offset={offset}, limit={PAGE_SIZE}) ...")
        payload = {
            "query": QUERY_ALERTAS,
            "variables": {
                "state":  "PI",
                "anos":   ANOS_ALVO,
                "desde":  desde,
                "limit":  PAGE_SIZE,
                "offset": offset,
            },
        }

        try:
            data = _post_graphql(token, payload)
        except RuntimeError:
            log.error("Falha irrecuperável na API. Abortando download.")
            break

        alertas = data.get("data", {}).get("alerts", [])
        if not alertas:
            log.info(f"  Página {pagina}: nenhum alerta retornado. Paginação encerrada.")
            break

        for alerta in alertas:
            feat = _alert_para_feature(alerta)
            if feat:
                features.append(feat)

        log.info(f"  Página {pagina}: {len(alertas)} alertas recebidos ({len(features)} com geometria válida acumulados)")

        if len(alertas) < PAGE_SIZE:
            # Última página
            break

        offset += PAGE_SIZE
        pagina += 1
        time.sleep(0.5)  # respeito ao rate limit da API

    return features


def _salvar_geojson(features: list[dict], caminho: Path) -> None:
    """Salva lista de features como arquivo GeoJSON."""
    colecao = {
        "type":     "FeatureCollection",
        "features": features,
    }
    caminho.write_text(json.dumps(colecao, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Download incremental MapBiomas Alerta — PI")
    parser.add_argument(
        "--full", action="store_true",
        help="Ignorar .last_run_mapbiomas e baixar desde 2022-01-01"
    )
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DOWNLOAD MapBiomas Alerta — Piauí")
    log.info("=" * 60)

    # Verificar token
    token = os.environ.get("MAPBIOMAS_TOKEN", "").strip()
    if not token:
        log.warning(
            "MAPBIOMAS_TOKEN não configurado no .env. "
            "Adicione a variável e tente novamente. Script encerrado sem erro."
        )
        print("AVISO — MAPBIOMAS_TOKEN ausente. Nenhum download realizado.")
        sys.exit(0)

    # Data de corte
    if args.full:
        desde = DATA_INICIO_PADRAO
        log.info(f"Modo --full: baixando desde {desde}")
    else:
        desde = _ler_ultima_data()

    # Criar diretório de saída se necessário
    BASE_DADOS.mkdir(parents=True, exist_ok=True)

    # Download
    log.info(f"Buscando alertas PI com DATADETEC >= {desde} ...")
    features = _baixar_paginado(token, desde)

    if not features:
        log.info("Nenhum alerta novo encontrado.")
        print(f"OK — 0 alertas novos desde {desde}. Nenhum arquivo gerado.")
        _salvar_ultima_data(date.today().isoformat())
        return

    # Salvar
    hoje     = date.today().strftime("%Y%m%d")
    arquivo  = BASE_DADOS / f"Alertas_MapBiomas_PI_update_{hoje}.geojson"
    _salvar_geojson(features, arquivo)

    # Validar com geopandas (verifica integridade do GeoJSON gerado)
    try:
        gdf = gpd.read_file(arquivo)
        log.info(f"Validação geopandas: {len(gdf)} features lidas com sucesso (CRS: {gdf.crs})")
    except Exception as exc:
        log.warning(f"Validação geopandas falhou (arquivo pode estar parcialmente corrompido): {exc}")

    # Atualizar data de última execução
    _salvar_ultima_data(date.today().isoformat())

    log.info("=" * 60)
    log.info(f"Download concluído: {len(features)} alertas salvos em {arquivo.name}")
    log.info("=" * 60)
    print(f"OK — {len(features)} registros salvos em {arquivo}")


if __name__ == "__main__":
    main()
