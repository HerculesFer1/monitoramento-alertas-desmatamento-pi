# ADR-008 — Vector Tile Serving (MVT) e GeoJSON bbox-aware

**Status**: Aceito | **Data**: 2026-06-01 | **Migration**: 011

## Contexto

Antes da Migration 011, todas as geometrias chegavam ao frontend via RPCs que
materializavam **GeoJSON completo, sem filtro espacial nem simplificação**:

- `get_alertas_geojson` retornava até 13.638 fragmentos (~40 MB) com
  geometrias de 50+ vértices/polígono.
- `get_ap_geojson` retornava os 224 municípios sempre integrais — mesmo em
  zoom estadual onde 1 km de tolerância é imperceptível.
- `BaseMap.tsx` aplicava `limit: 3000` hardcoded e silencioso — usuário via
  apenas ~22% dos alertas sem aviso (achado C3 da auditoria GIS 2026-06-01).

Sintomas: jank em pan/zoom (8–12% CPU), tempo de primeira renderização > 3s,
bateria mobile drenada, alertas faltando em decisões fundiárias.

## Decisão

Adotamos **dois caminhos servidor-side complementares** para servir geometrias:

### 1. GeoJSON bbox-aware (`get_*_bbox`)

- Cliente envia `(xmin, ymin, xmax, ymax, zoom, ano)`.
- Servidor filtra por `ST_Intersects(geom, ST_MakeEnvelope(...))`.
- Servidor simplifica via `ST_SimplifyPreserveTopology(geom, tol(zoom))`.
- Função `simplification_tolerance(zoom)` mapeia z→tol em graus
  (0,02° em z≤4; 0 em z≥16).

**Uso**: views que precisam de attributes-rich features (tooltip,
hit-testing), e onde a granularidade pode adaptar-se ao zoom.

### 2. Vector Tiles (MVT) via `get_*_mvt(z, x, y, …)`

- Endpoint XYZ binário (`bytea`) compatível com MapLibre
  `addSource({ type: 'vector', tiles: [...] })`.
- `ST_Transform` para 3857 (Web Mercator é exigido pelo XYZ).
- `ST_AsMVTGeom(g, ST_TileEnvelope(z,x,y), 4096, 64, TRUE)` — extent 4096,
  buffer 64 px, clip ativo.
- Cache HTTP padrão do navegador funciona sem código extra.

**Uso**: layers visualmente densos (alertas, parcelas) onde tooltips podem
ser servidos por RPC separada (`get_alertas_bbox` ou `get_municipio_detalhe`).

### 3. Retrocompatibilidade

As RPCs antigas (`get_alertas_geojson`, `get_ap_geojson`) permanecem com
comentário `DEPRECATED (Migration 011)`. Mantidas por 1 release — frontend
migra incrementalmente.

## Consequências

### Positivas

- Payload típico **10–100× menor** (40 MB → 200–500 KB por viewport).
- MVT tile de 224 municípios em z=4: **~6 KB** (medido).
- Hover/pan sem jank (CPU 8–12% → ~1% com `requestAnimationFrame`).
- Sem mais limite hardcoded silencioso — `BaseMap` mostra badge "Top N
  alertas" quando atinge o limite.
- Permite tiles em CDN futuramente (Cloudflare R2 → mais cache, menos custo).

### Negativas / trade-offs

- MVT exige PostGIS 3+ (`ST_AsMVT`/`ST_AsMVTGeom`). Validado: o projeto
  Supabase roda PostGIS 3.3 (PG 17).
- Tooltips ricos via vetor exigem segunda query (`get_*_bbox`) — mas
  cacheada por TanStack Query com `queryKey` granular.
- Migração de views existentes para `useApGeojsonBbox` / `useAlertasBbox`
  é incremental — fora do escopo da própria Migration 011 (lote a lote).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Manter GeoJSON completo + simplificação client-side | Cliente continuaria baixando 40 MB; não resolve problema raiz. |
| Pre-bake tiles com `tippecanoe` em CI | Adiciona ETL externo + storage; perde reatividade a updates de dados. |
| `pg_tileserv` (binário separado) | Requer container extra na infra; Supabase Functions cobrem o caso. |
| GraphQL com cursor pagination | Sem ganho geométrico — payload por polígono continua grande. |

## Validação

- `tests/sql/test_migration_011_smoke.sql` — 6 asserts (tolerância
  monotônica, bbox cobre Piauí, MVT > 0 bytes em tile correto).
- Smoke executado via MCP: 6/6 ✅ no projeto Supabase `ssqriwgrxievcmxauegv`.

## Referências

- PostGIS docs: [ST_AsMVT](https://postgis.net/docs/ST_AsMVT.html), [ST_TileEnvelope](https://postgis.net/docs/ST_TileEnvelope.html)
- Mapbox Vector Tile Specification: https://github.com/mapbox/vector-tile-spec
- Relatório FASE 1 — Auditoria GIS 2026-06-01 (achados C1, C2, C3, A4)
