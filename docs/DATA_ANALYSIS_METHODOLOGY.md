# Metodologia de Análise de Dados — Dashboard REDD+ Piauí

> Mini-relatório explicativo: como o sistema chega aos resultados exibidos no dashboard.
> Atualizado em conjunto com a Auditoria GIS de 2026-06-01 (Migration 011 — MVT/bbox).

---

## 1. Visão geral do pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│ FONTES                                                                   │
│   MapBiomas Alerta (GraphQL v2)  ·  ASVs SINAFLOR+ (WFS IBAMA)           │
│   DERADSAs SEMARH (Supabase Storage)  ·  PRODES-Cerrado (WFS INPE)       │
│   DETER-Cerrado (WFS INPE)  ·  IBGE municípios  ·  Áreas Prioritárias    │
│   AGB/BGB/DW/Litter (rasters)  ·  AQ1km V6 cicatrizes (INPE)             │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼─────────────────────────────────────┐
│ MÓDULOS PYTHON (Vertical Slice)                                          │
│   downloader.py → processor.py → calculator.py → uploader.upload_*       │
│   • fix_geoms (make_valid)  • reprojeção CRS de cálculo                  │
│   • gpd.overlay + rasterstats  • zonal_stats (all_touched=True)          │
│   • testes T1–T9 + módulo-específicos                                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ EWKT (SRID=4326), batches de 200
┌────────────────────────────────────▼─────────────────────────────────────┐
│ SUPABASE POSTGIS                                                         │
│   Tabelas: alertas_classificados, agregado_municipios,                   │
│            ap_classes_municipio, ap_municipios_resumo,                   │
│            qb_cicatrizes_classes, qb_municipios_resumo, …                │
│   Índices GiST + B-tree  ·  11 migrations                                │
│   RPCs: get_*_visao_geral, get_*_bbox, get_*_mvt (z/x/y)                 │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ PostgREST (anon key)
┌────────────────────────────────────▼─────────────────────────────────────┐
│ DASHBOARD REACT 19 + MAPLIBRE GL                                         │
│   TanStack Query  ·  Zustand  ·  Recharts                                │
│   GeoJSON simplificado por zoom  +  Vector Tiles binários (MVT)          │
│   Hover via feature-state (60 FPS rAF-throttled)                         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRSs e cálculo de área

O sistema usa três CRSs com papéis distintos. Misturá-los é o erro geoespacial
mais comum — toda função de cálculo de área **reprojeta explicitamente** para
o CRS equivalente antes de chamar `.area`.

| Etapa | EPSG | Razão |
|---|---|---|
| Cálculo de área e interseção | **5880** (SIRGAS 2000 / Brasil Policônico) | Projeção equivalente em metros para o Brasil |
| Compatibilidade vetorial PRODES/IBGE | **4674** (SIRGAS 2000 geográfico) | CRS nativo de PRODES, DETER, malha IBGE |
| Visualização web e upload PostGIS | **4326** (WGS 84 geográfico) | Padrão GeoJSON, MapLibre, PostGIS GEOMETRY |
| MVT tiles (servidor) | **3857** (Web Mercator) | Padrão XYZ/Slippy map — `ST_AsMVTGeom` exige |

**Regra de ouro**: nenhuma área é calculada em CRS geográfico (4326/4674).
Validado por:
- `core.uploader._ensure_crs_4326` — aborta se CRS ausente ou exótico.
- `modules.areas_prioritarias.processor._calc_area_ha` — reprojeta para 5880
  antes do `.area / 10_000`.
- `tests/test_uploader_crs.py` — 5 testes cobrindo passthrough, reprojeção,
  rejeição de CRS ausente e exótico.

---

## 3. Como os números nos KPIs são calculados

### 3.1 IPI — Índice de Pressão Irregular (módulo `alertas_mapbiomas`)

```
IPI(ano) = Σ ha_irregular(ano) / Σ ha_total(ano) × 100
```

- `ha_irregular`: soma das áreas (em hectares, calculadas em EPSG:5880) dos
  fragmentos classificados como `IRREGULAR` no ano.
- `ha_total`: soma de **todas** as classes (`AUTORIZADO + AUT_PARCIALMENTE +
  REGULARIZADO + IRREGULAR`).
