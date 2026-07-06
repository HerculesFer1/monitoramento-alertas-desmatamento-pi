#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
modules/alertas_mapbiomas/schema_check.py — Verifica contrato GraphQL com MapBiomas.

Usa a introspecção GraphQL (não precisa de token) para confirmar que a query
no `downloader.py` continua compatível com o schema live. Se algum campo ou
argumento tiver sido renomeado/removido, este script falha em ~2s.

Uso:
    python -m modules.alertas_mapbiomas.schema_check

Integrado ao `ci.yml` — roda em toda PR e push para main.
"""
from __future__ import annotations

import sys
from typing import Any

import requests

ENDPOINT = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql"

# Campos que o downloader.py consome de AlertData.
# Se qualquer um for renomeado no schema, o CI falha aqui.
_ALERT_FIELDS_REQUIRED: set[str] = {
    "alertCode",
    "sources",
    "detectedAt",
    "publishedAt",
    "areaHa",
    "crossedBiomes",
    "crossedCities",
    "crossedStates",
    "deforestationClasses",
    "imageAcquiredBeforeAt",
    "imageAcquiredAfterAt",
    "geometryWkt",
}

# Argumentos que passamos para alerts(). Se algum sumir do schema, falha.
_ALERTS_ARGS_REQUIRED: set[str] = {
    "territoryIds",
    "territoryCategory",
    "startDate",
    "endDate",
    "dateType",
    "page",
    "limit",
    "sortField",
    "sortDirection",
}

# Valores dos enums que o downloader emite.
_ENUM_VALUES_REQUIRED: dict[str, set[str]] = {
    "DateTypes":       {"DetectedAt"},
    "AlertSortField":  {"DETECTED_AT"},
    "SortDirection":   {"ASC"},
}

# Campos da metadata que consumimos para paginação.
_METADATA_FIELDS_REQUIRED: set[str] = {"totalCount", "currentPage", "totalPages"}


def _gql(query: str) -> dict[str, Any]:
    r = requests.post(
        ENDPOINT,
        json={"query": query},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        raise RuntimeError(f"Introspection retornou errors: {data['errors']}")
    return data.get("data") or {}


def _type_fields(type_name: str) -> set[str]:
    q = f'{{ __type(name: "{type_name}") {{ fields {{ name }} }} }}'
    t = (_gql(q).get("__type") or {})
    return {f["name"] for f in (t.get("fields") or [])}


def _enum_values(type_name: str) -> set[str]:
    q = f'{{ __type(name: "{type_name}") {{ enumValues {{ name }} }} }}'
    t = (_gql(q).get("__type") or {})
    return {e["name"] for e in (t.get("enumValues") or [])}


def _query_field_args(field_name: str) -> set[str]:
    q = '{ __type(name: "Query") { fields { name args { name } } } }'
    fields = ((_gql(q).get("__type") or {}).get("fields") or [])
    for f in fields:
        if f["name"] == field_name:
            return {a["name"] for a in f["args"]}
    return set()


def check() -> list[str]:
    """Retorna lista de erros; vazia = tudo compatível."""
    errors: list[str] = []

    # 1. Query.alerts existe com os argumentos que usamos
    args = _query_field_args("alerts")
    if not args:
        errors.append("Query.alerts não existe no schema — schema drift crítico")
    else:
        missing_args = _ALERTS_ARGS_REQUIRED - args
        if missing_args:
            errors.append(f"Query.alerts sem argumento(s): {sorted(missing_args)}")

    # 2. AlertData tem os campos que consumimos
    ad_fields = _type_fields("AlertData")
    if not ad_fields:
        errors.append("Type AlertData não existe no schema")
    else:
        missing = _ALERT_FIELDS_REQUIRED - ad_fields
        if missing:
            errors.append(f"AlertData sem campo(s): {sorted(missing)}")

    # 3. CollectionMetadata tem os campos de paginação
    meta_fields = _type_fields("CollectionMetadata")
    if not meta_fields:
        errors.append("Type CollectionMetadata não existe")
    else:
        missing = _METADATA_FIELDS_REQUIRED - meta_fields
        if missing:
            errors.append(f"CollectionMetadata sem campo(s): {sorted(missing)}")

    # 4. Enums que o downloader referencia direto na query (DetectedAt, ASC, etc.)
    for enum_name, required in _ENUM_VALUES_REQUIRED.items():
        vals = _enum_values(enum_name)
        if not vals:
            errors.append(f"Enum {enum_name} não existe")
            continue
        missing = required - vals
        if missing:
            errors.append(f"Enum {enum_name} sem valor(es): {sorted(missing)}")

    return errors


def main() -> int:
    print(f"Verificando schema MapBiomas Alerta v2 ({ENDPOINT})...")
    try:
        errors = check()
    except Exception as exc:  # rede / HTTP / JSON
        print(f"FALHA na introspecção: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("\n[FAIL] Schema drift detectado — corrigir modules/alertas_mapbiomas/downloader.py:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("[OK] Schema compatível — 0 divergências")
    return 0


if __name__ == "__main__":
    sys.exit(main())
