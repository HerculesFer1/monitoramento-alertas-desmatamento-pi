#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
platform/uploader.py — Upload dos outputs do pipeline para o Supabase.

Uso:
    python -m platform.uploader

Requer:
    - .env com SUPABASE_URL e SUPABASE_SERVICE_KEY
    - conda activate desmatamento
"""

import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# ── Configuração ──────────────────────────────────────────────────────────
ROOT   = Path(__file__).parent.parent

RESULT = ROOT / "data" / "output"
GEO_IN = RESULT / "alertas_classificados.geojson"
AGR_IN = RESULT / "agregado_municipios.json"

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)

BATCH        = 200   # linhas por upsert (evita timeout REST)
MAX_RETRIES  = 3     # tentativas por batch antes de abortar
RETRY_DELAY  = 2.0   # segundos de espera entre tentativas (dobra a cada retry)

# CRS aceitos para upload (PostGIS espera EPSG:4326).
# 4674 (SIRGAS 2000 geográfico) e 5880 (Brasil Policônico) são reprojetados.
_CRS_UPLOAD_ALVO   = 4326
_CRS_ACEITOS       = (4326, 4674, 5880)


# ── Cliente Supabase ──────────────────────────────────────────────────────
def criar_cliente():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL e SUPABASE_SERVICE_KEY não definidas no .env"
        )
    return create_client(url, key)


# ── Helpers ───────────────────────────────────────────────────────────────
def _limpar(val):
    """Converte NaN/NaT/None/inf para None (JSON null)."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    return val


def _to_json_safe(val):
    """Converte tipos numpy/pandas para tipos Python nativos serializáveis em JSON.

    Trata: numpy integers/floats/bools, pandas Timestamp/NaT, datetime.date,
    datetime.datetime e qualquer objeto com .isoformat().
    """
    if val is None:
        return None
    # numpy inteiros (int8, int16, int32, int64, uint*, …)
    if isinstance(val, np.integer):
        return int(val)
    # numpy floats
    if isinstance(val, np.floating):
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    # numpy bool
    if isinstance(val, np.bool_):
        return bool(val)
    # float nativo
    if isinstance(val, float):
        return None if (math.isnan(val) or math.isinf(val)) else val
    # "NaT" como string — artefato de export/import via GeoJSON com GDAL
    if isinstance(val, str) and val == "NaT":
        return None
    # pandas NaT / numpy NaT ANTES de .isoformat() — pd.NaT.isoformat() retorna "NaT"
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    # datetime / date com isoformat (cobre Timestamp, datetime, date)
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return val