- O cálculo é feito por município × ano (`agregado_municipios.pct_irregular`)
  e re-agregado no frontend para os totais estaduais.

**Fragmentação (precedência ASV → DERADSA → IRREGULAR)**:
1. Para cada alerta, intersectar com ASVs válidas no momento do alerta:
   `dt_valid_inicio ≤ DATADETEC ≤ dt_valid_fim`
2. Se cobertura ≥ 99% → `AUTORIZADO` (geometria inteira).
   Se 0% < cobertura < 99% → `AUTORIZADO_PARCIALMENTE` (fragmento ASV) + residual.
3. Aplicar DERADSA **apenas no residual** (não no alerta inteiro).
4. O que sobrar → `IRREGULAR`.

Implementação: `modules/alertas_mapbiomas/classify.py:208-244`.

### 3.2 Classes de prioridade REDD+ (módulo `areas_prioritarias`)

Produto científico do raster `16_prioridade_classes_final.tif` (5 classes
finais via AHP: Pressão 83% + Valor/AGB 17%). Pipeline vetorial:

```
gpd.overlay(classes_gpkg, municipios_ibge)   → ~1.097 células (classe × município)
gdf_cls_mun["area_total_ha"]                  = células reprojetadas para 5880
rasterstats.zonal_stats(células, floresta.tif, all_touched=True)
                                              → area_floresta_ha
gpd.overlay(células, PRODES[ano])             → area_desmat_ha
rasterstats.zonal_stats(células, agb.tif, all_touched=True)
                                              → agb_medio_tc_ha
biomassa_total_tc                             = agb_medio × area_floresta_ha
```

`all_touched=True` foi adotado na auditoria 2026-06-01 (achado A3): evita
subestimação em células pequenas/finas onde o centróide do pixel está fora
do polígono mas a extensão toca.

**Classe máxima de um município** = maior classe com área_floresta > 0
(ex: `n_municipios_classe_max = 224` significa que todos os 224 municípios
têm pelo menos um pixel de classe 5, não que todos sejam "Muito Alta").

### 3.3 Validação cruzada PRODES (módulo `prodes_cerrado`)

Para cada alerta MapBiomas no bioma Cerrado:

```
ciclo_prodes(DATADETEC) = year+1 se month >= 8 else year
                            (PRODES vai de agosto/Y a julho/Y+1)
```

- Se há PRODES no mesmo ciclo cobrindo ≥ 30% do alerta → `CONCORDANTE`.
- Se há PRODES no ciclo mas não cobre → `DISCORDANTE`.
- Se PRODES ainda não foi publicado para esse ciclo → `SEM_PRODES_NO_CICLO`.
- Bioma Caatinga → `NAO_DISPONIVEL_CAATINGA` (sem produto INPE equivalente).

Concordância 2022–2025 cresceu de 60,7% para 76,2% — tendência reportada na
Tab PRODES do dashboard (`get_resumo_prodes`).

---

## 4. Como os mapas são servidos (Migration 011 — 2026-06-01)

Até a migration 010, todo o GeoJSON era materializado integralmente pelo
servidor (RPCs `get_alertas_geojson`, `get_ap_geojson`) — payloads de
~40 MB chegavam ao cliente, com geometrias de 50+ vértices/polígono
sendo renderizadas mesmo em zoom estadual.

### 4.1 RPC com filtro bbox + simplificação por zoom

```sql
get_ap_geojson_bbox(xmin, ymin, xmax, ymax, zoom, ano)
```

- `WHERE ST_Intersects(geom, ST_MakeEnvelope(xmin,ymin,xmax,ymax,4326))`
- `ST_SimplifyPreserveTopology(geom, simplification_tolerance(zoom))`
- Tolerância: 0,02° em z≤4; 0,005° em z6; 0,0001° em z14; 0 em z≥16.

Payload típico: **10–100× menor**.

### 4.2 Vector Tiles binários (MVT)

```sql
get_ap_mvt(z, x, y, ano)  →  bytea (MapLibre source type=vector)
```

