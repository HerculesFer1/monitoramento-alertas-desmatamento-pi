# Monitoramento de Alertas de Desmatamento — Piauí (2022–2025)

> **Plataforma de inteligência geoespacial** para análise e classificação de alertas de desmatamento no estado do Piauí, desenvolvida pela Gerência do Centro de Geotecnologia Fundiária e Ambiental (GCGEO) — SEMARH-PI.

[![Dashboard](https://img.shields.io/badge/Dashboard-Protótipo_HTML-2d6a4f?style=for-the-badge&logo=html5)]()
[![Pipeline](https://img.shields.io/badge/Pipeline-v2-52b788?style=for-the-badge&logo=python)]()
[![Licença](https://img.shields.io/badge/Uso-Interno_SEMARH--PI-orange?style=for-the-badge)]()

---

## Visão Geral

Este projeto implementa um **pipeline de análise geoespacial em cascata** para classificar alertas de desmatamento identificados pelo MapBiomas no Piauí, cruzando-os com os instrumentos de regularização ambiental emitidos:

- **ASVs** — Autorizações de Supressão de Vegetação (SINAFLOR+/IBAMA)
- **DERADSAs** — Declarações de Regularidade de Desmatamento (SEMARH-PI)

O resultado alimenta um **dashboard interativo** que permite avaliar a situação legal de cada alerta, identificar irregularidades e subsidiar decisões de fiscalização e política ambiental.

---

## Metodologia — Classificação em 4 Classes

O pipeline classifica cada alerta de desmatamento em quatro categorias, aplicadas em cascata com precedência ASV > DERADSA:

| Classificação | Cor | Condição |
|---|---|---|
| **AUTORIZADO** | Verde `#10B981` | Coberto por ASV válida (cobertura ≥ 99% da área do alerta) |
| **AUTORIZADO_PARCIALMENTE** | Verde claro | Parcialmente coberto por ASV válida (0% < cobertura < 99%) |
| **REGULARIZADO** | Laranja `#F97316` | Área residual coberta por DERADSA (disponível apenas 2024–2025) |
| **IRREGULAR** | Vermelho `#EF4444` | Sem cobertura por ASV nem DERADSA válidas |

### Regra de validação temporal das ASVs

A ASV é válida para um alerta **somente se**:

```
data_inicio_validade  ≤  data_detecção_alerta  ≤  data_fim_validade
```

### Precedência instrumental

```
Passo 1 → Interseção com ASVs válidas   → AUTORIZADO ou AUTORIZADO_PARCIALMENTE
Passo 2 → DERADSA aplicada no residual  → REGULARIZADO
Passo 3 → Área restante                 → IRREGULAR
```

> A análise usa **interseção geométrica real** (não critério de maioria de área).
> Fragmentos menores que 1 m² são descartados como artefatos geométricos.

### Duas séries temporais

- **Série A** (2022–2025, sem DERADSA): comparabilidade histórica garantida
- **Série B** (2024–2025, com DERADSA): quantifica impacto da regularização estadual

---

## Resultados (Pipeline v2)

| Ano | Alertas | Área Total (ha) | Irregular (ha) | IPI (%) |
|-----|---------|-----------------|----------------|---------|
| 2022 | 3.062 | 150.350 | 123.394 | 82,1% |
| 2023 | 4.527 | 138.035 | 97.997 | 71,0% |
| 2024 | 3.034 | 145.146 | 75.228 | 51,8% |
| 2025 | 2.676 | 152.527 | 42.376 | 27,8% |

> IPI = Índice de Pressão Irregular = ha_irregular / ha_total × 100

---

## Estrutura do Projeto

```
9.1 Monitoramento de Alertas de Desmatamento/
│
├── base de dados/                    ← dados brutos — NÃO modificar
│   ├── Alertas de Desmatamento(MAPBIOMAS).geojson
│   ├── ASVs Emitidas-PI(SINAFLOR+).geojson
│   ├── DERADSAs Emitidas[SEMARH-2024].geojson
│   └── DERADSAs Emitidas[SEMARH-2025].geojson
│
├── Resultado/                        ← gerado pelo pipeline
│   ├── alertas_classificados.geojson ← fragmentos com classificação jurídica
│   ├── agregado_municipios.json      ← indicadores por município/ano
│   ├── municipios_pi.geojson         ← geometrias dos municípios do PI (IBGE)
│   ├── pipeline.log                  ← log de auditoria da execução
│   └── index.html                   ← dashboard interativo (protótipo)
│
├── preprocess.py                     ← pipeline de geoprocessamento v2
├── rodar_pipeline.ps1                ← execução com duplo clique (Windows)
├── _gerar_documentacao.py            ← gerador da documentação técnica .docx
└── CLAUDE.md                         ← decisões técnicas do projeto
```

---

## Como Executar o Pipeline

### Pré-requisitos

O pipeline requer o ambiente conda `desmatamento` (Miniconda):

```bash
# Criar o ambiente (primeira vez)
conda create -n desmatamento python=3.11
conda activate desmatamento
conda install -c conda-forge geopandas=1.1.3 shapely=2.1.2 fiona=1.10.1 pandas requests numpy
```

### Execução

**Windows — recomendado:** duplo clique em `rodar_pipeline.ps1`

**Linha de comando:**
```bash
conda activate desmatamento
python preprocess.py
```

O pipeline lê os dados de `base de dados/` e gera os arquivos em `Resultado/`.
Tempo médio: ~1,5 minutos. Ao final, 8 testes automáticos de qualidade são executados.

### Visualização do dashboard

Abra `Resultado/index.html` no navegador — não requer servidor web.

---

## Fontes de Dados

| Dataset | Fonte | Período |
|---|---|---|
| Alertas de Desmatamento | MapBiomas Alerta | 2022–2025 (filtro) |
| ASVs Emitidas | SINAFLOR+ / IBAMA | Sem corte temporal fixo |
| DERADSAs | SEMARH-PI / GCGEO | 2024–2025 (disponível como dado geoespacial) |
| Malha Municipal | IBGE (API automática) | Referência 2024 |

> DERADSAs para 2022–2023 não estavam disponíveis como dado geoespacial no período de desenvolvimento.
> A ausência não significa inexistência dos instrumentos — é uma limitação de disponibilidade do dado.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Pipeline de dados | Python 3.11 · GeoPandas 1.1.3 · Shapely 2.1.2 · Fiona 1.10.1 |
| Projeção de cálculo | EPSG:5880 (SIRGAS 2000 / Brasil Policônico) |
| Projeção de saída | EPSG:4326 (WGS84) |
| Dashboard (protótipo) | HTML5 · CSS3 · Vanilla JavaScript |
| Mapas | Leaflet.js 1.9.4 |
| Gráficos | Chart.js 4.x |

### Arquitetura de produção planejada

React + TypeScript + MapLibre GL JS · FastAPI · PostgreSQL/PostGIS · Apache Airflow · DVC · Docker

---

## Qualidade — Testes Automáticos

O pipeline executa 8 testes a cada execução:

| Teste | Verifica |
|-------|----------|
| T1 | id_fragmento sem duplicatas |
| T2 | classificacao preenchida em todos os fragmentos |
| T3 | pct_cobertura em [0%, 100%] |
| T4 | AUTORIZADO_PARCIALMENTE com cobertura ≤ 99% |
| T5 | AUTORIZADO com cobertura ≥ 99% |
| T6 | Todos os anos 2022–2025 presentes |
| T7 | Volume mínimo por ano |
| T8 | REGULARIZADO restrito a 2024–2025 |

**Última execução**: 8/8 testes passados ✓

---

## MATOPIBA

O recorte do MATOPIBA (Decreto Federal nº 8.447/2015) abrange **26 municípios** do sudoeste piauiense e é monitorado separadamente por sua relevância jurídica e alta incidência de desmatamento na fronteira agrícola.

---

## Equipe

| Função | Responsável |
|---|---|
| Desenvolvimento & Análise Geoespacial | GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental |
| Órgão | SEMARH-PI — Secretaria de Meio Ambiente e Recursos Hídricos do Piauí |

---

## Licença

Uso interno — SEMARH-PI. Dados e metodologia sujeitos às políticas de dados abertos do Governo do Estado do Piauí.

---

*Última atualização: Maio de 2026 · Pipeline v2 · 8/8 testes OK*