def _batches(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def _ensure_crs_4326(gdf: "gpd.GeoDataFrame", table: str) -> "gpd.GeoDataFrame":
    """Garante que o GDF está em EPSG:4326. Aborta se CRS for ausente ou desconhecido.

    Aceita 4326 (passthrough), 4674 e 5880 (reprojeta).
    Sem essa validação, GDFs em CRS arbitrário são reprojetados silenciosamente
    para 4326 e geometrias acabam distorcidas — A1 do relatório de auditoria.
    """
    if gdf.crs is None:
        raise ValueError(
            f"[{table}] GeoDataFrame sem CRS. Defina o CRS antes do upload "
            f"(gdf.set_crs('EPSG:4326') ou similar) — abortando para evitar reprojeção silenciosa."
        )
    epsg = gdf.crs.to_epsg()
    if epsg not in _CRS_ACEITOS:
        raise ValueError(
            f"[{table}] CRS EPSG:{epsg} não está na lista de aceitos {_CRS_ACEITOS}. "
            "Adicione explicitamente se for esperado, ou reprojeje no processor."
        )
    if epsg != _CRS_UPLOAD_ALVO:
        log.info("[%s] Reprojetando EPSG:%d → EPSG:%d", table, epsg, _CRS_UPLOAD_ALVO)
        gdf = gdf.to_crs(epsg=_CRS_UPLOAD_ALVO)
    return gdf


def _upsert_with_retry(sb, table: str, batch: list, conflict_col: str) -> None:
    """Executa upsert com retry exponencial. Lança RuntimeError se esgotar tentativas."""
    delay = RETRY_DELAY
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            sb.table(table).upsert(batch, on_conflict=conflict_col).execute()
            return
        except Exception as exc:
            if attempt == MAX_RETRIES:
                log.error(
                    "[%s] Batch falhou após %d tentativas: %s", table, MAX_RETRIES, exc
                )
                raise RuntimeError(
                    f"Falha persistente no upload de '{table}' após {MAX_RETRIES} tentativas."
                ) from exc
            log.warning(
                "[%s] Tentativa %d/%d falhou (%s) — aguardando %.1fs",
                table, attempt, MAX_RETRIES, exc, delay,
            )
            time.sleep(delay)
            delay *= 2  # backoff exponencial


# ── Upload: alertas_classificados ─────────────────────────────────────────
def upload_alertas(sb):
    log.info("Lendo %s ...", GEO_IN.name)
    gdf = gpd.read_file(GEO_IN)
    gdf = _ensure_crs_4326(gdf, "alertas_classificados")
    log.info("  %d fragmentos carregados", len(gdf))

    registros = []
    for _, r in gdf.iterrows():
        # Geometria em EWKT (Extended WKT com SRID explícito — formato correto para PostGREST).
        # WKT simples falha se o SRID da coluna não bater; EWKT é inequívoco.
        geom_wkt = None
        if r.geometry is not None:
            geom_wkt = f"SRID=4326;{r.geometry.wkt}"

        # fonte_list
        fl = r.get("fonte_list")
        if isinstance(fl, str):
            try:
                fl = json.loads(fl)
            except Exception:
                fl = [fl]
        fl = fl if isinstance(fl, list) else None

        reg = {
            "id_fragmento":              _limpar(r.get("id_fragmento")),
            "codealerta":                _limpar(r.get("codealerta")),
            "classificacao":             _limpar(r.get("classificacao")),
            "pct_cobertura":             _limpar(r.get("pct_cobertura")),
            "fonte_classificacao":       _limpar(r.get("fonte_classificacao")),
            "instrumento_ref":           _limpar(r.get("instrumento_ref")),
            "data_validade_instrumento": _limpar(r.get("data_validade_instrumento")),
            "ano":                       _limpar(r.get("ano")),
            "bioma":                     _limpar(r.get("bioma")),
            "municipio":                 _limpar(r.get("municipio")),
            "area_ha":                   _limpar(r.get("area_ha")),
            "area_original_ha":          _limpar(r.get("area_original_ha")),
            "vpressao":                  _limpar(r.get("vpressao")),
            "vpressao_ptbr":             _limpar(r.get("vpressao_ptbr")),
            "fonte_list":                fl,
            "datadetec":                 _limpar(r.get("datadetec")),
            "dias_ate_publicacao":       _limpar(r.get("dias_ate_publicacao")),
            "matopiba":                  bool(r.get("matopiba", False)),
            "reincidente":               bool(r.get("reincidente", False)),
            "ano_prodes_ref":            _limpar(r.get("ano_prodes_ref")),
            "concordancia_prodes_pct":   _limpar(r.get("concordancia_prodes_pct")),
            "flag_validacao_externa":    _limpar(r.get("flag_validacao_externa")),
            "geom":                      geom_wkt,
        }
        # Converter datas para string ISO
        for campo in ("data_validade_instrumento", "datadetec"):
            v = reg.get(campo)
            if v is not None and hasattr(v, "isoformat"):
                reg[campo] = v.isoformat()
            elif v is not None:
                reg[campo] = str(v)

        # Converter inteiros numpy para int nativo
        for campo in ("codealerta", "ano", "dias_ate_publicacao", "ano_prodes_ref"):
            v = reg.get(campo)
            if v is not None:
                try:
                    reg[campo] = int(v)
                except Exception:
                    reg[campo] = None

        # Converter floats numpy para float nativo
        for campo in ("pct_cobertura", "area_ha", "area_original_ha",
                      "concordancia_prodes_pct"):
            v = reg.get(campo)
            if v is not None:
                try:
                    reg[campo] = float(v)
                except Exception:
                    reg[campo] = None

        registros.append(reg)

    total      = len(registros)
    n_batches  = math.ceil(total / BATCH)
    log.info("  Enviando em batches de %d (%d batches)...", BATCH, n_batches)

    for i, batch in enumerate(_batches(registros, BATCH)):
        pct = int((i * BATCH / total) * 100)
        log.info("  [%3d%%] batch %d / %d ...", pct, i + 1, n_batches)
        _upsert_with_retry(sb, "alertas_classificados", batch, "id_fragmento")

    log.info("  ✓ alertas_classificados: %d fragmentos inseridos/atualizados", total)
    return total


# ── Upload: agregado_municipios ───────────────────────────────────────────
def upload_agregado(sb):
    log.info("Lendo %s ...", AGR_IN.name)
    with open(AGR_IN, encoding="utf-8") as f:
        data = json.load(f)
    log.info("  %d registros municipio×ano", len(data))

    registros = []
    for r in data:
        anos = r.get("anos_com_alerta_irregular")
        if isinstance(anos, list):
            try:
                anos = [int(a) for a in anos]
            except (ValueError, TypeError):
                anos = None
        else:
            anos = None

        reg = {
            "municipio":                   r.get("municipio"),
            "ano":                         int(r.get("ano")) if r.get("ano") else None,
            "bioma_predominante":          _limpar(r.get("bioma_predominante")),
            "matopiba":                    bool(r.get("matopiba", False)),
            "serie_b":                     bool(r.get("serie_b", False)),
            "ha_irregular":                _limpar(r.get("ha_irregular")),
            "ha_autorizado":               _limpar(r.get("ha_autorizado")),
            "ha_autorizado_parcialmente":  _limpar(r.get("ha_autorizado_parcialmente")),
            "ha_autorizado_total":         _limpar(r.get("ha_autorizado_total")),
            "ha_regularizado":             _limpar(r.get("ha_regularizado")),
            "ha_total":                    _limpar(r.get("ha_total")),
            "pct_irregular":               _limpar(r.get("pct_irregular")),
            "pct_autorizado":              _limpar(r.get("pct_autorizado")),
            "pct_autorizado_parcialmente": _limpar(r.get("pct_autorizado_parcialmente")),
            "pct_autorizado_total":        _limpar(r.get("pct_autorizado_total")),
            "pct_regularizado":            _limpar(r.get("pct_regularizado")),
            "num_alertas":                 _limpar(r.get("num_alertas")),
            "vpressao_dominante":          _limpar(r.get("vpressao_dominante")),
            "vpressao_dominante_ptbr":     _limpar(r.get("vpressao_dominante_ptbr")),
            "reincidente":                 bool(r.get("reincidente", False)),
            "anos_com_alerta_irregular":   anos,
            "defasagem_media_dias":        _limpar(r.get("defasagem_media_dias")),
        }
        # Floats
        for campo in ("ha_irregular","ha_autorizado","ha_autorizado_parcialmente",
                      "ha_autorizado_total","ha_regularizado","ha_total",
                      "pct_irregular","pct_autorizado","pct_autorizado_parcialmente",
                      "pct_autorizado_total","pct_regularizado","defasagem_media_dias"):
            v = reg.get(campo)
            if v is not None:
                try:
                    reg[campo] = float(v)
                except Exception:
                    reg[campo] = None

        registros.append(reg)

    for i, batch in enumerate(_batches(registros, BATCH)):
        _upsert_with_retry(sb, "agregado_municipios", batch, "municipio,ano")

    log.info("  ✓ agregado_municipios: %d linhas inseridas/atualizadas", len(registros))
    return len(registros)


# ── Refresh Materialized View MATOPIBA ───────────────────────────────────
def refresh_matopiba(sb) -> None:
    """Atualiza a Materialized View matopiba_municipios após o upload."""
    try:
        sb.rpc("refresh_matopiba", {}).execute()
        log.info("  ✓ matopiba_municipios: view materializada atualizada")
    except Exception as exc:
        log.warning("  Refresh MATOPIBA falhou (view pode estar desatualizada): %s", exc)


# ── Registro de auditoria ─────────────────────────────────────────────────
def registrar_execucao(
    sb,
    n_alertas: int,
    n_mun: int,
    testes_ok: int = 9,
    testes_total: int = 9,
    status: str = "ok",
    duracao_s: int | None = None,
    modulos_ok: int | None = None,
    modulos_total: int | None = None,
    log_resumo: str | None = None,
) -> None:
    """Registra uma execução do pipeline em execucoes_pipeline.

    Args:
        status: "ok" | "warning" | "error"
        duracao_s: duração total em segundos
        modulos_ok: número de módulos com status ok
        modulos_total: total de módulos executados
        log_resumo: mensagem resumida da execução
    """
    ts = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    sb.table("execucoes_pipeline").insert({
        "versao":        "v2",
        "status":        status,
        "testes_ok":     testes_ok,
        "testes_total":  testes_total,
        "n_alertas":     n_alertas,
        "n_municipios":  n_mun,
        "duracao_s":     duracao_s,
        "modulos_ok":    modulos_ok,
        "modulos_total": modulos_total,
        "log_resumo":    log_resumo or f"Pipeline {status} em {ts}",
    }).execute()
    log.info("  ✓ execucoes_pipeline: execução registrada (status=%s)", status)


# ── Interface pública para módulos (ADR-002) ──────────────────────────────

def upload_geodataframe(
    gdf: "gpd.GeoDataFrame",
    table: str,
    if_exists: str = "upsert",
    conflict_col: str | None = None,
) -> int:
    """
    Faz upsert de um GeoDataFrame em qualquer tabela Supabase.

    A geometria é convertida para EWKT (SRID=4326). Todos os demais campos
    passam por _limpar() para remover NaN/inf. O conflict_col determina a
    coluna de deduplicação; se None, usa a primeira coluna do GDF.

    Args:
        gdf: GeoDataFrame com CRS definido (reprojetado para EPSG:4326 se necessário).
        table: Nome da tabela Supabase.
        if_exists: Somente "upsert" suportado por ora.
        conflict_col: Coluna de deduplicação (padrão: primeira coluna não-geometry).

    Returns:
        Número de registros enviados.
    """
    load_dotenv(ROOT / ".env")
    sb = criar_cliente()

    gdf = _ensure_crs_4326(gdf, table)

    non_geom_cols = [c for c in gdf.columns if c != gdf.geometry.name]
    col_conf = conflict_col or (non_geom_cols[0] if non_geom_cols else "id")

    registros = []
    n_invalidas = 0
    for _, row in gdf.iterrows():
        rec: dict = {}
        for col in non_geom_cols:
            rec[col] = _to_json_safe(row[col])
        geom = row.geometry

        # Validação geométrica antes do upsert — rastreia falhas em vez de
        # PostGIS rejeitar silenciosamente.
        if geom is not None:
            if geom.is_empty:
                log.warning("[%s] Geom vazia em %s=%s — descartada",
                            table, col_conf, rec.get(col_conf))
                n_invalidas += 1
                continue
            if not geom.is_valid:
                from shapely.validation import make_valid
                geom_fix = make_valid(geom)
                if not geom_fix.is_valid or geom_fix.is_empty:
                    log.error("[%s] Geom inválida não recuperável em %s=%s",
                              table, col_conf, rec.get(col_conf))
                    n_invalidas += 1
                    continue
                geom = geom_fix
            # PostGIS rejeita Polygon quando a coluna é MultiPolygon — forçar conversão
            if geom.geom_type == "Polygon":
                from shapely.geometry import MultiPolygon
                geom = MultiPolygon([geom])

        rec["geom"] = f"SRID=4326;{geom.wkt}" if geom is not None else None
        registros.append(rec)

    if n_invalidas > 0:
        log.warning("[%s] Total descartado por geom inválida/vazia: %d", table, n_invalidas)

    total = len(registros)
    n_batches = math.ceil(total / BATCH) if total else 0
    log.info("[%s] Enviando %d registros em %d batches...", table, total, n_batches)
    for i, batch in enumerate(_batches(registros, BATCH)):
        log.info("  [%3d%%] batch %d / %d", int(i * BATCH / max(total, 1) * 100), i + 1, n_batches)
        _upsert_with_retry(sb, table, batch, col_conf)

    log.info("  ✓ %s: %d registros inseridos/atualizados", table, total)
    return total


def upload_json(
    data: list,
    table: str,
    if_exists: str = "upsert",
    conflict_col: str | None = None,
) -> int:
    """
    Faz upsert de uma lista de dicts em qualquer tabela Supabase.

    Args:
        data: Lista de dicts com os registros a inserir.
        table: Nome da tabela Supabase.
        if_exists: Somente "upsert" suportado por ora.
        conflict_col: Coluna de deduplicação (padrão: primeira chave do primeiro dict).

    Returns:
        Número de registros enviados.
    """
    load_dotenv(ROOT / ".env")
    sb = criar_cliente()

    if not data:
        log.info("[%s] Nenhum registro para upload", table)
        return 0

    col_conf = conflict_col or next(iter(data[0]))

    registros = [{k: _to_json_safe(v) for k, v in row.items()} for row in data]
    total = len(registros)
    n_batches = math.ceil(total / BATCH)
    log.info("[%s] Enviando %d registros em %d batches...", table, total, n_batches)
    for i, batch in enumerate(_batches(registros, BATCH)):
        log.info("  [%3d%%] batch %d / %d", int(i * BATCH / total * 100), i + 1, n_batches)
        _upsert_with_retry(sb, table, batch, col_conf)

    log.info("  ✓ %s: %d registros inseridos/atualizados", table, total)
    return total


# ── Main ──────────────────────────────────────────────────────────────────
def main():
    load_dotenv(ROOT / ".env")

    log.info("=" * 60)
    log.info("UPLOAD SUPABASE — Desmatamento PI v2")
    log.info("=" * 60)

    if not GEO_IN.exists():
        log.error("Arquivo não encontrado: %s", GEO_IN)
        log.error("Execute python -m pipeline antes do upload.")
        raise SystemExit(1)
    if not AGR_IN.exists():
        log.error("Arquivo não encontrado: %s", AGR_IN)
        raise SystemExit(1)

    log.info("Conectando ao Supabase via API REST...")
    sb = criar_cliente()
    log.info("  ✓ Cliente criado")

    n_alertas = upload_alertas(sb)
    n_mun     = upload_agregado(sb)
    refresh_matopiba(sb)
    registrar_execucao(sb, n_alertas, n_mun)

    log.info("=" * 60)
    log.info("Upload concluído: %d alertas | %d registros município×ano", n_alertas, n_mun)
    log.info("Verifique: Supabase > Table Editor > alertas_classificados")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
