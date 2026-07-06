#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
modules/asvs_sinaflor/downloader.py — Download de ASVs SINAFLOR (WFS IBAMA).

Baixa as Autorizações de Supressão de Vegetação do Piauí via WFS ArcGIS
do IBAMA/SINAFLOR e salva em "data/raw/ASVs Emitidas-PI(SINAFLOR+).geojson".

Fallback: quando os endpoints do IBAMA estão fora do ar, o downloader
recupera a última cópia válida do bucket Supabase Storage `asv-cache`.
Toda execução bem-sucedida do IBAMA reescreve essa cache.

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
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Configuração ──────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent.parent
_OUT  = _ROOT / "data" / "raw" / "ASVs Emitidas-PI(SINAFLOR+).geojson"

load_dotenv(_ROOT / ".env")

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

# ── Cache Supabase Storage (usado quando IBAMA está fora do ar) ──────────
CACHE_BUCKET   = "asv-cache"
CACHE_FILENAME = "latest.geojson"


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


def _get_supabase_client():
    """Retorna um client Supabase, ou None se as credenciais não estiverem definidas.

    Usado tanto para popular a cache quanto para recuperá-la — falhas não devem
    interromper o pipeline principal, então erros são logados e retornam None.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        log.debug("  Cache indisponível: SUPABASE_URL/SERVICE_KEY não definidos")
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as exc:
        log.warning("  Cache: falha ao criar client Supabase — %s", exc)
        return None


def _ensure_cache_bucket(sb) -> bool:
    """Garante que o bucket de cache existe. Retorna False só se der para
    ter certeza de que o bucket não pode ser criado (raro)."""
    try:
        sb.storage.get_bucket(CACHE_BUCKET)
        return True
    except Exception:
        pass  # bucket não existe — tenta criar
    try:
        sb.storage.create_bucket(CACHE_BUCKET, options={"public": False})
        log.info("  Cache: bucket '%s' criado no Storage", CACHE_BUCKET)
        return True
    except Exception as exc:
        # pode falhar se o bucket já existe mas não temos permissão de GET;
        # ainda assim vale tentar o upload/download.
        msg = str(exc)
        if "already exists" in msg.lower() or "duplicate" in msg.lower():
            return True
        log.warning("  Cache: não foi possível criar bucket '%s' — %s", CACHE_BUCKET, exc)
        return False


def _upload_para_cache(geojson: dict) -> None:
    """Sobe a última versão bem-sucedida do IBAMA para o Supabase Storage.

    Best-effort: falhas de upload não interrompem o pipeline (o arquivo local
    já foi gravado), apenas logam warning.
    """
    sb = _get_supabase_client()
    if sb is None:
        return
    if not _ensure_cache_bucket(sb):
        return
    payload = json.dumps(geojson, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    try:
        sb.storage.from_(CACHE_BUCKET).upload(
            path=CACHE_FILENAME,
            file=payload,
            file_options={"content-type": "application/json", "upsert": "true"},
        )
        log.info("  Cache: %s/%s atualizada (%d bytes)",
                 CACHE_BUCKET, CACHE_FILENAME, len(payload))
    except Exception as exc:
        log.warning("  Cache: falha ao subir para Storage — %s", exc)


def _baixar_da_cache() -> dict | None:
    """Fallback quando IBAMA está fora: baixa a última cópia do Supabase Storage."""
    sb = _get_supabase_client()
    if sb is None:
        log.warning("  Cache indisponível (sem credenciais Supabase)")
        return None
    log.info("  Tentando cache Supabase Storage (%s/%s)...", CACHE_BUCKET, CACHE_FILENAME)
    try:
        raw = sb.storage.from_(CACHE_BUCKET).download(CACHE_FILENAME)
        if not raw:
            log.warning("  Cache: arquivo '%s' não encontrado no bucket", CACHE_FILENAME)
            return None
        data = json.loads(raw.decode("utf-8"))
        n = len(data.get("features", []) or [])
        log.info("  ✓ Cache: %d ASVs recuperadas", n)
        return data
    except Exception as exc:
        log.warning("  Cache: falha ao baixar do Storage — %s", exc)
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
    origem = None

    # Tenta fonte primária (WFS OGC)
    data = _baixar_url(WFS_BASE, WFS_PARAMS, "WFS OGC IBAMA")
    if data is not None:
        origem = "ibama_wfs"

    # Fallback 1: ArcGIS REST
    if data is None:
        log.warning("  Fonte primária indisponível — tentando fallback ArcGIS...")
        time.sleep(2)
        data = _baixar_url(ARCGIS_BASE, ARCGIS_PARAMS, "ArcGIS REST IBAMA")
        if data is not None:
            origem = "ibama_arcgis"

    # Fallback 2: cache Supabase Storage (usado quando IBAMA está fora do ar)
    if data is None:
        log.warning("  IBAMA fora do ar — recorrendo à cache Supabase Storage")
        data = _baixar_da_cache()
        if data is not None:
            origem = "supabase_cache"

    if data is None:
        log.error("Todas as fontes falharam (WFS OGC, ArcGIS REST, cache Storage).")
        log.error("URLs testadas:")
        log.error("  Primária:  %s", WFS_BASE)
        log.error("  Fallback:  %s", ARCGIS_BASE)
        log.error("  Cache:     supabase://%s/%s", CACHE_BUCKET, CACHE_FILENAME)
        raise SystemExit(1)

    data = normalizar_campos(data)

    n_features = len(data.get("features", []))
    log.info("  Origem: %s | Features normalizadas: %d", origem, n_features)

    if n_features == 0:
        log.error("Nenhuma ASV encontrada — verifique o filtro UF='PI'")
        raise SystemExit(1)

    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _write_atomic(_OUT, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    sz_mb = _OUT.stat().st_size / 1_048_576
    log.info("  → %s (%.1f MB)", _OUT.name, sz_mb)

    # Se veio do IBAMA, atualizamos a cache. Se veio da cache, não faz sentido
    # reescrever com o mesmo conteúdo.
    if origem in ("ibama_wfs", "ibama_arcgis"):
        _upload_para_cache(data)

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
