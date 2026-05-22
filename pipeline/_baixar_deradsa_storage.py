#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/_baixar_deradsa_storage.py — Download de DERADSAs do Supabase Storage.

Em modo CI (GitHub Actions), os arquivos GeoJSON de DERADSA são baixados do
Supabase Storage em vez dos arquivos locais. Os arquivos são disponibilizados
pelo GCGEO/SEMARH via interface de upload no frontend.

Uso:
    python pipeline/_baixar_deradsa_storage.py
    python pipeline/_baixar_deradsa_storage.py --anos 2024 2025

Requer:
    - SUPABASE_URL e SUPABASE_SERVICE_KEY no .env
    - supabase (já no environment.yml)
    - Bucket "deradsa-files" criado no Supabase Storage
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# ── Configuração ──────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent
_DATA = _ROOT / "base de dados"
load_dotenv(_ROOT / ".env")

LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FMT)
log = logging.getLogger(__name__)

# Nome do bucket no Supabase Storage
BUCKET = "deradsa-files"

# Nomes esperados dos arquivos no bucket (padrão: ano → nome do arquivo)
ARQUIVO_PADRAO = {
    2024: "DERADSAs Emitidas[SEMARH-2024].geojson",
    2025: "DERADSAs Emitidas[SEMARH-2025].geojson",
}


def baixar_do_storage(sb, ano: int) -> bool:
    """
    Baixa o GeoJSON de DERADSA de um ano do Supabase Storage.
    Retorna True se bem-sucedido, False se o arquivo não existe no bucket.
    """
    nome_arquivo = ARQUIVO_PADRAO.get(ano, f"DERADSAs Emitidas[SEMARH-{ano}].geojson")
    destino = _DATA / nome_arquivo

    log.info("  Baixando DERADSA %d do Storage (%s/%s)...", ano, BUCKET, nome_arquivo)

    try:
        response = sb.storage.from_(BUCKET).download(nome_arquivo)
        if not response:
            log.warning("  DERADSA %d: arquivo não encontrado no bucket '%s'", ano, BUCKET)
            return False

        _DATA.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(response)
        sz_kb = destino.stat().st_size / 1024
        log.info("  ✓ DERADSA %d: %s (%.1f KB)", ano, destino.name, sz_kb)
        return True

    except Exception as exc:
        log.warning("  DERADSA %d: erro no download — %s", ano, exc)
        return False


def baixar_via_rpc(sb, ano: int) -> bool:
    """
    Alternativa: baixa DERADSAs via RPC get_deradsa_geojson (tabela do DB).
    Usado quando os arquivos não estão no Storage mas os polígonos já
    foram inseridos via upsert_deradsa_lote.
    """
    nome_arquivo = ARQUIVO_PADRAO.get(ano, f"DERADSAs Emitidas[SEMARH-{ano}].geojson")
    destino = _DATA / nome_arquivo

    log.info("  Baixando DERADSA %d via RPC (tabela deradsa)...", ano)

    try:
        result = sb.rpc("get_deradsa_geojson", {"p_ano": ano}).execute()
        geojson = result.data

        if not geojson or not geojson.get("features"):
            log.warning("  DERADSA %d: nenhum registro na tabela", ano)
            return False

        _DATA.mkdir(parents=True, exist_ok=True)
        destino.write_text(
            json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        n = len(geojson["features"])
        log.info("  ✓ DERADSA %d: %d polígonos via RPC", ano, n)
        return True

    except Exception as exc:
        log.warning("  DERADSA %d: RPC falhou — %s", ano, exc)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Download DERADSAs do Supabase Storage para modo CI"
    )
    parser.add_argument(
        "--anos", nargs="*", type=int, default=[2024, 2025],
        help="Anos a baixar (padrão: 2024 2025)"
    )
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL e SUPABASE_SERVICE_KEY não definidos no .env"
        )

    from supabase import create_client
    sb = create_client(url, key)
    log.info("✓ Supabase conectado")

    log.info("=" * 60)
    log.info("Download DERADSAs — Supabase Storage → base de dados/")
    log.info("=" * 60)

    resultados = {}
    for ano in args.anos:
        # Tenta Storage primeiro, depois RPC
        ok = baixar_do_storage(sb, ano) or baixar_via_rpc(sb, ano)
        resultados[ano] = ok

    log.info("=" * 60)
    for ano, ok in resultados.items():
        status = "✓" if ok else "✗ (arquivo ausente — será ignorado pelo pipeline)"
        log.info("  DERADSA %d: %s", ano, status)

    n_ok = sum(resultados.values())
    n_total = len(resultados)
    if n_ok == 0:
        log.warning(
            "Nenhuma DERADSA disponível. O pipeline executará sem dados DERADSA "
            "(sem classe REGULARIZADO em %s).", args.anos
        )
    else:
        log.info("Download concluído: %d/%d anos com dados DERADSA", n_ok, n_total)


if __name__ == "__main__":
    main()
