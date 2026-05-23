# Dashboard de Monitoramento de Alertas de Desmatamento — Piauí

**Órgão:** GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI  
**Período:** 2022–2025 | **Pipeline:** v2 | **Status:** Produção

[![CI](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/ci.yml)
[![Deploy Frontend](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi/actions/workflows/deploy-frontend.yml)

---

## Visão Geral

Sistema de monitoramento geoespacial que cruza alertas de desmatamento do **MapBiomas Alerta** com instrumentos de autorização e regularização ambiental emitidos no Piauí — ASVs (SINAFLOR+/IBAMA) e DERADSAs (SEMARH-PI) — classificando cada alerta em 4 classes de situação fundiária-ambiental.

Inclui validação cruzada com o **PRODES-Cerrado/INPE** e recorte especial para os 26 municípios piauienses do **MATOPIBA** (Decreto Federal nº 8.447/2015).

---

## Resultados — Pipeline v2 (última execução)

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
| `AUTORIZADO_PARCIALMENTE` | Cobertura ASV entre 0% e 99% | Verde c/ opacidade |
| `REGULARIZADO` | Área residual coberta por DERADSA (série 2024–2025) | Laranja `#F97316` |
| `IRREGULAR` | Sem instrumento ambiental válido | Vermelho `#EF4444` |

**Precedência instrumental:** ASV → DERADSA → IRREGULAR (nunca invertida)  
**Limiar de autorização:** `THRESHOLD_AUTORIZADO = 0.99` (99%)  
**CRS de cálculo:** EPSG:5880 — SIRGAS 2000 / Brasil Policônico (projeção equivalente)  
**CRS de exportação:** EPSG:4326 — WGS 84 geográfico (padrão GeoJSON/web)

---

## Arquitetura

```
┌────────────────────────────────────────────────────────┐
│  Pipeline Python  (conda env "geo" — local)            │
│  GeoPandas · Shapely · Fiona · psycopg2                │
│  11 etapas · 9 testes automáticos (T1–T9)              │
└──────────────────────┬─────────────────────────────────┘
                       │ upsert via psycopg2
┌──────────────────────▼─────────────────────────────────┐
│  Supabase PostgreSQL + PostGIS                         │
│  5 tabelas · 8 RPCs · Row Level Security               │
│  projeto: ubcejvbnpuyouwpphryc                         │
└──────────────────────┬─────────────────────────────────┘
                       │ PostgREST (anon key)
┌──────────────────────▼─────────────────────────────────┐
│  Dashboard React 18 + TypeScript                       │
│  MapLibre GL JS · Recharts · Tailwind CSS · Zustand    │
│  6 abas: Executiva · Municipal · Temporal ·            │
│          PRODES · MATOPIBA · Gestão de Dados           │
│  Deploy: Vercel (automático via GitHub Actions)        │
└────────────────────────────────────────────────────────┘
```

**Orquestração:** Prefect Cloud v3 — 3 deployments (mensal / anual PRODES / dry-run)  
**CI/CD:** GitHub Actions — 5 workflows automatizados

---

## Pré-requisitos

### Ambiente Python (execução local)

O pipeline requer [Miniconda](https://docs.conda.io/en/latest/miniconda.html) com o ambiente `geo`:

```powershell
# Criar o ambiente (primeira vez)
conda create -n geo python=3.12 -c conda-forge
conda activate geo
conda install -n geo -c conda-forge geopandas shapely fiona pandas numpy requests python-dotenv
pip install "supabase>=2.9.0"

# Variáveis obrigatórias no PowerShell
$env:PYTHONUTF8 = "1"
$env:GDAL_DATA  = "C:\miniconda3\envs\geo\Library\share\gdal"
$env:PROJ_LIB   = "C:\miniconda3\envs\geo\Library\share\proj"
```

> O arquivo `environment.yml` define o ambiente `desmatamento` usado pelo CI/Docker.  
> Para desenvolvimento local, use o ambiente `geo` conforme acima.

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...   # Jamais usar no frontend ou commitar
SUPABASE_ANON_KEY=sb_publishable_...
VITE_SUPABASE_URL=https://[ref].supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

> O `.env` está no `.gitignore`. A `SUPABASE_SERVICE_KEY` é exclusiva do pipeline — nunca deve aparecer no frontend.

---

## Executar o Pipeline

```powershell
# Opcao 1 — duplo clique (recomendado)
rodar_pipeline.ps1

# Opcao 2 — linha de comando
conda activate geo
$env:PYTHONUTF8 = "1"
python -m pipeline
```

O pipeline executa 11 etapas e valida com 9 testes automáticos (T1–T9). Todos devem passar antes do uso institucional dos dados.

### Docker (execução isolada)

```bash
cp .env.example .env   # preencher credenciais
docker compose --profile pipeline up      # só pipeline
docker compose --profile full up          # pipeline + upload Supabase
```

---

## Estrutura do Repositório

```
├── pipeline/                   # Módulo Python principal
│   ├── __main__.py             # Orquestrador — 11 etapas
│   ├── readers.py              # Leitura dos GeoJSONs brutos
│   ├── parsers.py              # Parse de campos (datas, status, flags)
│   ├── classify.py             # Nucleo metodologico — fragmentacao em 4 classes
│   ├── spatial.py              # Operacoes espaciais (reprojecao, intersecao)
│   ├── aggregate.py            # Agregado por municipio x ano
│   ├── indicators.py           # Reincidencia, defasagem, MATOPIBA
│   ├── quality.py              # Testes T1–T9
│   ├── validation.py           # Validacao cruzada PRODES
│   ├── constants.py            # Constantes metodologicas (fonte unica)
│   ├── constants.json          # Export JSON para CI e frontend
│   └── _upload_supabase.py     # Upload Supabase via psycopg2
│
├── frontend/                   # Dashboard React 18 + TypeScript
│   ├── src/pages/              # 6 abas do dashboard
│   ├── src/lib/                # supabase.ts · queries.ts · hooks.ts · constants.ts
│   ├── src/components/         # MapView · FilterPanel · ErrorBoundary
│   └── public/data/            # Fallback estatico (JSON gerado pelo pipeline)
│
├── infra/
│   ├── supabase/migrations/    # 4 migrations SQL (001–004)
│   └── prefect/                # pipeline_flow.py + prefect.yaml
│
├── tests/                      # pytest — testes unitarios Python
├── base de dados/              # Dados brutos (GeoJSONs — nao versionados)
├── Resultado/                  # Outputs do pipeline (logs, JSONs, GeoJSONs)
│
├── _baixar_prodes.py           # Download PRODES via WFS TerraBrasilis
├── _gerar_documentacao.py      # Gera documentacao tecnica (.docx)
├── _gerar_nota_tecnica.py      # Gera NT-GCGEO-001/2026 (.docx)
├── rodar_pipeline.ps1          # Execucao com um clique (Windows)
├── rodar_download_prodes.ps1   # Download PRODES com um clique
├── Dockerfile                  # Container para execucao isolada
├── docker-compose.yml          # Servicos: pipeline / upload / full
└── environment.yml             # Dependencias conda (ambiente CI/Docker)
```

---

## Frontend — Desenvolvimento Local

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # build de producao
```

Variáveis para o frontend (`frontend/.env`):

```
VITE_SUPABASE_URL=https://[ref].supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

O dashboard possui **fallback em 3 níveis**: Supabase live → JSON estático em `public/data/` → constantes hardcoded. Funciona mesmo sem conexão ao Supabase.

---

## CI/CD — GitHub Actions

| Workflow | Trigger | Acao |
|----------|---------|------|
| `ci.yml` | Push/PR → main | TypeScript build · ruff lint · pytest · SQL check · constants sync |
| `deploy-frontend.yml` | Push → main (`frontend/`) | Build Vite + Deploy Vercel automatico |
| `update-alertas.yml` | Mensal — dia 5, 03h UTC | Autentica MapBiomas → download → pipeline → Supabase |
| `update-asvs.yml` | Semanal — segunda, 03h UTC | Download ASVs SINAFLOR+ → pipeline → Supabase |
| `update-prodes.yml` | Anual — 1 out, 03h UTC | Download PRODES WFS TerraBrasilis → pipeline → Supabase |

**Secrets necessarios** (GitHub → Settings → Secrets → Actions):

| Secret | Uso |
|--------|-----|
| `SUPABASE_URL` | Pipeline workflows |
| `SUPABASE_SERVICE_KEY` | Pipeline — acesso admin ao banco |
| `SUPABASE_ANON_KEY` | Pipeline workflows |
| `VITE_SUPABASE_URL` | Build do frontend (valor publico) |
| `VITE_SUPABASE_ANON_KEY` | Build do frontend (chave publica) |
| `MAPBIOMAS_EMAIL` | Autenticacao dinamica MapBiomas (JWT) |
| `MAPBIOMAS_PASSWORD` | Autenticacao dinamica MapBiomas (JWT) |
| `VERCEL_TOKEN` | Deploy automatico Vercel |
| `VERCEL_ORG_ID` | Identificacao do time Vercel |
| `VERCEL_PROJECT_ID` | Identificacao do projeto Vercel |

---

## Dados Brutos

Os GeoJSONs de entrada **nao sao versionados** (excede limite do GitHub). Devem estar em `base de dados/`:

```
Alertas de Desmatamento(MAPBIOMAS).geojson    # MapBiomas Alerta API
ASVs Emitidas-PI(SINAFLOR+).geojson          # SINAFLOR/IBAMA WFS
DERADSAs Emitidas[SEMARH-2024].geojson       # GCGEO/SEMARH-PI
DERADSAs Emitidas[SEMARH-2025].geojson       # GCGEO/SEMARH-PI
PRODES_Cerrado_PI.geojson                    # TerraBrasilis WFS (opcional)
```

Download automatico do PRODES:

```powershell
rodar_download_prodes.ps1
```

---

## Banco de Dados (Supabase)

Migrations aplicadas (ordem obrigatoria via SQL Editor):

| Migration | Conteudo |
|-----------|----------|
| `001_schema_inicial.sql` | Tabelas principais, indices, RPCs base |
| `002_matopiba_view.sql` | Materialized view MATOPIBA, RPCs municipais |
| `003_deradsa_management.sql` | Gestao de DERADSAs via frontend |
| `004_prodes_rpc_fix.sql` | Correcao `get_resumo_prodes` — n_total exclui SEM_PRODES |

---

## Responsabilidade Metodologica

- O pipeline valida **seu proprio processamento** (T1–T9) — nao a qualidade dos dados de entrada
- Incerteza posicional MapBiomas (~±15 m) e limitacao da fonte, nao da metodologia
- DERADSAs disponiveis como dado geoespacial apenas para 2024–2025 (limitacao de dado)
- Caatinga sem validacao PRODES equivalente (PRODES-Cerrado cobre apenas o bioma Cerrado)
- **"Estimativa exploratoria" != "dado para autuacao"** — separacao institucional obrigatoria

---

*GCGEO / SEMARH-PI — Pipeline v2 — 2026*
