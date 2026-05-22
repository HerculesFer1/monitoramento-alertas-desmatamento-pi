# PROJETO: Dashboard de Desmatamento do Piauí (2022–2025)
**Elaboração:** Gerência do Centro de Geotecnologia Fundiária e Ambiental — GCGEO  
**Versão da documentação:** 2.0  
**Data:** Maio de 2025

---

## SUMÁRIO

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Fontes de Dados e Atributos](#2-fontes-de-dados-e-atributos)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Dependências e Tecnologias](#4-dependências-e-tecnologias)
5. [Pipeline de Dados — Etapa 1: Pré-processamento Python](#5-pipeline-de-dados--etapa-1-pré-processamento-python)
6. [Metodologia de Classificação Espacial](#6-metodologia-de-classificação-espacial)
7. [Regras de Negócio e Casos Especiais](#7-regras-de-negócio-e-casos-especiais)
8. [Estrutura do Output do Script Python](#8-estrutura-do-output-do-script-python)
9. [Arquitetura do Dashboard — Etapa 2: Front-end](#9-arquitetura-do-dashboard--etapa-2-front-end)
10. [Estrutura de Slides e Storytelling](#10-estrutura-de-slides-e-storytelling)
11. [KPIs e Indicadores](#11-kpis-e-indicadores)
12. [Filtros e Controles Interativos](#12-filtros-e-controles-interativos)
13. [Especificações de Design UI/UX](#13-especificações-de-design-uiux)
14. [Municípios MATOPIBA no Piauí](#14-municípios-matopiba-no-piauí)
15. [Notas Metodológicas para o Dashboard](#15-notas-metodológicas-para-o-dashboard)
16. [Checklist de Implementação](#16-checklist-de-implementação)
17. [Extensões Futuras — Fase 2](#17-extensões-futuras--fase-2)

---

## 1. VISÃO GERAL DO PROJETO

### Objetivo
Desenvolver um **Dashboard HTML interativo (Single-Page Application)** focado na quantificação e qualificação do desmatamento no Estado do Piauí entre os anos de **2022 e 2025**, cruzando dados de alertas de desmatamento com instrumentos de autorização e regularização ambiental vigentes.

### Produto Final
Uma aplicação web autossuficiente em **HTML/CSS/JS estático único**, sem dependência de servidor, que consuma um arquivo GeoJSON pré-processado para renderizar mapas interativos, KPIs dinâmicos e gráficos analíticos organizados em 3 slides temáticos com navegação por tabs.

### Contexto Institucional
Desenvolvido pela **GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental**, para suporte à fiscalização ambiental, elaboração de relatórios técnicos e subsídio à tomada de decisão sobre pressão territorial no Piauí, com ênfase na fronteira agrícola do MATOPIBA.

---

## 2. FONTES DE DADOS E ATRIBUTOS

### 2.1 Alertas de Desmatamento — MapBiomas Alerta
**Arquivo:** `Alertas_de_Desmatamento_MAPBIOMAS_.geojson`  
**Fonte:** https://plataforma.alerta.mapbiomas.org/downloads → "Shapefile dos Alertas", recorte Piauí  
**Total de features no arquivo:** 19.674 alertas (2019–2026)  
**Cobertura usada:** somente `ANODETEC` 2022–2025 — filtro obrigatório no script  
**Tipo de geometria:** MultiPolygon  

| Campo | Tipo | Descrição | Uso no Pipeline |
|---|---|---|---|
| `CODEALERTA` | Integer | ID único do alerta | Chave primária |
| `FONTE` | String | Sistemas de detecção — multi-valor, ex: `{DETER-CERRADO,GLAD}` | Parse individual |
| `BIOMA` | String | `Caatinga` ou `Cerrado` | Filtro; cruzamento com bioma da ASV |
| `ESTADO` | String | `PIAUÍ` | Confirmação do recorte |
| `MUNICIPIO` | String | Nome do município | Filtro; agregação |
| `AREAHA` | Float | Área em hectares (original MapBiomas) | Referência; comparação |
| `ANODETEC` | Float | Ano de detecção | **Filtro temporal principal** |
| `DATADETEC` | String ISO date | Data exata da detecção | **Cruzamento com validade de ASVs** |
| `DTIMGANT` | String ISO date | Data da imagem anterior (13 nulos) | Contexto temporal |
| `DTIMGDEP` | String ISO date | Data da imagem posterior (13 nulos) | Contexto temporal |
| `DTPUBLI` | String ISO date | Data de publicação do alerta | Cálculo de defasagem |
| `VPRESSAO` | String | Vetor de pressão | Filtro e KPI |

**Vetores de pressão — tradução PT-BR:**

| Valor original | Contagem | Rótulo PT-BR |
|---|---|---|
| `agriculture` | 18.079 | Agricultura |
| `others` | 1.259 | Outros |
| `urban_expansion` | 240 | Expansão Urbana |
| `roads` | 44 | Abertura de Estradas |
| `renewable_energy_project` | 31 | Projeto de Energia Renovável |
| `mining` | 10 | Mineração |
| `natural_cause` | 6 | Causa Natural |
| `ilegal_mining` | 3 | Mineração Ilegal |
| `aquaculture` | 2 | Aquicultura |

> ⚠️ `FONTE` armazena múltiplos valores no formato `{FONTE1,FONTE2}` — parse obrigatório no script.  
> ⚠️ 6 alertas com `ANODETEC = 2026.0` devem ser descartados na primeira etapa com registro em log.

---

### 2.2 Autorizações de Supressão Vegetal — SINAFLOR+
**Arquivo:** `ASVs_Emitidas-PI_SINAFLOR__.geojson`  
**Fonte:** SINAFLOR/IBAMA

| Campo | Tipo | Descrição | Uso |
|---|---|---|---|
| `municipio` | String | Nome do município | Agregação |
| `dt_valid_i` | String date | Início da validade da ASV | Validação temporal |
| `dt_valid_f` | String date | Fim da validade da ASV | Validação temporal |
| `status_aut` | String | Status da autorização | **Filtro obrigatório** |
| `area_pamgi` | Float | Área autorizada (ha) | Referência |
| `bioma_pamg` | String | Bioma da autorização | Cruzamento com bioma do alerta |

---

### 2.3 Declarações de Regularidade — DERADSAs SEMARH-PI
**Arquivos:** `DERADSAs_Emitidas_SEMARH-2024_.geojson` e `DERADSAs_Emitidas_SEMARH-2025_.geojson`

> ⚠️ **AUSÊNCIA 2022–2023:** Não existem DERADSAs para 2022 e 2023. O script trata essa ausência com conjunto vazio — nenhum alerta desses anos será classificado como "Regularizado". O dashboard exibirá coluna Regularizado zerada com badge de indisponibilidade.

| Campo | Tipo | Descrição |
|---|---|---|
| `Município` | String | Nome do município |
| `Área/ha` | Float | Área declarada (ha) |
| `Ano` | Integer | Ano da emissão |

---

### 2.4 Municípios do Piauí — IBGE
**URL:** `https://servicodados.ibge.gov.br/api/v3/malhas/estados/22?formato=application/vnd.geo+json&resolucao=5`  
**Uso:** Camada base para o choropleth municipal (Slide 2) e recorte MATOPIBA  
**O script baixa automaticamente e salva como `municipios_pi.geojson`**

---

## 3. ESTRUTURA DE PASTAS

```
dashboard-desmatamento-pi/
│
├── data/
│   ├── raw/                               # Dados brutos — não modificar
│   │   ├── Alertas_de_Desmatamento_MAPBIOMAS_.geojson
│   │   ├── ASVs_Emitidas-PI_SINAFLOR__.geojson
│   │   ├── DERADSAs_Emitidas_SEMARH-2024_.geojson
│   │   └── DERADSAs_Emitidas_SEMARH-2025_.geojson
│   │
│   └── processed/                         # Gerado pelo script Python
│       ├── alertas_classificados.geojson  # Output principal — leve e simplificado
│       ├── municipios_pi.geojson          # Download automático via API IBGE
│       ├── agregado_municipios.json       # Tabular por município/ano — sem geometria
│       └── pipeline.log                  # Log de execução e qualidade
│
├── scripts/
│   └── preprocess.py                      # Script de pré-processamento
│
└── dashboard/
    └── index.html                         # Dashboard completo — arquivo único autocontido
```

> O dashboard é **um único arquivo HTML** autocontido com CSS e JS embutidos, seguindo o padrão do arquivo de referência `Dashboard_de_Análise_de_Desempenho_CAR.html`.

---

## 4. DEPENDÊNCIAS E TECNOLOGIAS

### 4.1 Script Python — Ambiente Conda (OBRIGATÓRIO)

O pipeline utiliza o ambiente conda `desmatamento` gerenciado pelo **Miniconda** (não pip isolado).

```bash
# Criação do ambiente (primeira vez)
conda create -n desmatamento python=3.11
conda activate desmatamento
conda install -c conda-forge geopandas=1.1.3 shapely=2.1.2 fiona=1.10.1 pandas numpy requests
pip install python-docx   # apenas para geração de documentação
```

| Pacote | Versão | Função |
|--------|--------|--------|
| Python | 3.11 | Linguagem principal |
| geopandas | 1.1.3 | Operações espaciais |
| shapely | 2.1.2 | Geometrias vetoriais |
| fiona | 1.10.1 | I/O GeoJSON |
| pandas | 3.0.3 | Atributos tabulares |
| numpy | 2.4.5 | Operações numéricas |
| requests | 2.34.2 | Download IBGE API |

**Execução:** duplo clique em `rodar_pipeline.ps1` (configura PYTHONUTF8=1 e GDAL_DATA automaticamente).

**NUNCA usar `pip install` isolado para geopandas/shapely/fiona** — instalar via conda-forge garante compatibilidade das DLLs GDAL/GEOS no Windows.

### 4.2 Dashboard HTML — via CDN

| Biblioteca | Versão | Finalidade |
|---|---|---|
| Leaflet.js | 1.9.x | Mapas interativos |
| Chart.js | 4.4.1 | Gráficos (igual ao arquivo de referência) |
| Plus Jakarta Sans | — | Tipografia principal (igual ao arquivo de referência) |
| Inter | — | Tipografia numérica |
| Lucide Icons | latest | Iconografia (igual ao arquivo de referência) |

---

## 5. PIPELINE DE DADOS — ETAPA 1: PRÉ-PROCESSAMENTO PYTHON

### 5.1 Fluxo Geral

```
[1]  LEITURA DOS ARQUIVOS BRUTOS
          ↓
[2]  FILTRO TEMPORAL: manter ANODETEC 2022–2025; descartar 2026 com log
          ↓
[3]  REPROJEÇÃO → EPSG:5880 (SIRGAS 2000 / Policônica) — todos os arquivos
          ↓
[4]  PARSE DO CAMPO FONTE: remover {} e separar por vírgula
          ↓
[5]  VALIDAÇÃO DE ASVs — função validar_asv() com 3 condições obrigatórias
          ↓
[6]  LÓGICA DE DERADSAs POR ANO
          2022 e 2023 → conjunto vazio + log de aviso
          2024        → DERADSAs_Emitidas_SEMARH-2024_.geojson
          2025        → DERADSAs_Emitidas_SEMARH-2025_.geojson
          ↓
[7]  CRUZAMENTO ESPACIAL — FRAGMENTAÇÃO REAL DE POLÍGONOS
          fragmento_autorizado   = A ∩ ASV_válidas_ano_Y
          fragmento_regularizado = A ∩ DERADSA_ano_Y
          fragmento_irregular    = A − (ASV_válidas_ano_Y ∪ DERADSA_ano_Y)
          ↓
[8]  CÁLCULO DE ÁREAS em ha (EPSG:5880 ÷ 10.000)
          Comparação area_calculada vs AREAHA: log se divergência > 10%
          ↓
[9]  INDICADORES DERIVADOS
          dias_ate_publicacao  = DTPUBLI − DATADETEC (dias)
          tendencia_yoy_pct    = variação % ha irregular 2022→2025
          matopiba             = True/False por município
          reincidente          = municípios com alertas irregulares em ≥ 3 anos
          vpressao_ptbr        = tradução do vetor de pressão
          ↓
[10] DOWNLOAD municipios_pi.geojson via API IBGE
          ↓
[11] REPROJEÇÃO OUTPUT → EPSG:4326 (WGS 84)
          ↓
[12] SIMPLIFICAÇÃO GEOMÉTRICA: tolerance=0.0001, preserve_topology=True
          ↓
[13] EXPORTAÇÃO
          alertas_classificados.geojson
          agregado_municipios.json
          pipeline.log
```

### 5.2 Sistemas de Referência de Coordenadas

| Etapa | CRS | EPSG | Justificativa |
|---|---|---|---|
| Cálculo de área e cruzamentos | SIRGAS 2000 / Policônica | **5880** | Projeção equivalente de área oficial do Brasil — o Piauí abrange zonas UTM 23S e 24S, inviabilizando qualquer sistema UTM único |
| Exportação / visualização web | WGS 84 geográfico | **4326** | Padrão nativo do Leaflet, GeoJSON e navegadores |

---

## 6. METODOLOGIA DE CLASSIFICAÇÃO ESPACIAL

### 6.1 Princípio Fundamental

Todo fragmento geométrico de alerta MapBiomas que **não tenha intersecção** com ASV válida nem com DERADSA disponível é classificado como **"Irregular / Não Autorizado"**. A classificação opera sobre geometrias reais fragmentadas — não por critério de maioria de área.

### 6.2 Operações Espaciais por Alerta — Cascata com Precedência ASV > DERADSA

```
Para cada alerta A do ano Y:

  Passo 1 — Interseção com ASVs temporalmente válidas:
    cobertura_asv = A ∩ ASV_válidas (dt_valid_i ≤ DATADETEC ≤ dt_valid_f)
    Se cobertura ≥ 99% → fragmento_autorizado = A (geometria completa)
    Se 0% < cobertura < 99% → fragmento_autorizado_parcialmente = cobertura_asv
                               residual = A − cobertura_asv

  Passo 2 — DERADSA aplicada SOMENTE no residual (precedência ASV > DERADSA):
    fragmento_regularizado = residual ∩ DERADSA_disponíveis_no_ano_Y
    residual = residual − fragmento_regularizado

  Passo 3 — Área restante:
    fragmento_irregular = residual (área sem cobertura de nenhum instrumento)
```

Cada alerta gera até 4 fragmentos. Limiar de cobertura: `THRESHOLD_AUTORIZADO = 0.99`.
Fragmentos menores que 1 m² são descartados como artefatos geométricos (`MIN_AREA_M2 = 1.0`).

**CRÍTICO — Validação temporal das ASVs:**
```
A ASV é válida para o alerta SOMENTE se:
  dt_valid_i  ≤  DATADETEC_alerta  ≤  dt_valid_f
```
NÃO usar DTIMGDEP (superestimaria a janela temporal).
Alertas sem DATADETEC → classificados diretamente como IRREGULAR.

### 6.3 Precedência Instrumental — ASV > DERADSA

A ASV tem precedência absoluta sobre a DERADSA. A DERADSA é aplicada **somente** na área residual do alerta que não foi coberta pela ASV. Esta hierarquia reflete a estrutura jurídica dos instrumentos:

| Instrumento | Órgão | Natureza | Precedência |
|---|---|---|---|
| ASV (Autorização de Supressão Vegetal) | IBAMA / SINAFLOR+ | Autorização prévia federal | 1ª — mais alta |
| DERADSA | SEMARH-PI | Regularização estadual posterior | 2ª — aplicada no residual |

**Nunca** misturar dissolve de ASV e DERADSA antes da fragmentação. **Nunca** aplicar DERADSA antes da ASV.

### 6.4 Nomenclatura e Cores das Classificações (4 classes)

| Código | Rótulo no dashboard | Cor | Condição |
|---|---|---|---|
| `AUTORIZADO` | Supressão Autorizada (ASV) | `#10B981` — Verde | Cobertura ASV ≥ 99% |
| `AUTORIZADO_PARCIALMENTE` | Autorizado Parcialmente (ASV) | Verde com opacidade | 0% < cobertura ASV < 99% |
| `REGULARIZADO` | Supressão Regularizada (DERADSA) | `#F97316` — Laranja | Residual coberto por DERADSA |
| `IRREGULAR` | Irregular / Não Autorizado | `#EF4444` — Vermelho | Sem cobertura por nenhum instrumento |

> DERADSAs disponíveis apenas para 2024–2025. A ausência em 2022–2023 é limitação dos dados, não da metodologia. O campo `serie_b = True` sinaliza registros com dado DERADSA disponível.

---

## 7. REGRAS DE NEGÓCIO E CASOS ESPECIAIS

### 7.1 Função de Validação de ASVs

```python
def validar_asv(asv_row, data_deteccao_alerta, bioma_alerta):
    """
    Valida se uma ASV pode ser usada no cruzamento com um alerta.
    Retorna True somente se TODAS as 3 condições forem satisfeitas.

    CONDIÇÃO 1 — Status ativo:
        status_aut IN STATUS_VALIDOS
        Excluir: 'Cancelada', 'Suspensa', 'Indeferida', 'Expirada' e equivalentes.
        ⚠️ Inspecionar gdf_asv['status_aut'].unique() antes de definir STATUS_VALIDOS.

    CONDIÇÃO 2 — Validade temporal:
        dt_valid_i <= DATADETEC <= dt_valid_f
        Usar DATADETEC (zero nulos; campo mais robusto do MapBiomas Alerta).
        NÃO usar DTIMGDEP — superestimaria a janela temporal.

    CONDIÇÃO 3 — Coerência de bioma:
        bioma_pamg.lower() == BIOMA.lower()
        Impede que ASV de Cerrado autorize supressão classificada em Caatinga.
    """
    STATUS_VALIDOS = ['Autorizada', 'Ativa', 'Vigente']  # ajustar conforme dados reais
    c1 = asv_row['status_aut'] in STATUS_VALIDOS
    c2 = asv_row['dt_valid_i'] <= data_deteccao_alerta <= asv_row['dt_valid_f']
    c3 = asv_row['bioma_pamg'].lower() == bioma_alerta.lower()
    return c1 and c2 and c3
```

### 7.2 Parse do Campo FONTE

```python
import re

def parse_fonte(fonte_str):
    """Extrai lista de fontes individuais do campo FONTE do MapBiomas."""
    if not fonte_str:
        return []
    return [f.strip() for f in re.sub(r'[{}]', '', str(fonte_str)).split(',') if f.strip()]

# parse_fonte("{DETER-CERRADO,GLAD}") → ["DETER-CERRADO", "GLAD"]
```

### 7.3 Normalização de Nomes de Municípios

```python
import unicodedata

def normalizar_municipio(nome):
    """Remove acentos e converte para lowercase para comparação segura."""
    nfkd = unicodedata.normalize('NFKD', str(nome))
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
```

### 7.4 Lógica de DERADSAs por Ano

```python
def get_deradsa_layer(ano, gdf_2024, gdf_2025):
    if ano in [2022, 2023]:
        log.warning(f"DERADSAs indisponíveis para {ano}. Fragmento 'Regularizado' = vazio.")
        return GeoDataFrame()
    elif ano == 2024:
        return gdf_2024
    elif ano == 2025:
        return gdf_2025
    else:
        raise ValueError(f"Ano {ano} fora do escopo.")
```

### 7.5 Validação de Qualidade de Área

```python
divergencia = abs(area_calculada_ha - areaha_original) / areaha_original
if divergencia > 0.10:
    log.warning(f"CODEALERTA {codealerta}: divergência {divergencia:.1%} "
                f"(calculada={area_calculada_ha:.2f} | original={areaha_original:.2f})")
```

---

## 8. ESTRUTURA DO OUTPUT DO SCRIPT PYTHON

### 8.1 `alertas_classificados.geojson`

Schema v2 — campos obrigatórios:

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "MultiPolygon", "coordinates": ["..."] },
    "properties": {
      "id_fragmento": "4093_IRR_000001",
      "codealerta": "4093",
      "classificacao": "IRREGULAR",
      "pct_cobertura": 100.0,
      "fonte_classificacao": "SEM_INSTRUMENTO",
      "instrumento_ref": null,
      "data_validade_instrumento": null,
      "ano": 2022,
      "bioma": "Caatinga",
      "municipio": "Parnaguá",
      "area_ha": 89.32,
      "area_original_ha": 121.51,
      "vpressao": "agriculture",
      "vpressao_ptbr": "Agricultura",
      "fonte_list": "[\"DETER-CERRADO\"]",
      "datadetec": "2022-06-08",
      "dias_ate_publicacao": 45,
      "matopiba": false,
      "reincidente": true
    }
  }]
}
```

Formato de `id_fragmento`:
- AUTORIZADO → `{CODEALERTA}_AUT_{n:06d}`
- AUTORIZADO_PARCIALMENTE → `{CODEALERTA}_AUTP_{n:06d}`
- REGULARIZADO → `{CODEALERTA}_REG_{n:06d}`
- IRREGULAR → `{CODEALERTA}_IRR_{n:06d}`

### 8.2 `agregado_municipios.json`

Schema v2 com campos adicionais (AUTORIZADO_PARCIALMENTE e serie_b):

```json
[{
  "municipio": "Parnaguá",
  "ano": 2022,
  "bioma_predominante": "Caatinga",
  "matopiba": false,
  "serie_b": false,
  "ha_irregular": 1205.4,
  "ha_autorizado": 220.1,
  "ha_autorizado_parcialmente": 120.1,
  "ha_autorizado_total": 340.2,
  "ha_regularizado": 0.0,
  "ha_total": 1545.6,
  "pct_irregular": 78.0,
  "pct_autorizado": 14.2,
  "pct_autorizado_parcialmente": 7.8,
  "pct_autorizado_total": 22.0,
  "pct_regularizado": 0.0,
  "num_alertas": 12,
  "vpressao_dominante": "agriculture",
  "vpressao_dominante_ptbr": "Agricultura",
  "reincidente": true,
  "anos_com_alerta_irregular": [2022, 2023, 2024, 2025],
  "defasagem_media_dias": 38.0
}]
```

> `serie_b = true` indica que DERADSAs estão disponíveis para aquele ano (2024–2025).
> `ha_autorizado_total` = `ha_autorizado` + `ha_autorizado_parcialmente` — usar este campo para comparação histórica.

### 8.3 `pipeline.log` — Registros Obrigatórios

```
[INFO]  Alertas lidos por ano (bruto): {2019:589, 2020:3109, ..., 2026:6}
[INFO]  Alertas descartados (fora escopo 2022-2025): 7375
[INFO]  Alertas de 2026 descartados: 6
[INFO]  Alertas processados: {2022:3062, 2023:4527, 2024:3034, 2025:2676}
[INFO]  Valores únicos de status_aut no SINAFLOR: [lista]
[WARN]  ASVs descartadas por status inativo: N
[WARN]  ASVs descartadas por validade temporal: N
[WARN]  ASVs descartadas por bioma divergente: N
[WARN]  DERADSAs indisponíveis para 2022 — Regularizado = 0
[WARN]  DERADSAs indisponíveis para 2023 — Regularizado = 0
[WARN]  Inconsistências bioma×fonte (Caatinga/DETER-CERRADO): N alertas
[WARN]  Alertas com divergência de área > 10%: N registros
[INFO]  Municípios reincidentes (≥ 3 anos com alerta irregular): [lista]
[INFO]  Defasagem média publicação (dias): {2022:X, 2023:X, 2024:X, 2025:X}
[INFO]  alertas_classificados.geojson: N features, X.X MB
[INFO]  agregado_municipios.json: N registros
```

---

## 9. ARQUITETURA DO DASHBOARD — ETAPA 2: FRONT-END

### 9.1 Layout Mestre — Todas as Telas

```
┌────────────────────────────────────────────────────────────────────────┐
│  TOPBAR (fixo): Logo GCGEO | Título | Tabs de navegação | Dark/Light   │
├──────────────────────────────────────────────┬─────────────────────────┤
│                                              │                         │
│         ZONA ESQUERDA (70%)                  │   ZONA DIREITA (30%)    │
│                                              │                         │
│  [Barra de filtros globais]                  │   MAPA (modo retrato)   │
│  [KPI Cards — linha de 4 cards]              │   altura: ~80% da tela  │
│  [Cards Métricas por Ano — linha de 4]       │   Leaflet.js            │
│  [Gráficos — grid bento responsivo]          │                         │
│                                              │                         │
├──────────────────────────────────────────────┴─────────────────────────┤
│  RODAPÉ: Fontes | Logo GCGEO | Nota DERADSAs 2022-2023                 │
└────────────────────────────────────────────────────────────────────────┘
```

**Nota de proporção:** mapa ocupa 30% da largura horizontal — reduzido de 40% conforme decisão do projeto.

### 9.2 Padrão de Design — Sistema Visual (Arquivo de Referência)

O dashboard segue **exatamente** o design system do arquivo `Dashboard_de_Análise_de_Desempenho_CAR.html`:

```css
/* Fontes — igual ao arquivo de referência */
--sf: 'Plus Jakarta Sans', sans-serif;   /* textos e labels */
--font-num: 'Inter', sans-serif;          /* valores numéricos dos KPIs */

/* Cores semânticas do sistema */
--apple-red:    #EF4444;   /* Irregular / Não Autorizado */
--apple-green:  #10B981;   /* Supressão Autorizada (ASV) */
--apple-orange: #F59E0B;   /* Destaques, MATOPIBA border */
--deradsa-color: #FFA500;  /* Supressão Regularizada (DERADSA) — laranja */

/* Dark Mode — tons de cinza escuro neutro (NÃO azul-slate) */
--bg-primary-dark:   #0A0A0A;
--bg-secondary-dark: rgba(24, 24, 24, 0.65);
--bg-tertiary-dark:  #222222;
--separator-dark:    #333333;
--label-primary-dark:   #F5F5F5;
--label-secondary-dark: #A3A3A3;

/* Light Mode */
--bg-primary:    #F8FAFC;
--bg-secondary:  rgba(255, 255, 255, 0.65);
--bg-tertiary:   #F1F5F9;
--separator:     #E2E8F0;
--label-primary: #0F172A;
--label-secondary: #64748B;

/* Cards — glassmorphism */
--card-shadow: 0 4px 20px rgba(15, 23, 42, 0.03), 0 1px 3px rgba(15, 23, 42, 0.02);
backdrop-filter: blur(12px);
border-radius: 16px;
border: 1px solid rgba(255, 255, 255, 0.15);
```

### 9.3 Topbar (Fixo, altura 60px)

Idêntico ao arquivo de referência:
- Logo GCGEO (44px de altura)
- Título: "Desmatamento **Piauí**" (bold highlight em amarelo)
- Subtítulo: "GCGEO — 2022 a 2025"
- Separador
- Data de referência
- Pill "Ativo" (verde animado)
- Botão toggle Dark/Light (ícone Lucide `sun`/`moon`)
- Botão modo apresentação (ícone Lucide `maximize`)

### 9.4 Navegação — Tabs (dentro do topbar ou logo abaixo)

```html
<button class="tab-btn active" onclick="showTab('visao', this)">
  <i data-lucide="layout-dashboard"></i> Visão Geral
</button>
<button class="tab-btn" onclick="showTab('municipal', this)">
  <i data-lucide="map-pin"></i> Panorama Municipal
</button>
<button class="tab-btn" onclick="showTab('temporal', this)">
  <i data-lucide="line-chart"></i> Evolução Temporal
</button>
```

### 9.5 Mapa Principal — Slides 1 e 3

- **Biblioteca:** Leaflet.js 1.9.x
- **Posição:** zona direita, 30% da largura, ~80% da altura da tela
- **Camada base toggleável:** Esri World Imagery (satélite) | OpenStreetMap (padrão)
- **Camadas de dados toggleáveis:**
  - Irregular/Não Autorizado → `#EF4444` opacidade 0.7
  - Supressão Autorizada (ASV) → `#10B981` opacidade 0.6
  - Supressão Regularizada (DERADSA) → `#FFA500` opacidade 0.6
- **Popup rico ao clicar:** CODEALERTA · Município · Área calculada (ha) · Bioma · Data de Detecção · Vetor de Pressão (PT-BR) · Classificação · Instrumento vinculado · Dias até publicação
- **Efeito MATOPIBA ativo:** overlay `rgba(100,100,100,0.4)` nos municípios fora do MATOPIBA
- **Zoom inicial:** fitBounds automático no Piauí
- **Controles:** zoom, escala gráfica, legenda flutuante

### 9.6 Mapa Coroplético — Slide 2 (Panorama Municipal)

- Choropleth de `municipios_pi.geojson` colorido por `ha_irregular`
- Gradiente: `#FEF3C7` → `#F97316` → `#991B1B`
- Hover tooltip: município · ha irregular · ranking · bioma · reincidência
- Borda `#F59E0B` nos municípios MATOPIBA quando toggle ativo

---

## 10. ESTRUTURA DE SLIDES E STORYTELLING

### SLIDE 1 — "Visão Geral"
**Ícone tab:** `layout-dashboard`  
**Pergunta respondida:** Qual é a dimensão total do desmatamento e como ele se distribui?

**Zona Esquerda (70%):**

**Linha 1 — Filtros:**
- Ano (botões multi-seleção: 2022 / 2023 / 2024 / 2025)
- Bioma (dropdown: Cerrado / Caatinga)
- Município (dropdown com busca)
- Vetor de Pressão (dropdown multi-select — labels PT-BR)
- Toggle MATOPIBA (switch destacado)
- Botão "Limpar Filtros"

**Linha 2 — KPI Cards principais (4 cards):**

| Card | Título | Valor | Detalhe |
|---|---|---|---|
| 1 | Área Total Desmatada | `SUM(area_ha)` | "hectares no período" + tooltip equivalência Teresina |
| 2 | Autorizado (SINAFLOR+) | `SUM(ha_autorizado)` | badge % verde no canto superior |
| 3 | Regularizado (DERADSA) | `SUM(ha_regularizado)` | badge % laranja + ícone ⓘ metodologia |
| 4 | Indício de Ilegalidade | `SUM(ha_irregular)` | badge % vermelho + indicador tendência ↑↓ |

**Linha 3 — Cards Métricas por Ano (4 cards lado a lado):**

Cards 2022 / 2023 / 2024 / 2025, cada um com:
- Ano em destaque (título)
- Autorizado: valor em ha + %
- Regularizado: valor em ha + %
- Ilegal: valor em ha + %
- Área Total no rodapé do card
- Badge de aviso "⚠️ DERADSA indisponível" nos cards 2022 e 2023

**Linha 4 — Gráficos (grid bento):**
- **Gráfico 1 (largura 2/3):** Barras empilhadas — Área (ha) por Ano, segmentada por classificação (Irregular/Autorizado/Regularizado). Cores: #EF4444, #10B981, #FFA500
- **Gráfico 2 (largura 1/3):** Pizza/Donut — Proporção por Classificação (% total do período)

**Linha 5 — Gráficos secundários:**
- **Gráfico 3 (largura 1/2):** Combo barras + linha — "Alertas Mensais 2022–2025 (ha)": barras vermelhas = Alertas MapBiomas total; barras azuis = Alertas Autorizados; linha com marcadores = Alertas Ilegais. Eixo X: meses. Todos os anos sobrepostos ou selecionável por ano.
- **Gráfico 4 (largura 1/4):** Pizza/Donut — Distribuição por Bioma (Cerrado × Caatinga)
- **Gráfico 5 (largura 1/4):** Pizza/Donut — Distribuição por Vetor de Pressão (top 5 + Outros)

**Zona Direita (30%):** Mapa Principal de Classificação

---

### SLIDE 2 — "Panorama Municipal"
**Ícone tab:** `map-pin`  
**Pergunta respondida:** Onde o desmatamento é mais grave e como se distribui municipalmente?

**Zona Esquerda (70%):**

**Linha 1 — Filtros** (mesmos filtros globais sincronizados)

**Linha 2 — KPI Cards municipais (4 cards):**

| Card | Título | Valor |
|---|---|---|
| 1 | Municípios Afetados | Contagem de municípios com alertas |
| 2 | Município Crítico | Nome + ha irregular |
| 3 | Municípios Reincidentes | Contagem com alertas em ≥ 3 anos |
| 4 | Concentração Top 10 | % do total irregular nos 10 piores municípios |

**Linha 3 — Tabela Ranking Top 10 Municípios:**
- Colunas: Ranking · Município · Bioma · ha Irregular · % do Total · Tendência · Reincidente
- Barra visual inline na coluna ha Irregular
- Ícone ⚠️ vermelho para municípios reincidentes
- Borda dourada nos municípios MATOPIBA

**Linha 4 — Gráficos:**
- **Gráfico 6 (largura 1/2):** Barras horizontais — Top 10 Municípios por ha Irregular (cor por bioma: verde Cerrado, laranja Caatinga)
- **Gráfico 7 (largura 1/2):** Barras agrupadas — ha por Classificação nos Top 5 Municípios

**Zona Direita (30%):** Mapa Coroplético Municipal

---

### SLIDE 3 — "Evolução Temporal"
**Ícone tab:** `line-chart`  
**Pergunta respondida:** Como as variáveis evoluíram ao longo do tempo? Há tendência de crescimento ou redução?

**Zona Esquerda (70%):**

**Linha 1 — Filtros** (mesmos filtros globais + toggle MATOPIBA)

**Linha 2 — KPI Cards temporais (4 cards):**

| Card | Título | Valor |
|---|---|---|
| 1 | Tendência 2022→2025 | ↑/↓ X% ha irregular total |
| 2 | Ano de Pico | Ano com maior ha irregular |
| 3 | Defasagem Média | X dias para publicação dos alertas |
| 4 | MATOPIBA vs. Piauí | % do ha irregular que é MATOPIBA |

**Linha 3 — Gráficos de série temporal:**
- **Gráfico 8 (largura total):** Linha + área — Área Alertada por Ano e Bioma (2022–2025). Duas séries: Cerrado e Caatinga. Eixo secundário com ha irregular.
- **Gráfico 9 (largura 1/2):** Barras empilhadas — Área por Ano e Vetor de Pressão (top 4 vetores + Outros)
- **Gráfico 10 (largura 1/2):** Comparativo MATOPIBA vs. Resto do Piauí — barras lado a lado por ano

**Linha 4 — Gráfico de sazonalidade:**
- **Gráfico 11 (largura total):** Mapa de calor (heatmap) — Mês × Ano, intensidade = ha alertado. Revela padrão sazonal do desmatamento.

**Zona Direita (30%):** Mapa Principal com toggle MATOPIBA ativo por padrão neste slide (spotlight na fronteira agrícola)

---

## 11. KPIs E INDICADORES

### 11.1 KPI Cards Principais — Slide 1

Todos respondem reativamente aos filtros globais ativos.

**Card 1 — Área Total Desmatada:**
```
valor = SUM(area_ha) de todos os fragmentos filtrados
subtítulo = "hectares no período"
tooltip = "equivale a {round(valor/139200, 1)}× o município de Teresina"
tooltip2 = "Tempo médio de publicação: {defasagem_media} dias"
AREA_TERESINA_HA = 139200
```

**Card 2 — Autorizado (SINAFLOR+):**
```
valor = SUM(ha_autorizado)
badge = round(valor / ha_total * 100, 1)
cor_badge = #10B981 (verde)
```

**Card 3 — Regularizado (DERADSA):**
```
valor = SUM(ha_regularizado)
badge = round(valor / ha_total * 100, 1)
cor_badge = #FFA500 (laranja)
ícone = ⓘ → abre modal de nota metodológica
```

**Card 4 — Indício de Ilegalidade:**
```
valor = SUM(ha_irregular)
badge = round(valor / ha_total * 100, 1)
cor_badge = #EF4444 (vermelho)
tendencia = (ha_irregular_2025 - ha_irregular_2022) / ha_irregular_2022 × 100
  → positivo: seta ↑ vermelha + "↑ X% desde 2022"
  → negativo: seta ↓ verde  + "↓ X% desde 2022"
  → ocultar quando filtro não inclui 2022 e 2025 simultaneamente
```

### 11.2 Cards Métricas por Ano — Slide 1

4 cards lado a lado (2022 / 2023 / 2024 / 2025):

```
Cada card exibe:
  - Ano (título grande)
  - Autorizado:    valor ha  |  %  (cor verde)
  - Regularizado:  valor ha  |  %  (cor laranja)
  - Ilegal:        valor ha  |  %  (cor vermelha)
  - Área Total: valor ha (rodapé)
  - Badge "⚠️ DERADSA indisponível" apenas em 2022 e 2023
```

---

## 12. FILTROS E CONTROLES INTERATIVOS

### Filtros Globais (todos os slides respondem)

| Filtro | Tipo | Valores | Padrão |
|---|---|---|---|
| Ano | Botões multi-seleção | 2022, 2023, 2024, 2025 | Todos |
| Bioma | Dropdown multi-select | Cerrado, Caatinga | Todos |
| Município | Dropdown com busca typeahead | 224 municípios | Todos |
| Vetor de Pressão | Dropdown multi-select | 9 valores PT-BR | Todos |
| Toggle MATOPIBA | Switch on/off | — | Off |
| Limpar Filtros | Botão | — | — |

### Toggle MATOPIBA

**Off (padrão):** dados do Piauí inteiro; KPIs gerais.  
**On:** filtra para os 26 municípios MATOPIBA; efeito spotlight no mapa; borda dourada no choropleth; KPIs recalculados; badge "MATOPIBA" exibido na barra de filtros.

### Controles Internos do Mapa

- Toggle individual por camada de classificação (painel flutuante)
- Toggle camada base: Satélite | OpenStreetMap
- Botão reset zoom ao Piauí

---

## 13. ESPECIFICAÇÕES DE DESIGN UI/UX

### Sistema de Cores Completo

```css
:root {
  /* Fontes */
  --sf: 'Plus Jakarta Sans', sans-serif;
  --font-num: 'Inter', sans-serif;

  /* Cores semânticas do projeto */
  --color-irregular:   #EF4444;   /* apple-red — Irregular */
  --color-autorizado:  #10B981;   /* apple-green — Autorizado (ASV) */
  --color-regularizado:#FFA500;   /* Laranja — Regularizado (DERADSA) */
  --color-matopiba:    #F59E0B;   /* Âmbar — borda MATOPIBA */

  /* Paleta de interface — Light Mode */
  --bg-primary:        #F8FAFC;
  --bg-secondary:      rgba(255, 255, 255, 0.65);
  --bg-tertiary:       #F1F5F9;
  --label-primary:     #0F172A;
  --label-secondary:   #64748B;
  --label-tertiary:    #94A3B8;
  --separator:         #E2E8F0;
  --card-shadow: 0 4px 20px rgba(15,23,42,0.03), 0 1px 3px rgba(15,23,42,0.02);

  /* Cards — glassmorphism */
  --vibrancy:          rgba(255,255,255,0.40);
  --vibrancy-border:   rgba(255,255,255,0.5);
}

[data-theme="dark"] {
  /* Dark Mode — cinza escuro neutro */
  --bg-primary:        #0A0A0A;
  --bg-secondary:      rgba(24, 24, 24, 0.65);
  --bg-tertiary:       #222222;
  --label-primary:     #F5F5F5;
  --label-secondary:   #A3A3A3;
  --label-tertiary:    #737373;
  --separator:         #333333;
  --card-shadow: 0 4px 20px rgba(0,0,0,0.5);
  --vibrancy:          rgba(10,10,10,0.40);
  --vibrancy-border:   rgba(255,255,255,0.05);
}
```

### Componentes de Card — Padrão Bento Grid

```css
.card {
  background: var(--bg-secondary);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: var(--card-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--card-shadow-hover);
}

/* Layouts bento */
.bento { display: grid; gap: 16px; padding: 16px 24px; }
.bento-4col { grid-template-columns: repeat(4, 1fr); }
.bento-2col { grid-template-columns: 1fr 1fr; }
.bento-3col { grid-template-columns: repeat(3, 1fr); }
.bento-hero { grid-template-columns: 2fr 1fr 1fr; }
```

### Topbar

```css
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
  height: 60px;
  background: var(--vibrancy);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--separator);
  display: flex; align-items: center;
  padding: 0 24px; gap: 16px;
}
```

### Tab Buttons

```css
.tab-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px;
  font-family: var(--sf); font-size: 13px; font-weight: 600;
  color: var(--label-secondary);
  background: transparent; border: 1px solid transparent;
  cursor: pointer; transition: all 0.2s ease;
}
.tab-btn.active {
  background: var(--bg-tertiary);
  color: var(--label-primary);
  border-color: var(--separator);
}
```

### KPI Pills

```css
.kpi-pill {
  flex: 1; min-width: 150px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--separator);
  padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.kpi-label {
  font-size: 11px; color: var(--label-tertiary);
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
}
.kpi-value {
  font-family: var(--font-num);
  font-size: 2.2rem; font-weight: 700;
  color: var(--label-primary);
}
.kpi-badge {
  font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 999px;
}
```

### Rodapé

```
[ Logo GCGEO ] Gerência do Centro de Geotecnologia Fundiária e Ambiental — GCGEO
Fontes: MapBiomas Alerta (plataforma.alerta.mapbiomas.org) | SINAFLOR+/IBAMA | SEMARH-PI | IBGE/Malha Municipal
[ ⚠️ ] Dados de DERADSAs indisponíveis para 2022 e 2023. Coluna "Regularizado" zerada nesses anos.
```

---

## 14. MUNICÍPIOS MATOPIBA NO PIAUÍ

Lista dos **26 municípios piauienses** — Decreto Federal nº 8.447/2015 e Resolução CONDEL/SUDENE nº 115/2017:

```python
MUNICIPIOS_MATOPIBA_PI = [
    "Alvorada do Gurguéia", "Avelino Lopes", "Baixa Grande do Ribeiro",
    "Bom Jesus", "Caracol", "Colônia do Gurguéia", "Corrente",
    "Cristino Castro", "Curimatá", "Currais", "Eliseu Martins",
    "Gilbués", "Guadalupe", "Jurema", "Landri Sales",
    "Manoel Emídio", "Monteiro do Piauí", "Monte Alegre do Piauí",
    "Palmeira do Piauí", "Parnaguá", "Redenção do Gurguéia",
    "Santa Filomena", "Santa Luz", "São Gonçalo do Gurguéia",
    "Sebastião Barros", "Uruçuí",
]
```

> ⚠️ Aplicar `normalizar_municipio()` em ambos os lados da comparação antes do match.

---

## 15. NOTAS METODOLÓGICAS PARA O DASHBOARD

### 15.1 Modal "Sobre a Classificação" — ícone ⓘ no Card DERADSA

> **Como os dados são classificados?**
>
> **Supressão Autorizada (ASV):** área de alerta sobreposta a uma Autorização de Supressão de Vegetação emitida pelo SINAFLOR+/IBAMA, com status ativo e válida na data de detecção do alerta, no mesmo bioma.
>
> **Supressão Regularizada (DERADSA):** área de alerta sobreposta a uma Declaração de Regularidade Ambiental de Supressão de Vegetação emitida pela SEMARH-PI.
>
> **Irregular / Não Autorizado:** fragmento de alerta sem cobertura por ASV ou DERADSA válidas. A operação é de diferença geométrica real — não por critério de maioria de área.
>
> **Nota importante:** "Regularizado" indica que a supressão recebeu uma DERADSA, mas não necessariamente que estava previamente autorizada. A DERADSA é um instrumento de regularização posterior ao fato da supressão.

### 15.2 Badge de Dados Indisponíveis — 2022 e 2023

Exibir nos Cards de Métricas por Ano e nos gráficos quando 2022 ou 2023 estiverem no filtro. A coluna "Regularizado" aparece com opacidade 0.3 e hachurada.

### 15.3 Tooltip — Energia Renovável no MATOPIBA

Ao destacar `renewable_energy_project`:
> *"Projetos de energia renovável (solar e eólica) figuram entre os vetores de pressão registrados no MATOPIBA piauiense. A expansão dessa matriz energética, embora estratégica para o estado, tem gerado registros de supressão de vegetação nativa no sistema de alertas do MapBiomas."*

---

## 16. CHECKLIST DE IMPLEMENTAÇÃO

### Script Python — `preprocess.py` v2 (CONCLUÍDO ✓)

- [x] Leitura dos 4 arquivos GeoJSON brutos (ETAPA 1)
- [x] `gdf_asv['status_aut'].unique()` → STATUS_VALIDOS detectado automaticamente
- [x] Filtro temporal: 2022–2025; descarta 2026 com log (ETAPA 2)
- [x] Reprojeção de todos os arquivos → EPSG:5880 (ETAPA 3)
- [x] `parse_fonte()` — remove `{}`, split por `,`
- [x] `norm_mun()` — normalização de nomes de municípios
- [x] `parse_date_col()` — datas ISO e Excel serial
- [x] `strip_tz()` — remove timezone das datas
- [x] Validação temporal ASV: `dt_valid_i ≤ DATADETEC ≤ dt_valid_f` por data única (otimização)
- [x] DERADSA: conjunto vazio para 2022–2023; arquivos reais para 2024–2025
- [x] PRECEDÊNCIA ASV > DERADSA (passo 1 ASV → passo 2 DERADSA no residual)
- [x] THRESHOLD_AUTORIZADO = 0.99 → AUTORIZADO (≥99%) ou AUTORIZADO_PARCIALMENTE (<99%)
- [x] MIN_AREA_M2 = 1.0 → descartar fragmentos menores que 1 m²
- [x] Campo `pct_cobertura` = frag.area / alert_area × 100 (capped at 100)
- [x] id_fragmento único: `{CODEALERTA}_CLASSE_{counter:06d}`
- [x] `area_ha` em hectares (EPSG:5880 ÷ 10.000) (ETAPA 6)
- [x] `dias_ate_publicacao` = DTPUBLI − DATADETEC
- [x] Campo `matopiba` True/False (26 municípios MATOPIBA-PI)
- [x] Campo `reincidente` — ≥ 3 anos com alerta IRREGULAR
- [x] Campo `vpressao_ptbr` com tradução PT-BR
- [x] `ha_autorizado_total` = ha_aut + ha_autp no agregado
- [x] Campo `serie_b` = True para anos 2024–2025
- [x] 8 testes automáticos de qualidade T1–T8 (ETAPA 8) — 8/8 OK
- [x] Download `municipios_pi.geojson` via API IBGE (ETAPA 9)
- [x] `agregado_municipios.json` com schema v2 (ETAPA 10)
- [x] Reprojeção output → EPSG:4326 (ETAPA 11)
- [x] Simplificação geométrica `(tolerance=0.0001, preserve_topology=True)`
- [x] Exportação `alertas_classificados.geojson`
- [x] Geração `pipeline.log`

### Dashboard HTML — `index.html`

**Estrutura geral:**
- [ ] HTML único autocontido com CSS e JS embutidos
- [ ] Topbar fixo com logo, título, tabs, dark/light toggle, botão maximizar
- [ ] Sistema de 3 slides com `showTab()` idêntico ao arquivo de referência
- [ ] Dark mode via `[data-theme="dark"]` no `<html>` + `localStorage`
- [ ] Grid bento responsivo para cards e gráficos
- [ ] Layout 70/30 (esquerda/mapa) com mapa em modo retrato

**Filtros:**
- [ ] Filtros globais reativos (Ano, Bioma, Município, VPRESSAO)
- [ ] Toggle MATOPIBA com efeito spotlight
- [ ] Botão "Limpar Filtros"

**Slide 1 — Visão Geral:**
- [ ] 4 KPI Cards principais com badges de percentual coloridos
- [ ] 4 Cards Métricas por Ano (2022–2024) com badge ⚠️ DERADSA
- [ ] Gráfico 1: barras empilhadas Área × Ano × Classificação
- [ ] Gráfico 2: pizza Proporção por Classificação
- [ ] Gráfico 3: combo barras+linha Alertas Mensais (MapBiomas/Autorizados/Ilegais)
- [ ] Gráfico 4: pizza Distribuição por Bioma
- [ ] Gráfico 5: pizza Vetores de Pressão (PT-BR)
- [ ] Mapa 1: Classificação de polígonos com camadas toggleáveis

**Slide 2 — Panorama Municipal:**
- [ ] 4 KPI Cards municipais
- [ ] Tabela Top 10 municípios com barra inline e ícone reincidência
- [ ] Gráfico 6: barras horizontais Top 10 por ha irregular
- [ ] Gráfico 7: barras agrupadas classificação por município
- [ ] Mapa 2: Choropleth municipal com gradiente ha irregular

**Slide 3 — Evolução Temporal:**
- [ ] 4 KPI Cards temporais
- [ ] Gráfico 8: linha + área Área por Ano e Bioma
- [ ] Gráfico 9: barras empilhadas Área por Ano e Vetor de Pressão
- [ ] Gráfico 10: comparativo MATOPIBA vs. Resto do Piauí por ano
- [ ] Gráfico 11: heatmap Mês × Ano de intensidade de alertas
- [ ] Mapa 3: Mapa Principal com spotlight MATOPIBA

**Componentes transversais:**
- [ ] Modal nota metodológica (ícone ⓘ no Card DERADSA)
- [ ] Badge ⚠️ + barras hachuradas para anos sem DERADSA
- [ ] Tooltip energia renovável MATOPIBA
- [ ] Popup rico nos polígonos do mapa
- [ ] Rodapé com fontes, logo GCGEO e nota de indisponibilidade
- [ ] Indicador de tendência YoY no Card Indício de Ilegalidade
- [ ] Tooltip de equivalência territorial no Card Área Total

---

## 17. ROADMAP — PRÓXIMAS ETAPAS

### Fase 2 — Produto e Infraestrutura

| Prioridade | Item | Status |
|---|---|---|
| 1 | Completar Slide 4 (Biomas — Cerrado × Caatinga) | Em andamento |
| 2 | Nota Técnica formal com registro institucional | Pendente |
| 3 | Validação cruzada com PRODES/DETER (INPE) — padrão internacional | Planejado |
| 4 | Frontend React + TypeScript + MapLibre GL JS + D3.js | Planejado |
| 5 | Backend FastAPI + PostgreSQL/PostGIS | Planejado |
| 6 | Docker + Docker Compose (containerização) | Planejado |
| 7 | Apache Airflow (orquestração e agendamento automático) | Planejado |
| 8 | DVC — versionamento de dados de entrada e saída | Planejado |
| 9 | Módulo formal de ingestão das DERADSAs | Planejado |
| 10 | Controle de acesso (quem consultou, quando, com quais filtros) | Planejado |
| 11 | Exportação de relatório auditável (PDF com metodologia embutida) | Planejado |

### Fase 3 — Expansão dos Dados

| Item | Dado necessário | Valor analítico |
|---|---|---|
| Cruzamento com CAR-PI | Shapefile SICAR-PI | Identificar imóveis com responsabilidade fundiária direta |
| Cruzamento com UCs | Shapefile ICMBio | KPI: ha desmatado em áreas de proteção máxima |
| Cruzamento com TIs | Shapefile FUNAI | KPI: ha desmatado em Terras Indígenas |
| Índice de Pressão Composta (IPC) | Calculável com dados existentes | Ranking de risco municipal ponderado |
| DERADSAs 2022–2023 | Arquivo SEMARH-PI | Completar série histórica de regularização estadual |

### Nota sobre Qualidade Científica

- Separação explícita entre "estimativa exploratória" e "dado para autuação"
- Publicação ou nota técnica com revisão antes de uso em decisão pública
- Série histórica a ser validada retroativamente quando dados homogêneos disponíveis

---

*Gerência do Centro de Geotecnologia Fundiária e Ambiental — GCGEO*  
*Versão 2.0 — Maio de 2025*
