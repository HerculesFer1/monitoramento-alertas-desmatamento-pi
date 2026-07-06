#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
modules/alertas_mapbiomas/downloader.py — Download de alertas MapBiomas Alerta (GraphQL).

Baixa os alertas de desmatamento do Piauí via API GraphQL do MapBiomas Alerta
e salva em "data/raw/Alertas de Desmatamento(MAPBIOMAS).geojson".

Uso:
    python -m modules.alertas_mapbiomas.downloader
    python -m modules.alertas_mapbiomas.downloader --anos 2024 2025

Requer:
    - MAPBIOMAS_TOKEN no .env (obter em https://plataforma.alerta.mapbiomas.org)
    - requests, shapely (já no environment.yml)

Schema alvo: MapBiomas Alerta v2 (query `alerts` — substituiu `allAlerts` em 2026).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from shapely import wkt as _wkt
from shapely.geometry import mapping as _shp_mapping

# ── Configuração ──────────────────────────────────────────────────────────
_ROOT  = Path(__file__).resolve().parent.parent.parent
_OUT   = _ROOT / "data" / "raw" / "Alertas de Desmatamento(MAPBIOMAS).geojson"

load_dotenv(_ROOT / ".env")

# logging.basicConfig NÃO deve ser chamado em módulos importáveis —
# apenas em __main__. O orchestrator configura o logging globalmente.
log = logging.getLogger(__name__)

# MapBiomas Alerta GraphQL API v2
ENDPOINT = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql"

# Código do Piauí no MapBiomas territorial hierarchy (schema v2, 2026+).
# Descoberto via `territoryOptions { category territories { code name } }` —
# no schema v2 os IDs de UF ficaram na faixa 18348-18412. NÃO usar o antigo id=22.
TERRITORIO_PI = 18391

# Paginação: MapBiomas costuma aceitar até 1000 por página; começamos generoso
# e caímos gradualmente se o servidor sinalizar erro / timeout.
_PAGE_LIMIT = 1000

# Volume anual típico do PI (~2500–4500 alertas). Se ultrapassar muito, algo
# mudou na API ou o filtro está errado — vale investigar antes de aceitar.
_SANE_MAX_TOTAL = 200_000

# Query GraphQL — schema v2 (2026+).
# Se qualquer erro do tipo "undefinedField" for retornado, é sinal de drift
# de schema e a mensagem em `_raise_from_graphql_errors` explicita isso.
QUERY = """
query GetAlertas(
    $territoryIds: [Int!]
    $territoryCategory: String
    $startDate: BaseDate
    $endDate: BaseDate
    $page: Int
    $limit: Int
) {
  alerts(
    territoryIds: $territoryIds
    territoryCategory: $territoryCategory
    startDate: $startDate
    endDate: $endDate
    dateType: DetectedAt
    page: $page
    limit: $limit
    sortField: DETECTED_AT
    sortDirection: ASC
  ) {
    metadata { totalCount currentPage totalPages limitValue }
    collection {
      alertCode
      sources
      detectedAt
      publishedAt
      areaHa
      crossedBiomes
      crossedCities
      crossedStates
      deforestationClasses
      imageAcquiredBeforeAt
      imageAcquiredAfterAt
      geometryWkt
    }
  }
}
"""

# Aliases pontuais para preservar as chaves de VP_PTBR / dados históricos.
# O restante é convertido de PascalCase → snake_case automaticamente.
_VPRESSAO_ALIAS: dict[str, str] = {
    # MapBiomas manteve a grafia "ilegal_mining" (com "i" faltando) na v1;
    # v2 corrigiu para "IllegalMining". Preservamos o histórico para não
    # quebrar VP_PTBR nem gerar duas chaves diferentes na base.
    "illegal_mining": "ilegal_mining",
}


def _pascal_to_snake(s: str) -> str:
    """`RenewableEnergyProject` → `renewable_energy_project` (idempotente)."""
    if not s:
        return ""
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", s)
    s2 = re.sub(r"([a-z0-9])([A-Z])",  r"\1_\2", s1)
    return s2.lower()


def _vpressao_from_classes(classes: list[str] | None) -> str | None:
    """Extrai VPRESSAO a partir de `deforestationClasses` (lista PascalCase)."""
    if not classes:
        return None
    raw = _pascal_to_snake(str(classes[0]))
    return _VPRESSAO_ALIAS.get(raw, raw)


def _first(lst: list[Any] | None) -> Any:
    return lst[0] if isinstance(lst, list) and lst else None


def _raise_from_graphql_errors(errors: list[dict]) -> None:
    """Diagnostica erros GraphQL e levanta RuntimeError com contexto útil.

    Detecta especificamente 'undefinedField' — sinal de que o schema da API
    mudou e a query precisa ser atualizada. Sem isso o erro anterior era
    genérico e forçava debug manual.
    """
    codes = {(e.get("extensions") or {}).get("code") for e in errors}
    names = [(e.get("extensions") or {}).get("fieldName") for e in errors]
    names = [n for n in names if n]
    if "undefinedField" in codes:
        raise RuntimeError(
            "MapBiomas GraphQL schema drift detectado — "
            f"campo(s) inexistente(s): {names or 'desconhecido'}. "
            "Verifique modules/alertas_mapbiomas/downloader.py:QUERY contra o "
            "schema atual em https://plataforma.alerta.mapbiomas.org/api-doc/v2 "
            f"e rode `python -m modules.alertas_mapbiomas.downloader --schema-check`. "
            f"Erros crus: {errors}"
        )
    raise RuntimeError(f"Erros GraphQL: {errors}")


def _post(token: str, variables: dict) -> dict:
    """POST bruto com retry exponencial simples e diagnóstico específico."""
    headers = {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {token}",
    }
    payload = {"query": QUERY, "variables": variables}
    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = requests.post(ENDPOINT, json=payload, headers=headers, timeout=180)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                _raise_from_graphql_errors(data["errors"])
            return data.get("data") or {}
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                raise RuntimeError(
                    "Token MapBiomas inválido ou expirado. "
                    "Verifique MAPBIOMAS_TOKEN no .env (ou o passo de signIn no CI)."
                ) from exc
            last_exc = exc
            if attempt < 3:
                log.warning("  Tentativa %d falhou (%s) — aguardando %ds...", attempt, exc, 5 * attempt)
                time.sleep(5 * attempt)
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < 3:
                log.warning("  Tentativa %d falhou (%s) — aguardando %ds...", attempt, exc, 5 * attempt)
                time.sleep(5 * attempt)
    raise RuntimeError(f"Falha após 3 tentativas: {last_exc}")


# Datas-limite quando o usuário não passa filtro. Não podemos deixar em None
# porque a API retorna 500 quando `startDate`/`endDate` recebem literal null.
_DEFAULT_START = "2019-01-01"
_DEFAULT_END   = "2099-12-31"


def _anos_to_date_range(anos: list[int] | None) -> tuple[str, str]:
    """Converte lista de anos em (startDate, endDate) para o filtro `alerts`.

    anos=[] ou None → range aberto (_DEFAULT_START, _DEFAULT_END). Nunca None
    porque a API v2 responde 500 se receber `startDate: null` como variável.
    """
    if not anos:
        return _DEFAULT_START, _DEFAULT_END
    y0, y1 = min(anos), max(anos)
    return f"{y0}-01-01", f"{y1}-12-31"


def baixar(token: str, anos: list[int]) -> list[dict]:
    """Executa a query GraphQL paginada e retorna os alertas como lista de dicts."""
    start, end = _anos_to_date_range(anos)
    log.info("Conectando à API MapBiomas Alerta...")
    log.info("  Endpoint: %s", ENDPOINT)
    log.info("  Território: PI (%d) | Anos: %s", TERRITORIO_PI, anos or "todos")

    coletados: list[dict] = []
    page = 1
    while True:
        variables = {
            "territoryIds":      [TERRITORIO_PI],
            "territoryCategory": "state",
            "startDate":         start,
            "endDate":           end,
            "page":              page,
            "limit":             _PAGE_LIMIT,
        }
        data = _post(token, variables)
        block = data.get("alerts") or {}
        meta  = block.get("metadata") or {}
        items = block.get("collection") or []
        total_pages = int(meta.get("totalPages") or 0)
        total_count = int(meta.get("totalCount") or 0)

        if page == 1:
            log.info("  Total anunciado: %d alertas em %d página(s)", total_count, total_pages)
            if total_count > _SANE_MAX_TOTAL:
                raise RuntimeError(
                    f"Volume suspeito: {total_count} alertas > limite de sanidade "
                    f"({_SANE_MAX_TOTAL}). Filtro pode estar errado."
                )

        coletados.extend(items)
        log.info("  Página %d/%d: +%d (acumulado %d)", page, total_pages or 1, len(items), len(coletados))

        if not items or page >= total_pages:
            break
        page += 1

    log.info("  %d alertas recebidos", len(coletados))
    return coletados


def converter_geojson(alertas: list[dict]) -> dict:
    """Converte lista de alertas em FeatureCollection GeoJSON.

    O schema de saída (CODEALERTA, FONTE, BIOMA, ..., VPRESSAO) é fixo — os
    módulos downstream (`processor.parse_alertas`) dependem desses nomes.
    """
    features = []
    n_sem_geo = 0
    n_geo_err = 0

    for al in alertas:
        wkt_str = al.get("geometryWkt")
        if not wkt_str:
            n_sem_geo += 1
            continue
        try:
            geom = _wkt.loads(wkt_str)
        except Exception as exc:
            n_geo_err += 1
            log.debug("  Falha ao parsear WKT do alerta %s: %s", al.get("alertCode"), exc)
            continue
        if geom.is_empty:
            n_sem_geo += 1
            continue

        sources = al.get("sources") or []
        fonte_str = ",".join(str(s) for s in sources) if sources else ""

        detected = al.get("detectedAt")
        anodetec = int(str(detected)[:4]) if detected else None

        features.append({
            "type":     "Feature",
            "geometry": _shp_mapping(geom),
            "properties": {
                "CODEALERTA":  al.get("alertCode"),
                "FONTE":       fonte_str,
                "BIOMA":       _first(al.get("crossedBiomes")),
                "MUNICIPIO":   _first(al.get("crossedCities")),
                "AREAHA":      al.get("areaHa"),
                "ANODETEC":    anodetec,
                "DATADETEC":   detected,
                "DTPUBLI":     al.get("publishedAt"),
                "VPRESSAO":    _vpressao_from_classes(al.get("deforestationClasses")),
                "DTIMGDEP":    al.get("imageAcquiredAfterAt"),
                "DTIMGANT":    al.get("imageAcquiredBeforeAt"),
            },
        })

    if n_sem_geo:
        log.warning("  %d alertas sem geometria — descartados", n_sem_geo)
    if n_geo_err:
        log.warning("  %d alertas com WKT inválido — descartados", n_geo_err)

    return {
        "type":     "FeatureCollection",
        "features": features,
    }


def _write_atomic(path: Path, text: str) -> None:
    """Escreve text em path de forma atômica (temp → rename) para evitar corrupção."""
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def schema_check(token: str) -> None:
    """Smoke test barato: pede 1 alerta com filtro mínimo.

    Serve como verificação de contrato — se o schema mudar de novo, este teste
    quebra em segundos (sem depender do schedule mensal). Usado pelo CI.
    """
    log.info("Schema check — pedindo 1 alerta (limit=1)...")
    variables = {
        "territoryIds":      [TERRITORIO_PI],
        "territoryCategory": "state",
        "startDate":         _DEFAULT_START,
        "endDate":           _DEFAULT_END,
        "page":              1,
        "limit":             1,
    }
    data = _post(token, variables)
    block = data.get("alerts") or {}
    meta  = block.get("metadata") or {}
    items = block.get("collection") or []
    if not meta or "totalCount" not in meta:
        raise RuntimeError(f"Schema check: resposta sem metadata.totalCount — {data!r}")
    if items:
        keys = set(items[0].keys())
        expected = {
            "alertCode", "sources", "detectedAt", "publishedAt", "areaHa",
            "crossedBiomes", "crossedCities", "crossedStates",
            "deforestationClasses", "imageAcquiredBeforeAt", "imageAcquiredAfterAt",
            "geometryWkt",
        }
        missing = expected - keys
        if missing:
            raise RuntimeError(f"Schema check: campos ausentes no AlertData: {missing}")
    log.info("  OK — totalCount anunciado: %d", meta.get("totalCount"))


def download(anos: list[int] | None = None, out: Path | None = None) -> Path:
    """API programática — usada pelo manifest.py sem manipular sys.argv.

    Args:
        anos: lista de anos a baixar (None = todos disponíveis).
        out:  path de saída (None = _OUT padrão).

    Returns:
        Path do arquivo GeoJSON gerado.

    Raises:
        RuntimeError: se token ausente ou nenhum alerta retornado.
    """
    token = os.environ.get("MAPBIOMAS_TOKEN")
    if not token:
        raise RuntimeError(
            "MAPBIOMAS_TOKEN não definido no .env — "
            "obter em https://plataforma.alerta.mapbiomas.org"
        )
    target = out or _OUT
    alertas_list = baixar(token, anos or [])
    if not alertas_list:
        raise RuntimeError("Nenhum alerta retornado — verifique token e filtros")
    geojson = converter_geojson(alertas_list)
    target.parent.mkdir(parents=True, exist_ok=True)
    _write_atomic(target, json.dumps(geojson, ensure_ascii=False, separators=(",", ":")))
    sz_mb = target.stat().st_size / 1_048_576
    log.info("  → %s (%.1f MB, %d features)", target.name, sz_mb, len(geojson["features"]))
    return target


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
    parser.add_argument(
        "--schema-check", action="store_true",
        help="Apenas verifica compatibilidade de schema (não baixa dados)"
    )
    args = parser.parse_args()

    token = os.environ.get("MAPBIOMAS_TOKEN")
    if not token:
        raise SystemExit(
            "MAPBIOMAS_TOKEN não definido no .env\n"
            "Obter em: https://plataforma.alerta.mapbiomas.org (criar conta gratuita)"
        )

    if args.schema_check:
        schema_check(token)
        return

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
    _write_atomic(args.out, json.dumps(geojson, ensure_ascii=False, separators=(",", ":")))
    sz_mb = args.out.stat().st_size / 1_048_576
    log.info("  → %s (%.1f MB)", args.out.name, sz_mb)
    log.info("=" * 60)
    log.info("Download concluído. Execute o pipeline para processar os dados.")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    main()
