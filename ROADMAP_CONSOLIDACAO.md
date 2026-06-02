# ROADMAP DE CONSOLIDAÇÃO — Dashboard REDD+ Piauí
**Versão**: 2.0 | **Data**: 2026-06-02 | **Baseline**: `main` pós-auditoria GIS completa (18 achados, 11 commits, Migrations 011–014)

> Este documento foi originalmente criado em 2026-06-01 cobrindo a auditoria parcial.
> A **versão 2.0 (2026-06-02)** reflete o estado pós-auditoria GIS completa:
> os 18 achados foram endereçados, este roadmap remove os fechados e
> consolida o que ainda falta para o projeto alcançar **maturidade enterprise /
> production-ready**.

---

## 0. Resumo da Auditoria GIS de 2026-06-02

Auditoria conduzida em 5 blocos sequenciais, totalizando **18 achados endereçados**:

| Bloco | Achados | Severidade | Commits | Linhas |
|---|---|---|---|---|
| 1 — **GIS Correctness** | C1 (MAUP queimadas), C2 (CRS-aware `safe_*`) | 🔴×2 | 2 | +300 |
| 2 — **Type Safety** | C3 (`@ts-nocheck` removido), M4 (bbox normalize) | 🔴+🟡 | 1 | +33 |
| 3 — **Frontend Perf** | C4 (BaseMap bbox), A1 (Migration 012), A2 (tema), A3 (closure), A4 (CI), A6 (null-safe) | 🔴+🟠×5 | 3 | +350 |
| 4 — **Infra Hardening** | A5 (paths externalizados), B1 (GRANTs), B2 (smokes 008/009), M3 (índice) | 🟠+🟡+🟢×2 | 2 | +527 |
| 5 — **Cartografia & Cache** | M1 (tolerância choropleth), M2 (Cache-Control), M5 (Natural Breaks) | 🟡×3 | 3 | +600 |
| **TOTAL** | **18/18** | 4🔴 + 6🟠 + 6🟡 + 2🟢 | **11** | **+1.800** |

**Validação**: 169 testes pytest, 17 testes vitest, 37 asserts SQL em 6 smokes,
preview manual nas views afetadas (BaseMap, BiomassaView).

**Metodologia preservada**: AHP CGEO (5 classes), precedência ASV > DERADSA,
MIN_AREA_M2 em EPSG:5880, AQ1km/INPE — tudo intacto. Nenhuma fonte externa
teve sua metodologia alterada.

Documentação metodológica atualizada em paralelo: [`docs/DATA_ANALYSIS_METHODOLOGY.md`](docs/DATA_ANALYSIS_METHODOLOGY.md).

---

## 1. Integração e Pipelines de Dados

**Estado atual**: scripts/módulos Python (`modules/*/`) rodam manualmente via
`python -m core.orchestrator`. Prefect Cloud v3 com 3 deployments
existe mas é parcialmente usado.

| Pendência | Esforço | Prioridade |
|---|---|---|
| Empacotar os 7 módulos como **Prefect Flows** com retry, timeout e SLA por step (download/process/upload), publicando métricas em Prefect Cloud | M | Alta |
| Materializar **dependência de dados** entre módulos no Prefect (ex: `areas_prioritarias` depende de `municipios_ibge`; `prodes_cerrado` deve rodar antes da validação cruzada de `alertas_mapbiomas`) | M | Alta |
| **DAG observável**: cada execução grava `ap_execucoes`/`execucoes_pipeline` com `git_sha`, `prefect_run_id` e link para logs | P | Média |
| Substituir o orchestrator caseiro (`core/orchestrator.py`) por um wrapper fino sobre Prefect — manter CLI para uso local, mas delegar coordenação | M | Média |
| **dbt** para as transformações SQL: views materializadas (MATOPIBA, rankings) ficariam declarativas, testadas e versionadas separadamente de migrations | G | Média |
| Pipeline Prefect para **refresh diário** dos hot caches (alertas DETER do gap, MVT cache invalidation) | P | Baixa |
| ~~Centralizar configuração de paths absolutos~~ ✅ **Resolvido** em 2026-06-02 (auditoria A5) — `core/config.py` + `.env REDD_DATA_ROOT` + guard de regressão | — | — |
| **CI execução parcial**: hoje CI roda só lint+pytest; adicionar smoke do pipeline em modo dry-run (1 município) por PR | M | Média |
| Adicionar etapa de **smoke SQL no CI** (psql/Supabase REST contra um banco de testes) para rodar os 6 arquivos em `tests/sql/*.sql` automaticamente | M | Média |

