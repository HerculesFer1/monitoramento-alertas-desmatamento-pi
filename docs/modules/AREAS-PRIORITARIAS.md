# Módulo: Áreas Prioritárias REDD+ Piauí
> Pipeline v3 · 2026-05-28 · CGEO / SEMARH-PI

## Propósito analítico (4 questões invioláveis)
1. **Onde está a floresta remanescente mais valiosa?**
2. **Onde o desmatamento avança sobre zonas prioritárias?**
3. **Onde está o maior estoque de carbono florestal intacto?**
4. **Quais municípios priorizar primeiro?**

---

## 5 Tabs (frontend)

| Tab | View | Responde |
|-----|------|----------|
| 1 | Visão Geral | Mapa coroplético + KPIs + gráfico por classe |
| 2 | Municipal | Click→fitBounds + camadas toggleáveis + stats |
| 3 | PRODES × Prioridade | Barras empilhadas + tabela filtrável por ano |
| 4 | **Biomassa** | Coroplético biomassa + heatmap AGB por classe |
| 5 | Ranking | Tabela ordenável + click → Tab Municipal |

---

## Dados de entrada

| Arquivo | Tipo | CRS | Fonte |
|---------|------|-----|-------|
| `classes_prioritarias.gpkg` | GPKG vetorial, 5 MultiPolygons | ESRI:102033 | Análise AHP interna |
| `floresta_2025.gpkg` | GPKG vetorial (gerar com `vectorize_forest.py`) | EPSG:4326 | Máscara florestal TIF |
| `prodes_classificados.geojson` | GeoJSON, 32.952 features | EPSG:4326 | PRODES/INPE local |
| `{agb,bgb,dw,litter}.tif` | Raster float64 | EPSG:4326 | Biomass rasters |

**Classes de prioridade:** 1=Muito Baixo … 5=Muito Alto (não mais 16 classes).

---

## Pipeline (backend)

```
vectorize_forest.py  → floresta_2025.gpkg (uma vez)
        ↓
processor.py:
  gpd.overlay(classes, municipios)          → ~1120 células
  gpd.overlay(células, floresta_2025.gpkg)  → area_floresta_ha
  gpd.overlay(células, prodes[ano])         → area_desmat_ha
        ↓
calculator.py:
  rasterstats.zonal_stats(células.geom, agb.tif) → agb_medio_tc_ha
  biomassa_total_tc = agb_medio × area_floresta_ha
  pct_floresta_estado (normalizado por total PI)
        ↓
upload → ap_classes_municipio + ap_municipios_resumo + ap_execucoes
```

CRS de trabalho: EPSG:4674 | CRS de área: EPSG:5880 | CRS de upload: EPSG:4326

---

## Schema Supabase (008 v3)

### `ap_classes_municipio`
PK: `(municipio_cod, classe_prioridade, ano_prodes)` · CHECK: `classe_prioridade BETWEEN 1 AND 5`
Colunas-chave: `prioridade_label`, `area_floresta_ha`, `area_desmat_ha`, `agb_medio_tc_ha`, `biomassa_total_tc`

### `ap_municipios_resumo`
PK: `municipio_cod` · `geom GEOMETRY(GEOMETRY,4326)` · `bbox JSONB`
Colunas-chave: `classe_max_prioridade`, `biomassa_floresta_tc`, `agb_medio_tc_ha` (nova v3)

### RPCs
- `get_ap_visao_geral(p_ano)` → KPIs + `n_municipios_classe_max`
- `get_ap_municipio_detalhe(p_cod, p_ano)` → detalhe com classes
- `get_ap_ranking(p_limit, p_orderby, p_ano)` → inclui `agb_medio_tc_ha`
- `get_ap_geojson(p_cod, p_ano)` → GeoJSON com `agb_medio_tc_ha` + `biomassa_total_tc`
- `get_ap_periodo_cobertura(p_ano)` → datas para PeriodBadge

---

## Passos para implantar (ordem obrigatória)

```
1. conda install -n desmatamento -c conda-forge rasterio rasterstats
2. python -m modules.areas_prioritarias.vectorize_forest
3. Supabase SQL Editor → executar 008_areas_prioritarias.sql
4. python -m pipeline  (config: ano=2025)
5. SELECT COUNT(*) FROM ap_classes_municipio  → esperado ~1000–1120
6. npm run dev → testar 5 tabs
```

---

## Regras invioláveis
- NUNCA vetorizar biomassa — usar `rasterstats.zonal_stats()` sempre
- NUNCA referenciar mais de 5 classes — `classe_prioridade BETWEEN 1 AND 5`
- NUNCA acessar `kpis.area_floresta_total_ha` — usar `kpis.prodes.area_floresta_total_ha`
- SEMPRE atualizar este arquivo ao mudar pipeline ou schema