- `ST_Transform(geom, 3857)` (Web Mercator é exigido pelo XYZ tiling).
- `ST_AsMVTGeom(g, ST_TileEnvelope(z,x,y), extent=4096, buffer=64, clip=TRUE)`.
- `ST_AsMVT(features, 'areas_prioritarias', 4096, 'geom')` retorna o tile
  binário pronto para `addSource({ type: 'vector', tiles: [...] })`.

Cada tile típico em zoom 6 retorna **6–30 KB**. O navegador só baixa os
tiles visíveis, com cache HTTP padrão.

### 4.3 Hover sem jank

`promoteId` na `<Source>` + `requestAnimationFrame` no `onMouseMove` mantém
o hover a 60 FPS sem re-renderizar React. CPU caiu de 8–12% para ~1%.

---

## 5. Como cada gráfico do dashboard é alimentado

| Componente do Dashboard | Fonte | Função SQL | Cálculo |
|---|---|---|---|
| KPI "IPI 2025" | `agregado_municipios` | `get_resumo_anual` | Σ ha_irreg / Σ ha_total × 100 |
| Choropleth IPI | `agregado_municipios` + `municipios_pi.geojson` | client-side merge por nome | Interpolação cor por BREAKS_IPI [30, 60, 80] |
| Tab PRODES | `alertas_classificados.flag_validacao_externa` | `get_resumo_prodes` | Concordantes / (Conc + Disc) por ciclo |
| Mapa MATOPIBA | `municipios_pi.geojson` + `MATOPIBA_SET` | client-side | Paint condicional: âmbar se `_matopiba=true` |
| Choropleth áreas prioritárias | `ap_municipios_resumo` | `get_ap_geojson_bbox` (Migration 011) | Paint match por `classe_max_prioridade` |
| Ranking municípios prioridade | `ap_municipios_resumo` | `get_ap_ranking` | ORDER BY whitelist (proteção SQL injection) |
| Biomassa por classe | `ap_classes_municipio` | `get_ap_visao_geral` | Σ biomassa_total_tc agrupado por classe |
| Tab Queimadas | `qb_cicatrizes_classes` | `get_qb_visao_geral` | Σ area_queimada_ha por classe×município |

---

## 6. Testes que garantem essas regras

| Suíte | O que valida | Quantidade |
|---|---|---|
| `tests/test_classify.py` | T1–T9 do pipeline alertas + precedência ASV→DERADSA | 38 |
| `tests/test_spatial.py` | `fix_geoms`, `dissolve_safe`, `safe_intersection`, `safe_difference` | 22 |
| `tests/test_quality.py` | T1–T9 reconciliação de área | 9 |
| `tests/test_indicators.py` | IPI, reincidência, defasagem | 16 |
| `tests/test_uploader_crs.py` | **NOVO** — validação CRS no uploader (A1+A2) | 5 |
| `tests/test_utils.py` + `test_registry.py` | Plataforma | 20 |
| `modules/areas_prioritarias/tests/` | Pipeline vetorial v3 | 34 |
| `tests/sql/test_migration_011_smoke.sql` | **NOVO** — MVT + bbox + tolerância | 6 SQL |
| **TOTAL Python** | | **144 pytest + 6 SQL** |

---

## 7. Limites conhecidos (transparência institucional)

- **Incerteza posicional MapBiomas Alerta**: ~±15 m — limitação de fonte,
  não do pipeline. Pode causar jitter em hit-testing em zoom alto (>14).
- **DERADSAs disponíveis apenas em 2024–2025**: ausência em 2022–2023 é
  limitação de dado, não metodológica. Campo `serie_b = True` distingue.
- **Caatinga sem PRODES equivalente**: alertas Caatinga marcados como
  `NAO_DISPONIVEL_CAATINGA` na validação cruzada.
- **DETER vs PRODES**: cobrem janelas temporais distintas (DETER preenche o
  gap pós-PRODES). PeriodBadge no UI deixa explícito: **"não somar PRODES
  e DETER — fontes distintas."**
- **"Estimativa exploratória" ≠ "dado para autuação"**: separação
  institucional obrigatória nos relatórios técnicos.

---

*CGEO / SEMARH-PI — atualizado em 2026-06-01 junto com Migration 011 e auditoria GIS.*