---

## 2. Exportação e Interoperabilidade

**Estado atual**: dados saem do pipeline como GeoJSON e SQL EWKT.
Frontend serve GeoJSON via RPC. **Não há rota de exportação ao usuário final**.

| Pendência | Esforço | Prioridade |
|---|---|---|
| Endpoint `/api/export/areas_prioritarias.{format}` — `format ∈ {shp, gpkg, geojson, csv}` usando `pyogrio` + `fiona` no servidor (ou edge function) | M | **Crítica** |
| Endpoint paralelo para alertas classificados, agregado municipal e ranking | M | Alta |
| Botão "Baixar resultado" em cada view do dashboard (Visão Geral, Municipal, Ranking, PRODES, Biomassa, Queimadas, MATOPIBA) com seletor de formato | P | Alta |
| **GeoPackage com camadas múltiplas** (`alertas`, `municipios`, `classes`, `prodes`) — formato preferido para ArcGIS/QGIS desktop | M | Alta |
| Metadados ISO 19115 em formato XML embarcados no GeoPackage (`gpkg_metadata`) — exigência para uso oficial | M | Média |
| **Documentação de schema** versão por versão dos formatos exportados (`docs/exports/`) com exemplos de leitura em ArcGIS Python, R, QGIS | M | Média |
| OGC API Features (substituto moderno do WFS) — opcional, mas abre interop direta com geoserver/QGIS sem download manual | G | Baixa |
| Integração STAC para os rasters de biomassa e prioridade (catálogo descobrível) | G | Baixa |

---

## 3. Compliance Técnico (precisão para uso oficial)

**Estado atual**: pipeline tem 9 testes T1–T9 de reconciliação interna,
mas falta validação cruzada formal e separação institucional.

| Pendência | Esforço | Prioridade |
|---|---|---|
| **Testes de precisão posicional**: validar `area_ha` contra cálculo independente (ex: `arcpy.Project_management` + `CalculateGeometryAttributes`) em ≥ 10 alertas amostrados | M | **Crítica** |
| **Selo "Estimativa exploratória"** já está no README — propagar como badge no PDF gerado e em cada export (CSV/SHP têm um arquivo `.txt` ou `.xml` acompanhante) | P | Alta |
| **Tolerâncias documentadas** por etapa (MapBiomas ±15 m, PRODES ±30 m, MIN_AREA_M2=1 m²) num campo `precision_note` em cada export | P | Alta |
| **Validação de NBR ISO 19157** (qualidade de dados geográficos) — checklist de conformidade documentado em `docs/COMPLIANCE.md` | M | Média |
| **Assinatura digital** do PDF gerado por `_gerar_nota_tecnica.py` (Drasil ICP-Brasil ou similar) para uso institucional CGEO/SEMARH-PI | G | Média |
| Auditoria externa periódica do produto AHP (peso 83% Pressão + 17% AGB) — registrar versão metodológica no `ap_execucoes.metodologia_versao` | P | Baixa |
| Conformidade **Lei Geral de Proteção de Dados** se algum dado pessoal vier de DERADSAs (verificar campos do SEMARH-PI) | M | Média |

---

## 4. Monitoramento e Observabilidade

**Estado atual**: logs Python via `logging.basicConfig`, sem agregação.
Nenhuma instrumentação no frontend além de fallback de erros.

