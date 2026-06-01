# ROADMAP DE CONSOLIDAÇÃO — Dashboard REDD+ Piauí
**Versão**: 1.0 | **Data**: 2026-06-01 | **Baseline**: branch `feature/areas-prioritarias-v3`, 7 commits pós-auditoria GIS

> Este documento lista, com base na análise arquitetural pós-auditoria de
> 2026-06-01 (Migration 011, 144 testes pytest, ADR-008), o que ainda falta
> para o projeto alcançar **maturidade enterprise / production-ready**.

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
| Centralizar configuração de paths absolutos (`C:\11. REDD+\...`) em `core/config.py` lendo `.env` — hoje cada módulo tem `Path("C:/...")` hardcoded | P | Alta |
| **CI execução parcial**: hoje CI roda só lint+pytest; adicionar smoke do pipeline em modo dry-run (1 município) por PR | M | Média |

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
| **Métricas Supabase**: dashboard Grafana com p50/p95 das RPCs `get_*` (Migration 011 expõe novas) — alarme se p95 > 2 s | M | Alta |
| **Web Vitals** (LCP, INP, CLS) por view do dashboard — múltiplos usuários acessando o mapa de áreas prioritárias pode revelar gargalo MapLibre não capturado em local | P | Alta |
| **Healthcheck endpoint** `/api/health` validando: Supabase reachable, última execução do pipeline < 35 dias, RPCs respondendo, MVT cache funcional | P | Média |
| **PostHog** ou similar para eventos de uso (`view_changed`, `municipio_selected`, `export_clicked`) — entender quais features são realmente usadas | M | Média |
| Alertas Slack/Email para falhas do pipeline mensal (já existe no Prefect Cloud, validar configuração) | P | Média |
| **Tracing distribuído** (OpenTelemetry) ligando frontend → PostgREST → função SQL — debug de "por que o KPI demorou 4 s" | G | Baixa |

---

## 5. Débito Técnico Restante (não abordado na auditoria atual)

Itens listados ou observados durante a auditoria mas **fora do escopo** dos 7 commits aplicados — devem ser priorizados nos próximos sprints.

| Item | Onde | Esforço | Prioridade |
|---|---|---|---|
| **Migrar views existentes para `useApGeojsonBbox` / `useAlertasBbox`** — Migration 011 já criou as RPCs, falta usar em todas as views | `frontend/src/modules/*/views/*.tsx` | M | **Crítica** |
| Implementar `feature-state` hover real (não só rAF) — `setFeatureState({hover:true})` + paint expression com `['feature-state', 'hover']` para hover sem React re-render | `ChoroplethMap.tsx`, `BaseMap.tsx` | P | Alta |
| Padrão **hatch / textura** para classe 5 (protanopia) — adicionar `fill-pattern` sprite no estilo MapLibre | `areas_prioritarias` views | M | Alta |
| Auditoria do módulo **`queimadas_bdq`** (não auditado em profundidade — agente bloqueado) | `modules/queimadas_bdq/` + views | M | Alta |
| **Deep-linking URL ↔ filtros** (`useSearchParams` ou `nuqs`) — hoje refresh perde `anoFiltro`, `selectedMunicipio` | `useAppStore.ts` + `App.tsx` | P | Alta |
| Empty states informativos (mostrar filtros aplicados + CTA "Limpar") | views genéricas | P | Média |
| Responsividade mobile (<640 px) — KPI cards 5-em-linha não quebram | shell + views | M | Média |
| Remover `// @ts-nocheck` em `types.ts` — tipar corretamente os `LAYER_CONFIG` | `areas_prioritarias/types.ts:1` | P | Média |
| Eliminar duplicação de scripts auxiliares na raiz do projeto-pai (`C:\11. REDD+\_*.py`) — consolidar em `scripts/` do repo | repo root | M | Baixa |
| Migrar paths absolutos `C:\11. REDD+\...` em manifestos para `.env` ou config central | manifests de cada módulo | P | Alta |
| Atualizar **CLAUDE.md** com seção "Migration 011 + auditoria" (resumo das mudanças aplicadas) | `CLAUDE.md` | P | Média |
| Manifest do módulo `_template/` desatualizado vs novos manifests v3 (sem DETER gap, sem 5 classes) | `modules/_template/` | P | Baixa |
| **dvc** ou **git-lfs** para os rasters versionados (`16_prioridade_classes_final.tif`, `agb.tif`) — hoje fora do repo | infra | M | Média |
| **`ruff` no env** — não instalado localmente (`ruff check` falhou); existe no CI mas dev local não consegue rodar | `environment.yml` | P | Baixa |
| Substituir RPCs deprecadas após 1 release (decisão ADR-008): `get_alertas_geojson`, `get_ap_geojson` → DROP | `infra/supabase/migrations/012_*.sql` | P | Média |
| Centralizar `MATOPIBA_SET` em uma tabela `municipios_matopiba` com flag — hoje hardcoded em `core/lib/constants.ts` | banco + frontend | P | Baixa |
| Componente único `<Legend>` reutilizável entre `BaseMap` e `ChoroplethMap` em vez de inline em cada um | `shared/components/Map/Legend.tsx` | M | Baixa |
| Tests de regressão visual (Playwright + screenshot diff) das views principais | `frontend/test/visual/` | G | Baixa |
| Atualizar dependência `react-map-gl` ao mainline com tipos TS estáveis (atualmente algumas `as unknown as` para contornar) | `frontend/package.json` | M | Baixa |

---

## Resumo executivo — caminho recomendado

**Sprint 1 (próximas 2 semanas)** — completar a Onda 1 da auditoria
1. Migrar todas as views áreas_prioritárias para `useApGeojsonBbox`
2. Endpoint de export GeoPackage/Shapefile
3. Sentry no frontend + backend
4. Auditoria do módulo `queimadas_bdq`

**Sprint 2 (3-4 semanas)** — compliance e observabilidade
5. Testes de precisão posicional contra ArcGIS
6. Métricas Supabase em Grafana + alertas p95
7. `feature-state` hover + hatch protanopia
8. Deep-linking URL ↔ filtros

**Sprint 3 (4-6 semanas)** — orquestração enterprise
9. Prefect Flows com DAG de dependência
10. dbt para transformações SQL
11. Healthcheck endpoint
12. ISO 19115 metadata em exports

**Backlog estratégico** — OGC API Features, STAC, OpenTelemetry, regression
visual tests.

---

*CGEO / SEMARH-PI — atualizado em 2026-06-01 após auditoria GIS profunda
e aplicação da Migration 011.*
