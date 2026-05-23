# CLAUDE.md — Memória do Projeto
## Monitoramento de Alertas de Desmatamento — Piauí 2022–2025
### GCGEO / SEMARH-PI | Pipeline v2

> Este arquivo sintetiza **todas as decisões técnicas acordadas** no projeto.
> Leia antes de qualquer intervenção no código ou na metodologia.

---

## 1. IDENTIDADE DO PROJETO

| Campo | Valor |
|-------|-------|
| Nome | Dashboard de Monitoramento de Alertas de Desmatamento PI |
| Órgão | GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI |
| Período | 2022–2025 |
| Versão pipeline | v2 |
| Público alvo | Geotecnólogos, gestores ambientais e pesquisadores — NÃO desenvolvedores |

---

## 2. AMBIENTE DE EXECUÇÃO

### Ambiente Python (Miniconda — OBRIGATÓRIO)

```
Gerenciador  : Miniconda (C:\miniconda3)
Ambiente     : geo          ← nome correto do ambiente ativo
Python       : 3.12.7
```

| Pacote | Versão | Função |
|--------|--------|--------|
| geopandas | 1.1.1 | Operações espaciais |
| shapely | 2.0.7 | Geometrias vetoriais |
| fiona | 1.10.1 | Leitura/escrita GeoJSON |
| pandas | 2.3.3 | Atributos tabulares |
| numpy | 2.3.4 | Operações numéricas |
| requests | 2.32.5 | Download IBGE API |
| supabase | 2.30.0 | Upload Supabase (instalado via pip) |
| python-dotenv | ok | Leitura do .env |

### Variáveis de ambiente obrigatórias no PowerShell
```powershell
$env:PYTHONUTF8 = "1"   # OBRIGATÓRIO — evita UnicodeEncodeError no console Windows
$env:GDAL_DATA  = "C:\miniconda3\envs\geo\Library\share\gdal"
$env:PROJ_LIB   = "C:\miniconda3\envs\geo\Library\share\proj"
```

### Execução do pipeline
```powershell
# Opção 1 (recomendada): duplo clique
rodar_pipeline.ps1

# Opção 2 (linha de comando):
conda activate geo
python -m pipeline
```

**Regra de instalação de pacotes:**
- Pacotes geoespaciais → `conda install -n geo -c conda-forge <pacote>`
- supabase-py → `pip install "supabase>=2.9.0" "websockets>=11,<16"` (não disponível no conda-forge com versão compatível)

---

## 3. ESTRUTURA DE ARQUIVOS

```
3. Monitoramento de Alerta de Desmatamento/
│
├── pipeline/                                ← módulo Python (python -m pipeline)
│   ├── __main__.py, readers.py, parsers.py
│   ├── classify.py, spatial.py, aggregate.py
│   ├── indicators.py, quality.py, validation.py
│   ├── constants.py + constants.json
│   └── _upload_supabase.py
│
├── frontend/                                ← React 18 + TypeScript (Vite)
│   ├── src/{pages,components,lib,store}
│   └── public/data/                         ← fallback estático
│
├── infra/
│   ├── supabase/migrations/                 ← 001–004 SQL migrations
│   └── prefect/                             ← pipeline_flow.py + prefect.yaml
│
├── tests/                                   ← pytest unitários
│
├── base de dados/                           ← dados brutos — NÃO modificar
│   ├── Alertas de Desmatamento(MAPBIOMAS).geojson  ← não versionado
│   ├── ASVs Emitidas-PI(SINAFLOR+).geojson         ← não versionado
│   ├── DERADSAs Emitidas[SEMARH-2024].geojson      ← não versionado
│   └── DERADSAs Emitidas[SEMARH-2025].geojson      ← não versionado
│
├── Resultado/                               ← gerado pelo pipeline
│   ├── alertas_classificados.geojson        ← saída principal (não versionado)
│   ├── agregado_municipios.json
│   ├── municipios_pi.geojson                ← não versionado
│   ├── monthly_alertas.json, resumo_estatico.json
│   └── pipeline.log                         ← auditoria
│
├── rodar_pipeline.ps1                       ← execução com um clique (Windows)
├── _baixar_prodes.py + rodar_download_prodes.ps1
├── _gerar_documentacao.py + _gerar_nota_tecnica.py
├── Dockerfile + docker-compose.yml + environment.yml
├── CLAUDE.md                                ← este arquivo
└── README.md                                ← documentação pública
```