| Pendência | Esforço | Prioridade |
|---|---|---|
| **Sentry** no frontend (`@sentry/react`) — captura erros de renderização MapLibre, RPC 500, queries que retornam shape inesperado | P | **Crítica** |
| **Sentry no backend** Python — pipeline silencioso hoje em produção (cron mensal); um `unary_union` que falha não notifica ninguém | P | Alta |
| **Métricas Supabase**: dashboard Grafana com p50/p95 das RPCs `get_*` (Migrations 011–014 expõem 9 novas) — alarme se p95 > 2 s | M | Alta |
| **Web Vitals** (LCP, INP, CLS) por view do dashboard — múltiplos usuários acessando o mapa de áreas prioritárias pode revelar gargalo MapLibre não capturado em local | P | Alta |
| **Healthcheck endpoint** `/api/health` validando: Supabase reachable, última execução do pipeline < 35 dias, RPCs respondendo, MVT cache funcional | P | Média |
| **PostHog** ou similar para eventos de uso (`view_changed`, `municipio_selected`, `export_clicked`) — entender quais features são realmente usadas | M | Média |
| Alertas Slack/Email para falhas do pipeline mensal (já existe no Prefect Cloud, validar configuração) | P | Média |
| **Tracing distribuído** (OpenTelemetry) ligando frontend → PostgREST → função SQL — debug de "por que o KPI demorou 4 s" | G | Baixa |

---

## 5. Débito Técnico Restante (após auditoria 2026-06-02)

Os itens **endereçados** pela auditoria GIS de 2026-06-02 (18 achados, 11 commits)
foram **removidos** desta tabela. O que permanece está priorizado para os
próximos sprints.

### ✅ Endereçados — não precisam mais entrar no sprint

| Item original | Resolvido por | Commit |
|---|---|---|
| Migrar views para `useApGeojsonBbox`/`useAlertasBbox` (C4 + A1 + frontend hooks) | BaseMap migrado + QueimadasMap padrão futuro | `013b77f`, `462e9eb` |
| Auditoria do módulo `queimadas_bdq` | Auditado em profundidade (C1, A1–A6) | Bloco 1, 3 |
| Remover `// @ts-nocheck` em `types.ts` | `frontend/src/modules/areas_prioritarias/types.ts` + `index.tsx` | `15558d5` |
| Migrar paths `C:\11. REDD+\...` para `.env` (A5) | `core/config.py` + 14 testes + guard de regressão | `7dd998c` |

### 🔄 Pendente — débito real

