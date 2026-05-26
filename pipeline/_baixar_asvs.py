#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download de Autorizações de Supressão de Vegetação (ASVs) do SINAFLOR+ via WFS IBAMA.

Fonte primária : WFS ArcGIS — PAMGIA/IBAMA
                 https://pamgia.ibama.gov.br/geoservicos/ows
Fonte fallback : CKAN API — dados.gov.br / dadosabertos.ibama.gov.br
                 https://dadosabertos.ibama.gov.br/api/3/action/package_search
Método         : WFS GetFeature com paginação (startIndex/count) e filtro CQL_FILTER
Filtros        : estado PI, tipo de autorização ASV, status 'Autorização Emitida'
Saída          : base de dados/ASVs_SINAFLOR_PI_{data}.geojson
Limitações:
  - O nome do layer WFS pode variar entre versões do serviço IBAMA; o script faz
    GetCapabilities primeiro e tenta correspondência automática.
  - O endpoint WFS IBAMA pode estar temporariamente indisponível; nesse caso o
    script tenta o fallback CKAN e registra o aviso no log.
  - ASVs sem geometria associada são descartadas (apenas polígonos são úteis ao pipeline).
  - O script NÃO requer autenticação para o WFS IBAMA (serviço público).

Uso:
    conda activate desmatamento
    python pipeline/_baixar_asvs.py

    # Para forçar redownload mesmo que arquivo do dia já exista:
    python pipeline/_baixar_asvs.py --force
