#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Upload dos outputs do pipeline para o Supabase via REST API (supabase-py).

Uso:
    python pipeline/_upload_supabase.py

Requer:
    - .env com SUPABASE_URL e SUPABASE_SERVICE_KEY
    - conda activate desmatamento
    - conda install -c conda-forge supabase python-dotenv
"""

import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# ── Configuração ──────────────────────────────────────────────────────────
ROOT   = Path(__file__).parent.parent

RESULT = ROOT / "Resultado"
GEO_IN = RESULT / "alertas_classificados.geojson"
AGR_IN = RESULT / "agregado_municipios.json"

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)

BATCH        = 200   # linhas por upsert (evita timeout REST)
MAX_RETRIES  = 3     # tentativas por batch antes de abortar
RETRY_DELAY  = 2.0   # segundos de espera entre tentativas (dobra a cada retry)


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


def _batches(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


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
    if gdf.crs is None:
        log.warning("GeoDataFrame sem CRS — assumindo EPSG:4326")
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
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
def registrar_execucao(sb, n_alertas, n_mun, testes_ok: int = 9, testes_total: int = 9):
    ts = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    sb.table("execucoes_pipeline").insert({
        "versao":       "v2",
        "testes_ok":    testes_ok,
        "testes_total": testes_total,
        "n_alertas":    n_alertas,
        "n_municipios": n_mun,
        "log_resumo":   f"Upload automático em {ts}",
    }).execute()
    log.info("  ✓ execucoes_pipeline: execução registrada")


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