| Item | Onde | Esforço | Prioridade |
|---|---|---|---|
| Implementar `feature-state` hover real (não só rAF) — `setFeatureState({hover:true})` + paint expression com `['feature-state', 'hover']` para hover sem React re-render | `ChoroplethMap.tsx`, `BaseMap.tsx` | P | Alta |
| Padrão **hatch / textura** para classe 5 (protanopia) — `fill-pattern` sprite no estilo MapLibre | `areas_prioritarias` views | M | Alta |
| **Deep-linking URL ↔ filtros** (`useSearchParams` ou `nuqs`) — hoje refresh perde `anoFiltro`, `selectedMunicipio` | `useAppStore.ts` + `App.tsx` | P | Alta |
| **`tsconfig strict: true`** no frontend — descoberta lateral do Bloco 2. `noUnusedLocals` + `noUnusedParameters` ativos, mas `strict` desligado. Ataque incremental por arquivo | `frontend/tsconfig.app.json` | M | **Alta** |
| **`RankingView.tsx:60` faz `setSelectedMunicipio({ ..., bbox: m.bbox })` mas a RPC `get_ap_ranking` não retorna `bbox`** — click no ranking provavelmente não dá fitBounds. Adicionar `bbox` ao SELECT da RPC ou usar fallback | `infra/supabase/migrations/` + `RankingView.tsx` | P | **Alta** |
| Migrar `QueimadasMap` para `useQueimadasBbox` (Migration 012 já criou RPC) | `frontend/src/modules/queimadas_bdq/components/QueimadasMap.tsx` | P | Média |
| Aplicar Migrations 012, 013, 014 + smokes 008/009 no Supabase de produção | Supabase SQL Editor | P | **Crítica** |
| Empty states informativos (mostrar filtros aplicados + CTA "Limpar") | views genéricas | P | Média |
| Responsividade mobile (<640 px) — KPI cards 5-em-linha não quebram | shell + views | M | Média |
| Eliminar duplicação de scripts auxiliares em `C:\11. REDD+\_*.py` — consolidar em `scripts/` do repo | repo root | M | Baixa |
| Atualizar **CLAUDE.md** com resumo da auditoria 2026-06-02 (15 → 18 achados, Migrations 011–014, ckmeans, MAUP fix, CRS guard) | `CLAUDE.md` | P | Média |
| Manifest do módulo `_template/` desatualizado vs novos manifests v3 (sem DETER gap, sem 5 classes) | `modules/_template/` | P | Baixa |
| **dvc** ou **git-lfs** para os rasters versionados (`16_prioridade_classes_final.tif`, `agb.tif`) — hoje fora do repo | infra | M | Média |
| Substituir RPCs deprecadas após 1 release: `get_alertas_geojson`, `get_ap_geojson`, `get_qb_municipios` → DROP | `infra/supabase/migrations/015_drop_deprecated.sql` (futura) | P | Média |
| Centralizar `MATOPIBA_SET` em uma tabela `municipios_matopiba` com flag — hoje hardcoded em `core/lib/constants.ts` | banco + frontend | P | Baixa |
| Componente único `<Legend>` reutilizável entre `BaseMap`, `ChoroplethMap` e `QueimadasMap` em vez de inline | `shared/components/Map/Legend.tsx` | M | Baixa |
| Tests de regressão visual (Playwright + screenshot diff) das views principais | `frontend/test/visual/` | G | Baixa |
| Atualizar dependência `react-map-gl` ao mainline com tipos TS estáveis (atualmente algumas `as unknown as` para contornar) | `frontend/package.json` | M | Baixa |
| Resolver binding rolldown-vite no ambiente local Windows (vitest falhou ao executar `breaks.test.ts`) — possivelmente um `npm install` limpo resolve | `frontend/node_modules` | P | Baixa |

---

## Resumo executivo — caminho recomendado (v2.0 — pós auditoria 2026-06-02)

**Crítico imediato** (≤ 1 dia)
1. **Aplicar Migrations 012, 013, 014 no Supabase SQL Editor** (ordem: 012 → 013 → 014)
2. Rodar os 5 smokes SQL (`tests/sql/test_migration_*_smoke.sql`)
3. Fixar `RankingView.bbox` ausente da RPC

**Sprint 1 (próximas 2 semanas)** — fechar pendências curtas
4. `feature-state` hover real + hatch protanopia
5. Deep-linking URL ↔ filtros
6. Migrar QueimadasMap para `useQueimadasBbox` (Migration 012)
7. Endpoint de export GeoPackage/Shapefile (Crítica do item 2 acima)
8. Atualizar CLAUDE.md com resumo da auditoria 2026-06-02

**Sprint 2 (3-4 semanas)** — compliance e observabilidade
9. Testes de precisão posicional contra ArcGIS
10. Métricas Supabase em Grafana + alertas p95
11. Sentry no frontend + backend (`VITE_SENTRY_DSN`, `SENTRY_DSN` já no `.env.example`)
12. `tsconfig strict` no frontend — ataque incremental
13. Responsividade mobile

**Sprint 3 (4-6 semanas)** — orquestração enterprise
14. Prefect Flows com DAG de dependência
15. dbt para transformações SQL
16. Healthcheck endpoint
17. ISO 19115 metadata em exports
18. DROP das RPCs deprecadas (`get_alertas_geojson`, `get_ap_geojson`, `get_qb_municipios`)

**Backlog estratégico** — OGC API Features, STAC, OpenTelemetry, regression
visual tests, `<Legend>` componentizado, `municipios_matopiba` no banco.

---

*CGEO / SEMARH-PI — atualizado em **2026-06-02** após auditoria GIS completa
(18 achados endereçados, Migrations 011–014, 11 commits).
Versão anterior: 2026-06-01 (cobertura parcial — apenas Migration 011).*
