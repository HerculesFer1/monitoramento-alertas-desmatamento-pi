"""
copy_ap_data_ssqr_to_ubce.py

Copia dados de areas_prioritarias do projeto pessoal (ssqr...) para o
institucional (ubce...) via REST PostgREST. Sem psycopg2, sem pg_dump.
Necessário porque o pipeline Python crasha por flake GDAL/GEOS no Windows.

Source:  anon key + SELECT policy pública do projeto pessoal
Target:  service_role key do projeto institucional (RLS ON, escrita autorizada)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# ── Source (projeto pessoal) ─────────────────────────────────────────────────
SSQR_URL  = "https://ssqriwgrxievcmxauegv.supabase.co"
SSQR_ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcXJpd2dyeGlldmNteGF1ZWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDA0NzYsImV4cCI6MjA5MzA3NjQ3Nn0"
    ".AqVdc_n9R_OfWNkl8fKMdA4IhUlaDhoz3YaElCuugaM"
)

# ── Target (projeto institucional) ───────────────────────────────────────────
UBCE_URL = os.environ["SUPABASE_URL"]
UBCE_SVC = os.environ["SUPABASE_SERVICE_KEY"]

if "ubcejvbnpuyouwpphryc" not in UBCE_URL:
    sys.exit(f"ABORT — SUPABASE_URL não é o institucional: {UBCE_URL}")

CHUNK = 100  # registros por POST


def fetch_all(table: str, select: str = "*") -> list[dict[str, Any]]:
    """Pagina tudo via REST Range header."""
    out: list[dict] = []
    offset = 0
    page = 1000
    # Order column é opcional — ap_execucoes não tem municipio_cod
    order = "&order=municipio_cod" if table.startswith("ap_") and "execuc" not in table else ""
    while True:
        url = f"{SSQR_URL}/rest/v1/{table}?select={select}{order}"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SSQR_ANON,
                "Authorization": f"Bearer {SSQR_ANON}",
                "Range": f"{offset}-{offset + page - 1}",
                "Range-Unit": "items",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 416:
                break
            print(f"  GET error {e.code}: {e.read()[:200].decode(errors='ignore')}")
            raise
        if not data:
            break
        out.extend(data)
        if len(data) < page:
            break
        offset += page
    return out


def post_chunks(table: str, rows: list[dict], geom_to_wkt: bool = False) -> None:
    """Insere em chunks via PostgREST com on_conflict upsert."""
    if not rows:
        print(f"  {table}: 0 registros, nada a inserir")
        return

    # GeoJSON -> postgres geometry usa rpc separada — abordagem alternativa:
    # cliente PostgREST aceita GeoJSON direto se a coluna é geometry, mas
    # alguns casos exigem ST_GeomFromGeoJSON. Aqui detectamos a chave e
    # mantemos como string JSON — Supabase converte se a coluna é geom.

    # Remover colunas que NÃO existem no institucional (ap_execucoes)
    if table == "ap_execucoes":
        keep = {"id", "modulo", "status", "ano_prodes", "total_municipios",
                "total_registros", "duracao_segundos", "detalhes", "executado_em"}
        rows = [{k: v for k, v in r.items() if k in keep} for r in rows]

    # ap_municipios_resumo: geom vem como dict GeoJSON do REST.
    # Para PostgREST aceitar geom, envia como GeoJSON (Supabase converte).
    # Se o tipo da coluna for geometry, precisa de string JSON ou usar RPC.
    # Tentativa direta primeiro; se 400 com erro de geom, faz fallback.

    # PK do institucional para ap_municipios_resumo é só municipio_cod
    # (modelo single-year). Funciona pq estamos copiando apenas 1 ano (2025).
    on_conflict = {
        "ap_classes_municipio": "municipio_cod,classe_prioridade,ano_prodes",
        "ap_municipios_resumo": "municipio_cod",
        "ap_execucoes":         "id",
    }.get(table, "")

    qs = f"?on_conflict={on_conflict}" if on_conflict else ""
    url = f"{UBCE_URL}/rest/v1/{table}{qs}"

    n = len(rows)
    for i in range(0, n, CHUNK):
        chunk = rows[i:i + CHUNK]
        body = json.dumps(chunk, default=str).encode()
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "apikey": UBCE_SVC,
                "Authorization": f"Bearer {UBCE_SVC}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(f"  {table}: batch {i//CHUNK + 1}/{(n + CHUNK - 1)//CHUNK}  "
                      f"({i+len(chunk)}/{n})  HTTP {r.status}")
        except urllib.error.HTTPError as e:
            err = e.read()[:400].decode(errors="ignore")
            print(f"  {table}: batch {i//CHUNK + 1} FAILED HTTP {e.code}: {err}")
            raise


def main() -> None:
    print(f"Source: {SSQR_URL}")
    print(f"Target: {UBCE_URL}\n")

    # ap_classes_municipio já copiada — pular se requisitado via env
    tables = os.environ.get("TABLES", "ap_classes_municipio,ap_municipios_resumo,ap_execucoes").split(",")
    for table in tables:
        print(f"→ {table}")
        rows = fetch_all(table)
        print(f"  fetched: {len(rows)} registros")
        post_chunks(table, rows)
        print()

    print("✓ Cópia concluída.")


if __name__ == "__main__":
    main()
