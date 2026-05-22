# Dashboard de Monitoramento de Alertas de Desmatamento — Piauí

**Órgão:** GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI  
**Período:** 2022–2025 | **Pipeline:** v2 | **Status:** em produção

[![CI](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml)
[![Deploy Frontend](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml)

---

## Visão Geral

Sistema de monitoramento que cruza alertas de desmatamento do **MapBiomas** com instrumentos de autorização e regularização ambiental (ASVs SINAFLOR+ e DERADSAs SEMARH-PI), gerando classificação espacial em 4 classes para o estado do Piauí.

Inclui validação cruzada com o **PRODES-Cerrado/INPE** e recorte especial para os 26 municípios piauienses do **MATOPIBA** (Decreto Federal nº 8.447/2015).

---

## Resultados (Pipeline v2 — última execução)

| Ano | Alertas | Área Total | Irregular | IPI (%) |
|-----|---------|-----------|-----------|---------|
| 2022 | 3.062 | 150.350 ha | 123.394 ha | 82,1% |
| 2023 | 4.527 | 138.035 ha | 97.997 ha | 71,0% |
| 2024 | 3.034 | 145.146 ha | 75.228 ha | 51,8% |
| 2025 | 2.676 | 152.527 ha | 42.376 ha | 27,8% |

> **IPI** = Índice de Pressão Irregular = ha_irregular / ha_total × 100

**Validação PRODES (Cerrado):** 70,9% de concordância (5.918 alertas validados, ciclos 2022–2025)

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  Python pipeline (conda env "geo")                      │
│  GeoPandas · Shapely · Fiona · psycopg2                 │
│  11 etapas · 9 testes automáticos                       │
└───────────────────┬─────────────────────────────────────┘
                    │ upsert via psycopg2
┌───────────────────▼─────────────────────────────────────┐
│  Supabase PostgreSQL + PostGIS                          │
│  5 tabelas · 8 RPCs · Row Level Security                │
└───────────────────┬─────────────────────────────────────┘
                    │ PostgREST + anon key
┌───────────────────▼─────────────────────────────────────┐
│  React 18 + TypeScript + Vite                           │
│  MapLibre GL JS · Recharts · Tailwind CSS · Zustand     │
│  6 abas: Executiva · Municipal · Temporal ·             │
│          PRODES · MATOPIBA · Gestão de Dados            │
│  Deploy: Vercel (automático via GitHub Actions)         │
└─────────────────────────────────────────────────────────┘
```

**Orquestração:** Prefect Cloud v3 — 3 deployments (mensal / anual PRODES / dry-run)

---

## Pré-requisitos

### Ambiente Python

```
Gerenciador: Miniconda
Ambiente:    geo
Python:      3.12.7
```

Instalar dependências:
```powershell
conda env create -f environment.yml
conda activate geo
```

Pacotes principais: `geopandas 1.1.1`, `shapely 2.0.7`, `fiona 1.10.1`, `pandas 2.3.3`, `numpy 2.3.4`, `requests 2.32.5`, `supabase 2.30.0`

### Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher:

```
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...   # NUNCA commitar; nunca usar no frontend
SUPABASE_ANON_KEY=eyJ...
MAPBIOMAS_TOKEN=...
```

> **Segurança**: O `.env` está no `.gitignore`. A `SUPABASE_SERVICE_KEY` jamais deve aparecer no frontend ou ser commitada.

---

## Executar o Pipeline

```powershell
# Opcao 1 — duplo clique
rodar_pipeline.ps1

# Opcao 2 — linha de comando
conda activate geo
$env:PYTHONUTF8 = "1"
python -m pipeline
```

O pipeline executa 11 etapas e 9 testes automáticos (T1–T9). Todos devem passar antes de uso institucional.

---

## Estrutura do Repositório

```
├── pipeline/               # Módulo Python — 11 etapas, 9 testes
│   ├── __main__.py         # Ponto de entrada: python -m pipeline
│   ├── readers.py          # Leitura dos GeoJSONs brutos
│   ├── parsers.py          # Parse de campos (datas, status, flags)
│   ├── classify.py         # Núcleo metodológico — fragmentação em 4 classes
│   ├── spatial.py          # Operações espaciais (reprojeção, interseção)
│   ├── aggregate.py        # Agregado por município × ano
│   ├── indicators.py       # Reincidência, defasagem, MATOPIBA
│   ├── quality.py          # Testes T1–T9
│   ├── validation.py       # Validação cruzada PRODES
│   ├── constants.py        # Constantes metodológicas
│   ├── constants.json      # Export JSON para CI (sincronizado com constants.py)
│   └── _upload_supabase.py # Upload para Supabase via psycopg2
│
├── frontend/               # React 18 + TypeScript — dashboard web
│   ├── src/pages/          # ExecutivaPage, MunicipalPage, TemporalPage,
│   │                       # ProdesPage, MatopibaPage, DadosPage
│   ├── src/lib/            # supabase.ts, queries.ts, hooks.ts, constants.ts
│   ├── src/components/     # MapView, FilterPanel, ErrorBoundary, StatusBadge
│   └── public/data/        # monthly_alertas.json, resumo_estatico.json (fallback)
│
├── infra/
│   ├── supabase/migrations/ # 001–004 SQL migrations
│   └── prefect/            # pipeline_flow.py + prefect.yaml (3 deployments)
│
├── tests/                  # pytest — testes unitários Python
├── base de dados/          # Dados brutos (GeoJSONs não versionados — ver .gitignore)
├── Resultado/              # Outputs do pipeline (GeoJSONs, JSONs, logs)
│
├── _baixar_prodes.py       # Download PRODES via WFS TerraBrasilis
├── _gerar_documentacao.py  # Gera Documentacao_Tecnica_Desmatamento_PI.docx
├── _gerar_nota_tecnica.py  # Gera NT-GCGEO-001/2026.docx
├── rodar_pipeline.ps1      # Execução com um clique (Windows)
├── rodar_download_prodes.ps1
├── Dockerfile              # Container para execução isolada
├── docker-compose.yml
└── environment.yml         # Dependências conda
```

---

## Classificação em 4 Classes

| Classe | Condição | Cor |
|--------|----------|-----|
| `AUTORIZADO` | Cobertura ASV >= 99% da área do alerta | Verde `#10B981` |
| `AUTORIZADO_PARCIALMENTE` | Cobertura ASV entre 0% e 99% | Verde c/ opacidade |
| `REGULARIZADO` | Área residual coberta por DERADSA (2024–2025) | Laranja `#F97316` |
| `IRREGULAR` | Sem instrumento válido | Vermelho `#EF4444` |

**Precedência:** ASV → DERADSA → IRREGULAR (nunca invertida)  
**Limiar:** `THRESHOLD_AUTORIZADO = 0.99` (99%)  
**CRS de cálculo:** EPSG:5880 (SIRGAS 2000 / Brasil Policônico — equivalente)  
**CRS de exportação:** EPSG:4326 (WGS 84 geográfico — GeoJSON padrão)

---

## Frontend — Executar Localmente

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173

# Build de produção
npm run build
```

Variáveis de ambiente para o frontend (`frontend/.env`):
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # Apenas a chave pública (anon)
```

---

## CI/CD

| Workflow | Trigger | O que faz |
|----------|---------|-----------|
| `ci.yml` | Push/PR → main | TypeScript build · ruff lint · pytest · SQL check · constants sync |
| `deploy-frontend.yml` | Push/PR → main (frontend/) | Build Vite → Deploy Vercel |
| `update-alertas.yml` | Mensal (cron) | Download MapBiomas → atualiza Supabase |
| `update-asvs.yml` | Semanal (cron) | Download ASVs SINAFLOR+ → atualiza Supabase |
| `update-prodes.yml` | Anual — outubro (cron) | Download PRODES WFS → re-executa pipeline |

**Secrets necessários (GitHub → Settings → Secrets → Actions):**
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `MAPBIOMAS_TOKEN`

---

## Dados Brutos

Os GeoJSONs de entrada **não são versionados** (ultrapassa limite do GitHub). Devem estar em `base de dados/`:

```
Alertas de Desmatamento(MAPBIOMAS).geojson    # MapBiomas Alerta API
ASVs Emitidas-PI(SINAFLOR+).geojson          # SINAFLOR/IBAMA
DERADSAs Emitidas[SEMARH-2024].geojson       # GCGEO/SEMARH-PI
DERADSAs Emitidas[SEMARH-2025].geojson       # GCGEO/SEMARH-PI
PRODES_Cerrado_PI.geojson                    # TerraBrasilis WFS (opcional)
```

Download do PRODES:
```powershell
rodar_download_prodes.ps1
```

---

## Banco de Dados (Supabase)

Projeto: `ubcejvbnpuyouwpphryc`

Aplicar migrations (ordem obrigatória):
```sql
-- Supabase SQL Editor
001_schema_inicial.sql
002_matopiba_view.sql
003_deradsa_management.sql
004_prodes_rpc_fix.sql   -- corrige n_total na RPC get_resumo_prodes
```

---

## Responsabilidade Metodológica

- O pipeline valida **seu próprio processamento** (T1–T9)
- Qualidade dos dados de entrada é responsabilidade das instituições produtoras
- Incerteza posicional MapBiomas (~±15 m) é limitação de fonte
- **"Estimativa exploratória" != "dado para autuação"** — separação institucional obrigatória

---

*GCGEO / SEMARH-PI — Pipeline v2 — 2026*
