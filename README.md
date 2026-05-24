# Monitoramento de Alertas de Desmatamento — Piauí

**Órgão:** CGEO — Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI  
**Período:** 2022–2025 | **Plataforma:** v2.0 | **Status:** Produção

[![CI](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml)
[![Deploy Frontend](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml)

---

## Visão Geral

Sistema de monitoramento geoespacial que cruza alertas de desmatamento do **MapBiomas Alerta** com instrumentos de autorização e regularização ambiental emitidos no Piauí — ASVs (SINAFLOR+/IBAMA) e DERADSAs (SEMARH-PI) — classificando cada alerta em 4 classes de situação fundiária-ambiental.

Inclui validação cruzada com o **PRODES-Cerrado/INPE** e recorte especial para os 26 municípios piauienses do **MATOPIBA** (Decreto Federal nº 8.447/2015).

---

## Resultados — Plataforma v2 (última execução)

| Ano | Alertas | Área Total | Irregular | IPI (%) |
|-----|---------|------------|-----------|---------|
| 2022 | 3.062 | 150.350 ha | 123.394 ha | 82,1% |
| 2023 | 4.527 | 138.035 ha | 97.997 ha | 71,0% |
| 2024 | 3.034 | 145.146 ha | 75.228 ha | 51,8% |
| 2025 | 2.676 | 152.527 ha | 42.376 ha | 27,8% |

> **IPI** = Índice de Pressão Irregular = ha_irregular / ha_total × 100  
> Tendência de queda consistente: 82,1% → 27,8% entre 2022 e 2025.

**Validação PRODES-Cerrado:** 70,9% de concordância — 5.918 alertas validados, ciclos 2022–2025.  
**Municípios reincidentes** (irregular em ≥ 3 anos): 20 municípios, concentrados no MATOPIBA piauiense.

---

## Classificação em 4 Classes

| Classe | Condição | Cor |
|--------|----------|-----|
| `AUTORIZADO` | Cobertura ASV ≥ 99% da área do alerta | Verde `#10B981` |
| `AUTORIZADO_PARCIALMENTE` | Cobertura ASV entre 0% e 99% | Azul `#60A5FA` |
| `REGULARIZADO` | Área residual coberta por DERADSA (série 2024–2025) | Laranja `#F97316` |
| `IRREGULAR` | Sem instrumento ambiental válido | Vermelho `#EF4444` |

**Precedência instrumental:** ASV → DERADSA → IRREGULAR  
**Limiar de autorização:** `THRESHOLD_AUTORIZADO = 0.99` (99%)  
**CRS de cálculo:** EPSG:5880 — SIRGAS 2000 / Brasil Policônico  
**CRS de exportação:** EPSG:4326 — WGS 84

---

## Arquitetura — Plataforma Modular v2

```
┌─────────────────────────────────────────────────────────────┐
│  Plataforma Python  (Vertical Slice + Plugin Registry)      │
│                                                             │
│  core/           — registry, orchestrator, uploader, utils │
│  modules/        — 5 módulos independentes com manifest    │
│    alertas_mapbiomas  (classify + aggregate + upload)      │
│    asvs_sinaflor      (download WFS IBAMA)                 │
│    deradsa_semarh     (download Supabase Storage)          │
│    prodes_cerrado     (validação INPE)                     │
│    municipios_ibge    (malha IBGE)                         │
│                                                             │
│  105 testes pytest  ·  9 testes de qualidade (T1–T9)       │
└────────────────────────────┬────────────────────────────────┘
                             │ upsert via psycopg2
┌────────────────────────────▼────────────────────────────────┐
│  Supabase PostgreSQL + PostGIS                              │
│  5 tabelas · 8 RPCs · Row Level Security · 5 migrations    │
│  projeto: ubcejvbnpuyouwpphryc                             │
└────────────────────────────┬────────────────────────────────┘
                             │ PostgREST (anon key)
┌────────────────────────────▼────────────────────────────────┐
│  Dashboard React 19 + TypeScript (Modular Shell)           │
│                                                             │
│  core/layout/    — AppShell, TabRouter                     │
│  modules/        — 3 módulos frontend com views lazy       │
│  shared/         — BaseMap, FilterPanel, StatusBadge       │
│                                                             │
│  MapLibre GL · Recharts · Zustand · TanStack Query         │
│  6 abas: Visão Geral · Municipal · Temporal ·              │
│          PRODES · MATOPIBA · Gestão de Dados               │
│  Deploy: Vercel (automático via GitHub Actions)            │
└─────────────────────────────────────────────────────────────┘
```

**Orquestração:** Prefect Cloud v3 — 3 deployments (mensal / anual PRODES / dry-run)  
**CI/CD:** GitHub Actions — 6 workflows (build · lint · test · deploy · release-module)

---

## Estrutura do Repositório

```
├── core/                       # Núcleo da plataforma
│   ├── registry.py             # Plugin registry — descobre módulos por manifest
│   ├── orchestrator.py         # Orquestrador — entry point da plataforma
│   ├── uploader.py             # upload_geodataframe() + upload_json() → Supabase
│   ├── spatial_core.py         # Operações espaciais (reprojeção, fix_geoms)
│   ├── utils.py                # Helpers compartilhados
│   └── constants.py            # Constantes metodológicas + export JSON
│
├── modules/                    # Módulos de análise (Vertical Slice)
│   ├── alertas_mapbiomas/      # classify · aggregate · upload (prio 10)
│   ├── asvs_sinaflor/          # download WFS IBAMA (prio 1)
│   ├── deradsa_semarh/         # download Supabase Storage (prio 2)
│   ├── prodes_cerrado/         # validação INPE (prio 3)
│   ├── municipios_ibge/        # malha municipal IBGE (prio 4)
│   └── _template/              # Template para novos módulos
│
├── frontend/                   # Dashboard React 19 + TypeScript
│   └── src/
│       ├── core/               # store · lib · layout (AppShell, TabRouter)
│       ├── modules/            # Views por módulo (lazy-loaded)
│       └── shared/             # Componentes reutilizáveis (BaseMap, Filters)
│
├── design/                     # Design System
│   ├── tokens/                 # colors.json · typography.json · spacing.json
│   └── ux/                     # Personas · UDRs · Flows
│
├── infra/
│   ├── supabase/migrations/    # 5 migrations SQL (001–005)
│   ├── prefect/                # pipeline_flow.py + prefect.yaml
│   └── docker/                 # Dockerfile + docker-compose.yml
│
├── data/
│   ├── raw/                    # GeoJSONs de entrada (não versionados via .gitignore)
│   └── output/                 # JSONs gerados pelo pipeline (agregados, resumos)
│
├── scripts/                    # Scripts auxiliares
│   ├── rodar_pipeline.ps1      # Execução com um clique (Windows)
│   ├── _baixar_prodes.py       # Download PRODES WFS TerraBrasilis
│   └── _check_env.py           # Verifica variáveis de ambiente
│
├── docs/
│   ├── architecture/           # ADR-001 a ADR-007 + DECISIONS.md
│   └── MIGRATION-PLAN.md       # Plano de migração v1 → v2
│
├── tests/                      # pytest — testes unitários Python
├── pipeline/                   # Bridge v1→v2 (constants.json para Vite)
├── environment.yml             # Dependências conda (CI/Docker)
└── README.md
```

---

## Pré-requisitos

### Ambiente Python (execução local)

```powershell
# Criar ambiente conda (primeira vez)
conda create -n geo python=3.12 -c conda-forge
conda activate geo
conda install -n geo -c conda-forge geopandas shapely fiona pandas numpy requests python-dotenv
pip install "supabase>=2.9.0"

# Variáveis obrigatórias no PowerShell
$env:PYTHONUTF8 = "1"
$env:GDAL_DATA  = "C:\miniconda3\envs\geo\Library\share\gdal"
$env:PROJ_LIB   = "C:\miniconda3\envs\geo\Library\share\proj"
```

> `environment.yml` define o ambiente `desmatamento` usado pelo CI/Docker.

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
SUPABASE_ANON_KEY=sb_publishable_...
VITE_SUPABASE_URL=https://[ref].supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

---

## Executar o Pipeline

```powershell
# Opção 1 — um clique (recomendado)
scripts\rodar_pipeline.ps1

# Opção 2 — linha de comando
conda activate geo
$env:PYTHONUTF8 = "1"
python -m core.orchestrator
```

O orquestrador descobre módulos via `core/registry.py`, executa em ordem de prioridade
e valida com 9 testes automáticos (T1–T9). Todos devem passar antes do uso institucional.

### Docker

```bash
cp .env.example .env
docker compose --project-directory infra/docker --profile pipeline up
```

---

## Dados Brutos

Os GeoJSONs de entrada **não são versionados** (excedem limite GitHub). Devem estar em `data/raw/`:

```
data/raw/Alertas de Desmatamento(MAPBIOMAS).geojson    # MapBiomas Alerta API
data/raw/ASVs Emitidas-PI(SINAFLOR+).geojson          # SINAFLOR/IBAMA WFS
data/raw/DERADSAs Emitidas[SEMARH-2024].geojson       # CGEO/SEMARH-PI
data/raw/DERADSAs Emitidas[SEMARH-2025].geojson       # CGEO/SEMARH-PI
data/raw/PRODES_Cerrado_PI.geojson                    # TerraBrasilis WFS (opcional)
```

Download automático do PRODES:

```powershell
scripts\rodar_download_prodes.ps1
```

---

## Frontend — Desenvolvimento Local

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
npm run test   # Vitest — 29 testes
npm run build  # build de produção
```

O dashboard tem **fallback em 3 níveis**: Supabase live → JSON estático (`public/data/`) → constantes hardcoded.

---

## CI/CD — GitHub Actions

| Workflow | Trigger | Ação |
|----------|---------|------|
| `ci.yml` | Push/PR → main | Build TS · lint core/modules · pytest · SQL · constants · manifest validation |
| `deploy-frontend.yml` | Push → main (`frontend/`) | Build Vite + Deploy Vercel |
| `update-alertas.yml` | Mensal — dia 5, 03h UTC | MapBiomas → pipeline → Supabase |
| `update-asvs.yml` | Semanal — segunda, 03h UTC | ASVs SINAFLOR+ → pipeline → Supabase |
| `update-prodes.yml` | Anual — 1 out, 03h UTC | PRODES WFS → pipeline → Supabase |
| `release-module.yml` | Manual (`workflow_dispatch`) | Valida módulo + cria tag `module/<id>/v<ver>` |

**Secrets necessários** (GitHub → Settings → Secrets → Actions):

`SUPABASE_URL` · `SUPABASE_SERVICE_KEY` · `SUPABASE_ANON_KEY` · `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `MAPBIOMAS_EMAIL` · `MAPBIOMAS_PASSWORD` · `VERCEL_TOKEN` · `VERCEL_ORG_ID` · `VERCEL_PROJECT_ID`

---

## Banco de Dados (Supabase)

Migrations aplicadas em ordem via SQL Editor:

| Migration | Conteúdo |
|-----------|----------|
| `001_schema_inicial.sql` | Tabelas principais, índices, RPCs base |
| `002_matopiba_view.sql` | View MATOPIBA, RPCs municipais |
| `003_deradsa_management.sql` | Gestão de DERADSAs via frontend |
| `004_prodes_rpc_fix.sql` | Correção `get_resumo_prodes` — n_total exclui SEM_PRODES |
| `005_security_hardening.sql` | REVOKE anon, search_path, unique parcial |

---

## Adicionar Novo Módulo

```bash
# 1. Copiar template
cp -r modules/_template modules/meu_modulo

# 2. Preencher manifest.py (MODULE_MANIFEST + run())
# 3. Implementar downloader.py e processor.py
# 4. Criar migrations/001_schema.sql
# 5. Escrever testes em tests/

# O registry descobre automaticamente — sem editar core/
```

Consulte [docs/modules/COMO-CRIAR-MODULO.md](docs/modules/COMO-CRIAR-MODULO.md) para guia completo.

---

## Responsabilidade Metodológica

- O pipeline valida **seu próprio processamento** (T1–T9) — não a qualidade dos dados de entrada
- Incerteza posicional MapBiomas (~±15 m) é limitação da fonte, não da metodologia
- DERADSAs disponíveis como dado geoespacial apenas para 2024–2025
- Caatinga sem validação PRODES equivalente
- **"Estimativa exploratória" ≠ "dado para autuação"** — separação institucional obrigatória

---

*CGEO / SEMARH-PI — Plataforma v2.0 — 2026*