"""

import argparse
import json
import logging
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

import geopandas as gpd
import pandas as pd
import requests
from dotenv import load_dotenv

# ── Configuração ──────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")  # carrega .env (não necessário aqui mas mantém consistência)

BASE_DADOS = ROOT / "base de dados"

# Endpoint WFS IBAMA/PAMGIA
WFS_BASE   = "https://pamgia.ibama.gov.br/geoservicos/ows"
# Candidatos de nome de layer a tentar (em ordem de prioridade)
LAYER_CANDIDATOS = [
    "sinaflor:sinaflor_emp_linha",
    "sinaflor_emp_linha",
    "pamgia:sinaflor_emp_linha",
    "SINAFLOR_EMP_LINHA",
    "sinaflor:asv_pi",
]
# Filtros CQL
CQL_PI = "uf_sigla='PI' AND tp_autorizacao='ASV' AND status_aut='Autorização Emitida'"
PAGE_SIZE  = 500   # features por página WFS
MAX_RETRY  = 3
TIMEOUT    = 90    # segundos por request

# Fallback CKAN (dados abertos IBAMA)
CKAN_BASE  = "https://dadosabertos.ibama.gov.br/api/3/action"
CKAN_QUERY = "sinaflor ASV Piauí"

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)


# ── Helpers gerais ────────────────────────────────────────────────────────────
def _get_com_retry(url: str, params: dict | None = None, tentativa: int = 1) -> requests.Response:
    """GET HTTP com retry e backoff exponencial."""
    try:
        resp = requests.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp
    except requests.RequestException as exc:
        if tentativa < MAX_RETRY:
            espera = 2 ** tentativa
            log.warning(f"Tentativa {tentativa}/{MAX_RETRY} falhou ({exc}). Aguardando {espera}s...")
            time.sleep(espera)
            return _get_com_retry(url, params, tentativa + 1)
        raise


# ── WFS: GetCapabilities ──────────────────────────────────────────────────────
def _get_capabilities() -> list[str]:
    """Faz GetCapabilities e retorna lista de layer names disponíveis no WFS."""
    log.info("Consultando GetCapabilities do WFS IBAMA...")
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetCapabilities",
    }
    try:
        resp = _get_com_retry(WFS_BASE, params)
    except requests.RequestException as exc:
        log.error(f"GetCapabilities falhou: {exc}")
        return []

    try:
        root  = ET.fromstring(resp.content)
        ns    = {"wfs": "http://www.opengis.net/wfs/2.0"}
        names = [
            el.text.strip()
            for el in root.findall(".//wfs:Name", ns)
            if el.text
        ]
        # Fallback sem namespace
        if not names:
            names = [el.text.strip() for el in root.iter() if el.tag.endswith("Name") and el.text]
        log.info(f"  {len(names)} layers encontrados no WFS")
        return names
    except ET.ParseError as exc:
        log.warning(f"Erro ao parsear GetCapabilities XML: {exc}")
        return []


def _detectar_layer(layers_disponiveis: list[str]) -> str | None:
    """Tenta encontrar o layer de ASVs entre os disponíveis."""
    lower_map = {l.lower(): l for l in layers_disponiveis}
    for candidato in LAYER_CANDIDATOS:
        if candidato.lower() in lower_map:
            nome = lower_map[candidato.lower()]
            log.info(f"  Layer detectado: {nome}")
            return nome
    # Busca parcial
    for nome_real in layers_disponiveis:
        if "sinaflor" in nome_real.lower() or "asv" in nome_real.lower():
            log.info(f"  Layer detectado por correspondência parcial: {nome_real}")
            return nome_real
    log.warning("Nenhum layer SINAFLOR/ASV encontrado no GetCapabilities.")
    if layers_disponiveis:
        log.warning(f"  Layers disponíveis: {layers_disponiveis[:10]}")
    return None


# ── WFS: GetFeature paginado ──────────────────────────────────────────────────
def _baixar_wfs(layer: str) -> list[dict]:
    """Baixa todas as ASVs do PI via WFS GetFeature paginado. Retorna lista de features GeoJSON."""
    features  = []
    start_idx = 0
    pagina    = 1

    while True:
        log.info(f"  WFS página {pagina} (startIndex={start_idx}, count={PAGE_SIZE}) ...")
        params = {
            "service":       "WFS",
            "version":       "2.0.0",
            "request":       "GetFeature",
            "typeName":      layer,
            "outputFormat":  "application/json",
            "CQL_FILTER":    CQL_PI,
            "count":         PAGE_SIZE,
            "startIndex":    start_idx,
        }

        try:
            resp = _get_com_retry(WFS_BASE, params)
        except requests.RequestException as exc:
            log.error(f"WFS GetFeature falhou na página {pagina}: {exc}")
            break

        # Verificar Content-Type (WFS pode retornar XML de erro mesmo com status 200)
        ct = resp.headers.get("Content-Type", "")
        if "xml" in ct.lower() and "json" not in ct.lower():
            log.warning(f"WFS retornou XML em vez de JSON (possível erro de serviço): {resp.text[:300]}")
            break

        try:
            data = resp.json()
        except ValueError as exc:
            log.error(f"Resposta WFS não é JSON válido: {exc}\n{resp.text[:200]}")
            break

        feats = data.get("features", [])
        if not feats:
            log.info(f"  Página {pagina}: nenhuma feature. Paginação encerrada.")
            break

        features.extend(feats)
        log.info(f"  Página {pagina}: {len(feats)} features ({len(features)} acumuladas)")

        if len(feats) < PAGE_SIZE:
            break

        start_idx += PAGE_SIZE
        pagina    += 1
        time.sleep(0.3)

    return features


# ── Fallback CKAN ─────────────────────────────────────────────────────────────
def _fallback_ckan() -> list[dict]:
    """
    Tenta baixar ASVs via CKAN API (dados abertos IBAMA) como alternativa ao WFS.
    Retorna lista de features GeoJSON (pode estar vazia se não houver dados geoespaciais).
    """
    log.info("Tentando fallback CKAN (dadosabertos.ibama.gov.br) ...")
    params = {
        "q":    CKAN_QUERY,
        "rows": 10,
    }
    try:
        resp = _get_com_retry(f"{CKAN_BASE}/package_search", params)
    except requests.RequestException as exc:
        log.error(f"CKAN API inacessível: {exc}")
        return []

    try:
        result = resp.json()
    except ValueError:
        log.error("Resposta CKAN não é JSON válido.")
        return []

    datasets = result.get("result", {}).get("results", [])
    if not datasets:
        log.warning("CKAN: nenhum dataset encontrado para a query.")
        return []

    log.info(f"CKAN: {len(datasets)} datasets encontrados. Buscando recursos GeoJSON/Shapefile...")

    for ds in datasets:
        nome = ds.get("title", "")
        log.info(f"  Dataset: {nome}")
        for recurso in ds.get("resources", []):
            fmt  = (recurso.get("format") or "").upper()
            url  = recurso.get("url", "")
            if fmt in ("GEOJSON", "JSON", "SHAPEFILE", "SHP", "ZIP"):
                log.info(f"    Recurso {fmt}: {url}")
                try:
                    r2 = _get_com_retry(url)
                    # Tentar parse como GeoJSON
                    data = r2.json()
                    feats = data.get("features", [])
                    if feats:
                        # Filtrar PI
                        feats_pi = [
                            f for f in feats
                            if _feature_e_pi(f)
                        ]
                        log.info(f"    {len(feats)} features totais; {len(feats_pi)} filtradas para PI")
                        if feats_pi:
                            return feats_pi
                except Exception as exc:
                    log.warning(f"    Não foi possível usar o recurso: {exc}")

    log.warning("CKAN: nenhum recurso GeoJSON com dados do PI encontrado.")
    return []


def _feature_e_pi(feature: dict) -> bool:
    """Heurística simples para identificar features do Piauí."""
    props = feature.get("properties") or {}
    for campo in ("uf_sigla", "estado", "uf", "UF", "ESTADO"):
        v = props.get(campo, "")
        if isinstance(v, str) and "PI" in v.upper():
            return True
    return False


# ── Pós-processamento ─────────────────────────────────────────────────────────
def _normalizar_features(features: list[dict]) -> list[dict]:
    """
    Normaliza os campos das features para compatibilidade com o pipeline principal.
    O pipeline espera: nu_autoriz, dt_valid_i, dt_valid_f, status_aut, bioma_pamg
    """
    normalizadas = []
    for feat in features:
        props = feat.get("properties") or {}

        # Mapeamento de possíveis nomes de campos WFS → nomes esperados pelo pipeline
        mapa = {
            "nu_autoriz":  ["nu_autoriz", "num_autorizacao", "numero_autorizacao", "id_autorizacao"],
            "dt_valid_i":  ["dt_valid_i", "dt_inicio_validade", "data_inicio_validade", "dt_emissao"],
            "dt_valid_f":  ["dt_valid_f", "dt_fim_validade",   "data_fim_validade",   "dt_validade"],
            "status_aut":  ["status_aut", "status", "situacao"],
            "bioma_pamg":  ["bioma_pamg", "bioma", "nm_bioma"],
            "uf_sigla":    ["uf_sigla",   "uf", "estado", "UF"],
        }

        props_norm = {}
        for campo_alvo, candidatos in mapa.items():
            for cand in candidatos:
                if cand in props and props[cand] is not None:
                    props_norm[campo_alvo] = props[cand]
                    break
            else:
                props_norm[campo_alvo] = None

        # Preservar demais campos originais
        for k, v in props.items():
            if k not in props_norm:
                props_norm[k] = v

        normalizadas.append({
            "type":       "Feature",
            "geometry":   feat.get("geometry"),
            "properties": props_norm,
        })

    return normalizadas


def _log_periodo_validade(features: list[dict]) -> None:
    """Loga resumo do período de validade das ASVs baixadas."""
    datas_i, datas_f = [], []
    for f in features:
        p  = f.get("properties") or {}
        di = p.get("dt_valid_i")
        df = p.get("dt_valid_f")
        if di:
            datas_i.append(str(di))
        if df:
            datas_f.append(str(df))
    if datas_i:
        log.info(f"  Início validade: min={min(datas_i)} | max={max(datas_i)}")
    if datas_f:
        log.info(f"  Fim validade:    min={min(datas_f)} | max={max(datas_f)}")


def _salvar_geojson(features: list[dict], caminho: Path) -> None:
    colecao = {
        "type":     "FeatureCollection",
        "features": features,
    }
    caminho.write_text(json.dumps(colecao, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Download ASVs SINAFLOR+ via WFS IBAMA — PI")
    parser.add_argument(
        "--force", action="store_true",
        help="Redownload mesmo que arquivo do dia já exista"
    )
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DOWNLOAD ASVs SINAFLOR+ — Piauí")
    log.info("=" * 60)

    BASE_DADOS.mkdir(parents=True, exist_ok=True)

    # Verificar se arquivo do dia já existe
    hoje    = date.today().strftime("%Y%m%d")
    arquivo = BASE_DADOS / f"ASVs_SINAFLOR_PI_{hoje}.geojson"

    if arquivo.exists() and not args.force:
        log.info(f"Arquivo do dia já existe: {arquivo.name}. Use --force para redownload.")
        try:
            gdf = gpd.read_file(arquivo)
            print(f"OK — {len(gdf)} registros já presentes em {arquivo.name} (use --force para redownload)")
        except Exception:
            print(f"OK — arquivo do dia já existe: {arquivo.name}")
        return

    features = []
    fonte_usada = "WFS_IBAMA"

    # ── Tentativa 1: WFS IBAMA ────────────────────────────────────────────────
    log.info("Iniciando download via WFS IBAMA/PAMGIA ...")
    try:
        layers = _get_capabilities()
        layer  = _detectar_layer(layers)

        if layer is None and layers:
            # Tentar com o primeiro candidato hardcoded mesmo sem confirmação
            layer = LAYER_CANDIDATOS[0]
            log.warning(f"Nenhum layer detectado no GetCapabilities. Tentando com '{layer}' diretamente.")

        if layer:
            features = _baixar_wfs(layer)
        else:
            log.warning("Não foi possível determinar o layer WFS. Pulando WFS.")

    except Exception as exc:
        log.error(f"Erro inesperado no WFS: {exc}")
        features = []

    # ── Tentativa 2: Fallback CKAN ────────────────────────────────────────────
    if not features:
        log.warning("WFS não retornou dados. Tentando fallback CKAN...")
        fonte_usada = "CKAN_FALLBACK"
        try:
            features = _fallback_ckan()
        except Exception as exc:
            log.error(f"Fallback CKAN também falhou: {exc}")
            features = []

    if not features:
        log.error(
            "Nenhuma ASV foi baixada. Verifique a disponibilidade dos serviços:\n"
            f"  WFS:  {WFS_BASE}\n"
            f"  CKAN: {CKAN_BASE}"
        )
        print("AVISO — Nenhuma ASV baixada. Verifique os serviços do IBAMA.")
        sys.exit(0)

    # ── Normalizar e salvar ───────────────────────────────────────────────────
    log.info(f"Normalizando {len(features)} features (fonte: {fonte_usada}) ...")
    features_norm = _normalizar_features(features)

    # Descartar features sem geometria
    com_geom = [f for f in features_norm if f.get("geometry") is not None]
    sem_geom = len(features_norm) - len(com_geom)
    if sem_geom:
        log.warning(f"  {sem_geom} features descartadas por ausência de geometria")

    _log_periodo_validade(com_geom)
    _salvar_geojson(com_geom, arquivo)

    # Validar com geopandas
    try:
        gdf = gpd.read_file(arquivo)
        log.info(f"Validação geopandas: {len(gdf)} features lidas (CRS: {gdf.crs})")
        # Resumo de status
        if "status_aut" in gdf.columns:
            log.info(f"  Status únicos: {gdf['status_aut'].unique().tolist()}")
        if "bioma_pamg" in gdf.columns:
            log.info(f"  Biomas: {gdf['bioma_pamg'].value_counts().to_dict()}")
    except Exception as exc:
        log.warning(f"Validação geopandas falhou: {exc}")

    log.info("=" * 60)
    log.info(f"Download concluído: {len(com_geom)} ASVs salvas em {arquivo.name}")
    log.info(f"Fonte utilizada: {fonte_usada}")
    log.info("=" * 60)
    print(f"OK — {len(com_geom)} registros salvos em {arquivo}")


if __name__ == "__main__":
    main()