---

## 4. METODOLOGIA — DECISÕES IRREVOGÁVEIS

### 4.1 Classificação em 4 classes (NÃO 3)

| Classe | Condição | Cor |
|--------|----------|-----|
| `AUTORIZADO` | Cobertura ASV ≥ 99% da área do alerta | `#10B981` Verde |
| `AUTORIZADO_PARCIALMENTE` | Cobertura ASV entre 0% e 99% | Derivado verde com opacidade |
| `REGULARIZADO` | Área residual coberta por DERADSA (apenas 2024–2025) | `#F97316` Laranja |
| `IRREGULAR` | Área sem nenhum instrumento válido | `#EF4444` Vermelho |

**Limiar**: `THRESHOLD_AUTORIZADO = 0.99` (99%)
- ≥ 99% → alerta inteiro = AUTORIZADO (geometria original)
- < 99% → fragmento ASV = AUTORIZADO_PARCIALMENTE + residual continua no fluxo

### 4.2 Validação temporal por alerta (CRÍTICO)

A ASV é válida para um alerta **somente se**:
```
dt_valid_i  ≤  DATADETEC_alerta  ≤  dt_valid_f
```
- Implementado por data de detecção única (otimização de performance)
- NÃO usar DTIMGDEP (superestimaria a janela)
- Alertas sem DATADETEC → classificados diretamente como IRREGULAR

### 4.3 Precedência instrumental (ASV > DERADSA)

```
Passo 1: Interseção alerta × ASVs válidas → AUTORIZADO ou AUTORIZADO_PARCIALMENTE
Passo 2: DERADSA aplicada SOMENTE no residual pós-ASV → REGULARIZADO
Passo 3: Residual restante → IRREGULAR
```

**NUNCA** misturar dissolve de ASV e DERADSA. **NUNCA** aplicar DERADSA antes da ASV.

### 4.4 DERADSA — série B e limitações conhecidas

- DERADSAs disponíveis como dado geoespacial **apenas para 2024 e 2025**
- Ausência em 2022–2023 é limitação dos dados, não da metodologia
- DERADSAs não têm janela de validade temporal: aplicadas a todo o ano de emissão
- Campo `serie_b = True` em registros de 2024–2025 no agregado
- **Importância**: registrar quando começou a ser contabilizado o dado geoespacial DERADSA

### 4.5 Área mínima de fragmento

```python
MIN_AREA_M2 = 1.0  # fragmentos < 1 m² descartados como artefato geométrico
```

### 4.6 MATOPIBA — recorte jurídico especial

- **Base legal**: Decreto Federal nº 8.447/2015
- **26 municípios piauienses** (lista completa em `preprocess.py` linha 67–74)
- Campo `matopiba = True/False` em todos os fragmentos
- Monitorado separadamente no dashboard — **não é filtro opcional, é camada de análise**

### 4.7 Sistemas de Referência de Coordenadas

| Etapa | CRS | EPSG | Razão |
|-------|-----|------|-------|
| Cálculo de área e interseção | SIRGAS 2000 / Brasil Policônico | **5880** | Projeção equivalente para o território brasileiro inteiro |
| Exportação e visualização web | WGS 84 geográfico | **4326** | Padrão GeoJSON / Leaflet |

---

## 5. SCHEMA DE SAÍDA — CAMPOS OBRIGATÓRIOS

### 5.1 alertas_classificados.geojson

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id_fragmento` | str | `{CODEALERTA}_{CLASSE}_{counter:06d}` — único global |
| `codealerta` | str | Código original MapBiomas |
| `classificacao` | str | IRREGULAR \| AUTORIZADO \| AUTORIZADO_PARCIALMENTE \| REGULARIZADO |
| `pct_cobertura` | float | % da área do alerta coberta pelo instrumento (0–100) |
| `fonte_classificacao` | str | ASV \| DERADSA \| SEM_INSTRUMENTO |
| `instrumento_ref` | str | Número(s) do instrumento |
| `data_validade_instrumento` | str | Data fim validade ASV (quando disponível) |
| `ano` | int | 2022–2025 |
| `bioma` | str | Cerrado \| Caatinga |
| `municipio` | str | Nome do município |
| `area_ha` | float | Área calculada em EPSG:5880 ÷ 10.000 |
| `area_original_ha` | float | AREAHA original MapBiomas |
| `vpressao` | str | Vetor pressão (inglês, original) |
| `vpressao_ptbr` | str | Vetor pressão (português) |
| `datadetec` | str | Data de detecção ISO |
| `dias_ate_publicacao` | int | DTPUBLI − DATADETEC (dias) |
| `matopiba` | bool | True se município no MATOPIBA-PI |
| `reincidente` | bool | True se município com IRREGULAR em ≥ 3 anos |

**Formato id_fragmento**:
- AUTORIZADO → `{CODEALERTA}_AUT_{n:06d}`
- AUTORIZADO_PARCIALMENTE → `{CODEALERTA}_AUTP_{n:06d}`
- REGULARIZADO → `{CODEALERTA}_REG_{n:06d}`
- IRREGULAR → `{CODEALERTA}_IRR_{n:06d}`

### 5.2 agregado_municipios.json

Campos adicionais obrigatórios:
```
ha_irregular, ha_autorizado, ha_autorizado_parcialmente,
ha_autorizado_total (= ha_aut + ha_autp),
ha_regularizado, ha_total,
pct_irregular, pct_autorizado, pct_autorizado_parcialmente,
pct_autorizado_total, pct_regularizado,
serie_b, matopiba, reincidente,
anos_com_alerta_irregular, defasagem_media_dias,
vpressao_dominante, vpressao_dominante_ptbr
```

---

## 6. PIPELINE — 11 ETAPAS

| Etapa | Nome | Ação |
|-------|------|------|
| 1 | Leitura | 4 GeoJSONs brutos |
| 2 | Filtro Temporal | Manter 2022–2025; log alertas 2026 descartados |
| 3 | Reprojeção | Todos → EPSG:5880 |
| 4 | Parse de Campos | Datas, status ASV, flag MATOPIBA, área original |
| 5 | Fragmentação | Núcleo metodológico (ver seção 4) |
| 6 | Consolidação | GeoDataFrame único + área em ha |
| 7 | Indicadores | Reincidência, defasagem, normalização de nomes |
| 8 | Testes Qualidade | 8 testes automáticos (todos devem passar) |
| 9 | Malha Municipal | Download ou reutilizar IBGE API |
| 10 | Agregado | JSON por município × ano |
| 11 | Exportação | EPSG:4326, simplificação, GeoJSON final |

---

## 7. TESTES AUTOMÁTICOS DE QUALIDADE (T1–T8)

Todos os 8 devem passar antes de uso institucional:

| Teste | O que verifica |
|-------|---------------|
| T1 | id_fragmento sem duplicatas |
| T2 | classificacao preenchida em todos os fragmentos |
| T3 | pct_cobertura em [0, 100] |
| T4 | AUTORIZADO_PARCIALMENTE com pct_cob ≤ 99% (tolerância float) |
| T5 | AUTORIZADO com pct_cob ≥ 99% |
| T6 | Todos os anos 2022–2025 presentes no output |
| T7 | Volume mínimo por ano (≥ 1 fragmento) |
| T8 | REGULARIZADO restrito a 2024–2025 |

**Última execução**: 8/8 testes ✓ (1.5 min de tempo total)

---

## 8. DADOS — CAMPOS DETECTADOS NOS ARQUIVOS BRUTOS

### Alertas MapBiomas
```
CODEALERTA, FONTE, BIOMA, MUNICIPIO, AREAHA, ANODETEC,
DATADETEC, DTPUBLI, VPRESSAO
```
- FONTE: formato `{FONTE1,FONTE2}` → parser remove `{}` e split por `,`
- Total bruto: ~19.674 alertas (2019–2026); filtrados: 13.299 (2022–2025)

### ASVs SINAFLOR+
```
nu_autoriz, dt_valid_i, dt_valid_f, status_aut, bioma_pamg
```
- Status válido detectado: `{'Autorização Emitida'}`
- Campo ID: `nu_autoriz` (primeiro candidato na detecção automática)

### DERADSAs SEMARH-PI
```
Id, Município, Área/ha, Ano
```
- Campo ID: `Id` (com I maiúsculo — corrigido)

---

## 9. RESULTADOS DO PIPELINE v2 (última execução confirmada)

### Por ano

| Ano | Alertas | Área Total (ha) | Irregular (ha) | Aut. Total (ha) | Regularizado (ha) | IPI (%) |
|-----|---------|-----------------|----------------|-----------------|-------------------|---------|
| 2022 | 3.062 | 150.350 | 123.394 | 26.956 | — | 82,1% |
| 2023 | 4.527 | 138.035 | 97.997 | 40.039 | — | 71,0% |
| 2024 | 3.034 | 145.146 | 75.228 | 69.669 | 250 | 51,8% |
| 2025 | 2.676 | 152.527 | 42.376 | 110.065 | 86 | 27,8% |

> IPI = Índice de Pressão Irregular = ha_irregular / ha_total × 100

### Municípios reincidentes (≥ 3 anos com IRREGULAR)
Uruçuí, Santa Filomena, Sebastião Leal, Baixa Grande do Ribeiro, Palmeira do Piauí, Canto do Buriti, Currais, Bom Jesus, Riacho Frio, Alvorada do Gurguéia, Parnaguá, Corrente, Cristino Castro, Ribeiro Gonçalves, Cristalândia do Piauí, Floriano, Gilbués, Guadalupe, Redenção do Gurguéia, Jerumenha

---

## 10. DASHBOARD — DECISÕES DE INTERFACE

### Tecnologias (React 18 + TypeScript)
- **Mapa**: MapLibre GL JS + react-map-gl
- **Gráficos**: Recharts
- **Estilo**: Tailwind CSS
- **Estado**: Zustand (filtros globais, aba ativa)
- **Dados**: TanStack Query → Supabase PostgREST

### Estrutura de navegação (6 abas)
1. Visão Executiva — `ExecutivaPage.tsx`
2. Panorama Municipal — `MunicipalPage.tsx`
3. Evolução Temporal — `TemporalPage.tsx`
4. Validação PRODES — `ProdesPage.tsx`
5. MATOPIBA — `MatopibaPage.tsx`
6. Gestão de Dados — `DadosPage.tsx`

### Estratégia de fallback (3 níveis)
```typescript
// 1. Supabase live (TanStack Query)
// 2. /public/data/resumo_estatico.json (fallback estático)
// 3. constants.ts — constantes hardcoded (última linha de defesa)
```

### Campo `ha_autorizado_total` no dashboard
```typescript
// calcAutTotal() em lib/constants.ts:
export function calcAutTotal(e: { autorizado: number; autorizado_p: number }): number {
  return e.autorizado + e.autorizado_p
}
// Usado em ExecutivaPage e TemporalPage para getAut() com 3-level fallback
```

### Sistema de cores
```css
--irr: #EF4444;   /* IRREGULAR — vermelho */
--aut: #10B981;   /* AUTORIZADO — verde */
--reg: #F97316;   /* REGULARIZADO — laranja */
--mat: #F59E0B;   /* MATOPIBA — âmbar */
```

---

## 11. ARQUITETURA DE PRODUÇÃO

| Camada | Tecnologia | Status |
|--------|------------|--------|
| Frontend | React 18 + TypeScript + MapLibre GL JS + Recharts + Tailwind CSS + Zustand | **PRODUÇÃO** (`frontend/`) |
| Backend / API | Supabase PostgREST (auto-gerado) | **PRODUÇÃO** |
| Banco de dados | Supabase PostgreSQL + PostGIS | **PRODUÇÃO** (`infra/supabase/`) |
| Upload pipeline | `pipeline/_upload_supabase.py` (psycopg2) | **PRODUÇÃO** |
| Orquestração | Prefect Cloud v3 — 3 deployments (mensal/anual/dry-run) | **CRIADO** (`infra/prefect/`) |
| CI/CD | GitHub Actions — 5 workflows (ci, deploy, alertas, asvs, prodes) | **CRIADO** (`.github/workflows/`) |
| Deploy Frontend | Vercel — auto-deploy em push + preview em PR | **CRIADO** (`deploy-frontend.yml` + `vercel.json`) |
| Versionamento de dados | DVC | PLANEJADO |
| Containerização | Docker + Docker Compose | **CRIADO** (`Dockerfile`, `docker-compose.yml`) |
| Ingestão DERADSA | Página Gestão de Dados no frontend (6ª aba) | **PRODUÇÃO** (`DadosPage.tsx`) |

### Fontes com atualização automática
| Fonte | Método | Frequência |
|-------|--------|-----------|
| MapBiomas Alerta | GraphQL API v2 (`plataforma.alerta.mapbiomas.org/api/v2/graphql`) | Mensal |
| ASVs SINAFLOR+ | WFS ArcGIS IBAMA + CKAN API | Semanal |
| PRODES-Cerrado | WFS TerraBrasilis (implementado) | Anual (outubro) |
| DERADSA | Ingestão manual GCGEO | Sob demanda |
| IBGE malha | API pública (implementado) | Sob demanda |

---

## 12. TAREFAS PENDENTES

| Prioridade | Tarefa | Status |
|------------|--------|--------|
| 1 | Obter arquivo PRODES-Cerrado-PI.geojson (INPE) e re-executar pipeline | **CONCLUÍDO** |
| 2 | T9 reconciliação de área adicionado ao pipeline (9/9 testes) | **CONCLUÍDO** |
| 3 | _gerar_documentacao.py — Escopo 3 PRODES adicionado ao .docx | **CONCLUÍDO** |
| 4 | Docker: Dockerfile + docker-compose.yml + environment.yml criados | **CONCLUÍDO** |
| 5 | Nota Técnica NT-GCGEO-001/2026 gerada (_gerar_nota_tecnica.py → .docx) | **CONCLUÍDO** |
| 6 | Supabase: schema SQL criado (`infra/supabase/migrations/001_schema_inicial.sql`) | **CONCLUÍDO** |
| 7 | Frontend React scaffold: Vite + TS + MapLibre + Recharts + Tailwind (build OK) | **CONCLUÍDO** |
| 8 | `pipeline/_upload_supabase.py` criado (psycopg2 + upsert) | **CONCLUÍDO** |
| 9 | Supabase: 3 migrations aplicadas (001+002+003) · 5 tabelas · 8 RPCs · dados corretos (13.638 alertas, 812 agregados) | **CONCLUÍDO** |
| 10 | Frontend React: 5 abas AO VIVO com Supabase · badge status · filtros · mapa MapLibre | **CONCLUÍDO** |
| 11 | `monthly_alertas.json` e `resumo_estatico.json` gerados em `frontend/public/data/` | **CONCLUÍDO** (2026-05-21) |
| 12 | Bug concordância PRODES: 63%→70,9% corrigido em `ProdesPage.tsx` (n_concordantes+n_discordantes) | **CONCLUÍDO** (2026-05-21) |
| 13 | Migration `004_prodes_rpc_fix.sql` criada — corrige n_total na RPC `get_resumo_prodes` | **PENDENTE aplicar no SQL Editor** |
| 14 | Dados brutos `base de dados/*.geojson` ausentes neste PC — estão no computador MARCO | **PENDENTE copiar** |
| 15 | Phase 5: TypeScript cleanup — v:any→v:unknown, calcAutTotal(), n_sem_prodes, hooks cast fix | **CONCLUÍDO** (2026-05-22) |
| 16 | Phase 4: Aba "Gestão de Dados" — status pipeline, DERADSAs, fontes, guia 8 passos | **CONCLUÍDO** (2026-05-22) |
| 17 | Git repo inicializado — commit inicial (106 arquivos) | **CONCLUÍDO** (2026-05-22) |
| 18 | CI/CD: 5 GitHub Actions (ci, deploy-frontend, alertas, asvs, prodes) + vercel.json | **CONCLUÍDO** (2026-05-22) |
| 19 | Prefect Cloud: pipeline_flow.py ampliado + prefect.yaml (3 deployments: mensal, PRODES anual, dry-run) | **CONCLUÍDO** (2026-05-22) |
| 20 | Varredura repositório: remover arquivos obsoletos + reescrever READMEs + atualizar CLAUDE.md | **CONCLUÍDO** (2026-05-22) |
| 21 | Git push para GitHub (`HerculesFer1/monitoramento-alertas-desmatamento-pi`) | **CONCLUÍDO** (2026-05-22) |
| 22 | CI/CD ativo: secrets VERCEL_TOKEN, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, MAPBIOMAS_EMAIL, MAPBIOMAS_PASSWORD, VERCEL_ORG_ID, VERCEL_PROJECT_ID configurados | **CONCLUÍDO** (2026-05-22) |
| 23 | Dockerfile + docker-compose.yml corrigidos: removida referência a `preprocess.py` (deletado), entrypoint → `python -m pipeline` | **CONCLUÍDO** (2026-05-22) |
| 24 | Limpeza repositório: removidos .qmd (4), `plano de fundo.png`, `configurar_supabase.ps1` | **CONCLUÍDO** (2026-05-22) |
| 25 | Aplicar Migration 004 no Supabase SQL Editor (`004_prodes_rpc_fix.sql`) | **CONCLUÍDO** (2026-05-22) |
| 26 | Adicionar secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` no GitHub (sem prefixo VITE_) — usados pelos workflows update-alertas, update-asvs, update-prodes | **PENDENTE** |
| 27 | Copiar dados brutos `base de dados/*.geojson` do computador MARCO | **PENDENTE** |
| 28 | DVC — versionamento de dados | PLANEJADO |
| 29 | Slide Biomas (Cerrado × Caatinga) — tab futura no frontend | PLANEJADO |
| 30 | Integração CAR / Unidades de Conservação / TIs como camadas | PLANEJADO |

---

## 13. REGRAS DE TRABALHO

### O que NUNCA fazer
- Alterar `THRESHOLD_AUTORIZADO` sem validação metodológica formal
- Misturar dissolve de ASV e DERADSA antes da fragmentação
- Aplicar DERADSA antes da ASV (quebra a precedência)
- Usar pip install isolado (quebra ambiente conda)
- Usar EPSG:3857 para cálculo de área (Web Mercator distorce)
- Remover AUTORIZADO_PARCIALMENTE — é uma classe metodológica real

### O que SEMPRE fazer
- Usar `PYTHONUTF8=1` ao executar qualquer script Python no Windows
- Confirmar que todos os 9 testes T1–T9 passam antes de qualquer uso institucional
- Registrar qualquer alteração metodológica no `pipeline.log`
- Manter `serie_b = True` apenas para 2024–2025 no agregado
- Tratar alertas sem DATADETEC como IRREGULAR diretamente

### Responsabilidade metodológica
- O pipeline valida **seu próprio processamento**
- Qualidade dos dados de entrada é responsabilidade das instituições produtoras
- Incerteza posicional MapBiomas (~±15 m) é limitação de fonte, não do pipeline
- "Estimativa exploratória" ≠ "dado para autuação" — separação institucional obrigatória

---

## 14. DOWNLOAD PRODES — INFRAESTRUTURA

### WFS TerraBrasilis (verificado ativo 2026-05-19)
| Endpoint | Status | Uso |
|----------|--------|-----|
| `https://terrabrasilis.dpi.inpe.br/geoserver/prodes-cerrado-nb/ows` | **200 OK** | WFS GetFeature com bbox + CQL_FILTER |
| `https://terrabrasilis.dpi.inpe.br/en/home-page/` | **200 OK** | Portal principal |
| `https://terrabrasilis.dpi.inpe.br/download/dataset/cerrado-prodes/` | **403 Forbidden** | Download direto bloqueado — usar WFS |

### Layer WFS disponível
- **Nome**: `prodes-cerrado-nb:yearly_deforestation`
- **CRS nativo**: EPSG:4674 (SIRGAS 2000 geográfico ≈ EPSG:4326)
- **Campo de ano**: `year` (inteiro)
- **9 layers disponíveis**: `yearly_deforestation`, `accumulated_deforestation_2000`, `residual`, `biome_border`, `states_cerrado_biome`, `municipalities_cerrado_biome`, `conservation_units_cerrado_biome`, `indigenous_area_cerrado_biome`, `hydrography`

### Estratégia adotada: WFS com bbox Piauí (nunca baixa o GPKG de 1 GB)
```
WFS GetFeature + bbox PI + CQL_FILTER year IN (2022,2023,2024,2025)
→ tráfego ~5–30 MB → clip estadual → PRODES_Cerrado_PI.geojson (~10–40 MB)
```

### Arquivos de download
- `_baixar_prodes.py` — script Python com lógica WFS + clip PI
- `rodar_download_prodes.ps1` — execução com duplo clique (Windows)

### Bbox do Piauí (EPSG:4326)
```python
BBOX_PI = (-45.98, -11.80, -40.37, -2.75)  # lon_min, lat_min, lon_max, lat_max
```

---

## 15. VALIDAÇÃO CRUZADA PRODES-CERRADO — DECISÕES TÉCNICAS

### Etapa 4-B no pipeline (condicional)
- Implementada em `preprocess.py` entre Etapas 4 e 5
- Ativada automaticamente quando `base de dados/PRODES_Cerrado_PI.geojson` existe
- Se arquivo ausente: alertas Cerrado marcados como `flag_validacao_externa='DADOS_PENDENTES'`; Caatinga como `'NAO_DISPONIVEL_CAATINGA'`

### Regra de ciclo PRODES
```python
def ano_prodes_ciclo(dt):
    # Ciclo: agosto/Y → julho/Y+1
    return ts.year + 1 if ts.month >= 8 else ts.year
```
- Usa `DATADETEC` do alerta (nunca `DTIMGDEP` ou `DTPUBLI`)
- Alertas sem `DATADETEC` não participam da validação PRODES

### Campos adicionados ao schema de saída
| Campo | Tipo | Conteúdo |
|-------|------|----------|
| `ano_prodes_ref` | int/None | Ano do ciclo PRODES do alerta |
| `concordancia_prodes_pct` | float/None | % da área do alerta coberta por PRODES do mesmo ciclo |
| `flag_validacao_externa` | str | `CONCORDANTE` \| `DISCORDANTE` \| `SEM_PRODES_NO_CICLO` \| `DADOS_PENDENTES` \| `NAO_DISPONIVEL_CAATINGA` |

### Cobertura biômica
- **Cerrado**: validação completa por interseção espacial real com PRODES-Cerrado INPE
- **Caatinga**: sem PRODES equivalente — declarado formalmente como limitação de dado, não de metodologia
- DETER **não** é usado como referência (sujeito a suspensões; não é produto consolidado)

### Resultados confirmados (execução 2026-05-19)

| Ciclo PRODES | Alertas Cerrado | Concordantes | Discordantes | % Concordância |
|--------------|----------------|--------------|--------------|----------------|
| 2022 (ago/21–jul/22) | 619 | 376 | 243 | 60,7% |
| 2023 (ago/22–jul/23) | 2.874 | 1.996 | 878 | 69,5% |
| 2024 (ago/23–jul/24) | 1.421 | 1.061 | 360 | 74,7% |
| 2025 (ago/24–jul/25) | 1.004 | 765 | 239 | 76,2% |
| 2026 (ago/25–dez/25) | 747 | — | — | SEM_PRODES |
| **Total validados** | **5.918** | **4.198** | **1.720** | **70,9%** |

- Tendência positiva: concordância cresce de 60,7% → 76,2% (ciclo 2022→2025)
- Ciclo 2026: alertas detectados ago-dez/2025 sem PRODES disponível → `SEM_PRODES_NO_CICLO`
- Caatinga: 6.634 alertas → `NAO_DISPONIVEL_CAATINGA` (sem produto PRODES equivalente)

### Implementação técnica da interseção
- Método: `gpd.overlay(how='intersection', make_valid=True)` com STRtree spatial indexing
- **NÃO usar** `prodes_union = prodes_cycle.geometry.unary_union` — unary_union de ~8000 polígonos PRODES causa TopologyException e leva 15-30 min por ciclo
- `gpd.overlay()` usa índice espacial e `make_valid=True` internamente — todos os 5 ciclos em < 1 min

### Slide 4 no dashboard — "Validação PRODES" (atualizado 2026-05-19)

**6 KPI cards ativos:**
- Concordância Geral: 70,9% | Alertas Validados: 5.918
- **Irr. confirmado PRODES: 219.294 ha** (64,7% do irregular Cerrado com dado disponível)
- Tendência: +15,5 pp (60,7% → 76,2%) | Ciclos: 4 | Caatinga: 6.634 alertas sem cobertura

**5 análises cruzadas (variável `prodesExtra` em `index.html`):**

| Gráfico | Análise | Insight chave |
|---------|---------|--------------|
| CP1 (barra+linha) | Tendência de concordância por ciclo + cobertura média dos concordantes | Crescimento consistente: 60,7%→76,2% (alertas) e 66,6%→70,5% (cobertura média) |
| CP2 (barras empilhadas) | Concordantes × Discordantes por ciclo | Redução absoluta de discordantes mesmo com volumes variados |
| CP3 (barras empilhadas por ano) | Área irregular Cerrado confirmada por PRODES | 91.588 ha confirmados em 2022 → 17.357 ha em 2025 (reflexo do IPI decrescente) |
| CP4 (barras horizontais) | Distribuição de cobertura PRODES por faixa (0%/1-24%/…/90-100%) | Padrão bimodal: 28% com 0% e 18,8% com 90-100% — separação metodológica clara |
| CP5 (barras horizontais, semafórico) | Concordância por vetor de pressão | Abertura de Estradas = 35,9% (vermelho) vs Agricultura = 71,3% (verde) — MapBiomas detecta infraestrutura viária antes do PRODES |

**Tabela Top 10 municípios** com maior área irregular PRODES-confirmada (Cerrado, acumulado):
- Uruçuí: 34.560 ha (92%) | Sebastião Leal: 17.375 ha (97%) | Baixa Grande do Ribeiro: 14.766 ha (91%)

**Dados analíticos:** variável `prodesExtra` em `Resultado/index.html` (linhas ~938–975) contém:
`irrAnual`, `distCob`, `porVetor`, `mediaCob`, `topMun`, `haIrrConfirmado`, `pctIrrConfirmado`

**Nota institucional obrigatória:** separação entre estimativa exploratória e dado para autuação.

---

## 16. DOCUMENTAÇÃO GERADA

| Arquivo | Conteúdo | Localização |
|---------|----------|-------------|
| `Documentacao_Tecnica_Desmatamento_PI.docx` | Documentação técnica completa (Escopos 1 e 2) | `Resultado/` |
| `pipeline.log` | Log de auditoria de cada execução | `Resultado/` |
| `PROJETO_DASHBOARD_DESMATAMENTO_PI.md` | Especificação técnica detalhada do projeto | Raiz |
| `README.md` | Documentação pública do repositório | Raiz |
| `CLAUDE.md` | Memória de sessão (este arquivo) | Raiz |

---

## 17. ESTADO DO AMBIENTE (2026-05-21)

### `base de dados/` — dados brutos
Os GeoJSONs originais estão no **computador MARCO** (não neste PC). Quando disponíveis, copiar para:
```
base de dados/
  Alertas de Desmatamento(MAPBIOMAS).geojson   ← MapBiomas API
  ASVs Emitidas-PI(SINAFLOR+).geojson          ← SINAFLOR/IBAMA
  DERADSAs Emitidas[SEMARH-2024].geojson       ← GCGEO/SEMARH-PI
  DERADSAs Emitidas[SEMARH-2025].geojson       ← GCGEO/SEMARH-PI
  PRODES_Cerrado_PI.geojson                    ← TerraBrasilis WFS (opcional)
```
Sem esses arquivos o pipeline não pode ser re-executado. Os **outputs em `Resultado/`** estão corretos da última execução.

### Frontend — arquivos estáticos gerados
```
frontend/public/data/
  monthly_alertas.json     ← agregado mensal por ano (Evolução Temporal)
  resumo_estatico.json     ← KPIs + PRODES summary + prodesExtra
```
Gerados de `Resultado/alertas_classificados.geojson` em 2026-05-21. Regenerar via pipeline quando os dados brutos estiverem disponíveis.

### Supabase (projeto ubcejvbnpuyouwpphryc)
- 13.638 fragmentos em `alertas_classificados` ✓
- 812 registros em `agregado_municipios` ✓
- RPC `get_resumo_prodes` corrigida via Migration 004 ✓ — 5.918 validados | 4.198 concordantes | 70,9%

---

*Última atualização: 2026-05-22 | Pipeline v2 | 9/9 testes OK | 6 abas AO VIVO | PRODES 70,9% ✓ | Migration 004 aplicada | CI/CD 5 workflows OK | Prefect 3 deployments | repo GitHub publicado | dados brutos em MARCO*
