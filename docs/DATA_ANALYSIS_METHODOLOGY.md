# Metodologia de Análise de Dados — Dashboard REDD+ Piauí

> Mini-relatório explicativo: como o sistema chega aos resultados exibidos no dashboard.
> Atualizado em **2026-06-02** com a auditoria GIS completa (18 achados endereçados,
> Migrations 011–014). Versão anterior (2026-06-01) cobria apenas a Migration 011.

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
│   Índices GiST + B-tree composto  ·  14 migrations                       │
│   RPCs: get_*_visao_geral, get_*_bbox, get_*_mvt (z/x/y)                 │
│   simplification_tolerance (MVT) + _choropleth (borda IBGE fina)         │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ PostgREST (anon key)
┌────────────────────────────────────▼─────────────────────────────────────┐
│ DASHBOARD REACT 19 + MAPLIBRE GL                                         │
│   TanStack Query  ·  Zustand  ·  Recharts                                │
│   GeoJSON bbox-aware  +  Vector Tiles binários (MVT)                     │
│   Hover via feature-state (60 FPS rAF-throttled)                         │
│   Natural Breaks (ckmeans) dinâmicos nas escalas cartográficas           │
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
Validado em três camadas defensivas:

1. **`core.uploader._ensure_crs_4326`** — aborta se CRS ausente ou exótico
   no momento do upload.
2. **`core.spatial_core.assert_projected_crs(gdf, label)`** (auditoria 2026-06-02 — C2)
   — função pública que aborta com mensagem clara se receber CRS geográfico
   (4326/4674/4267/4269). Chamada no `classify.py` do módulo `alertas_mapbiomas`
   antes do filtro `MIN_AREA_M2`, garantindo que polígonos em grau² jamais
   sejam descartados como "artefato" — um polígono de 1 grau² ≈ 12.000 km².
3. **`modules.areas_prioritarias.processor._calc_area_ha`** — reprojeta para
   5880 antes do `.area / 10_000`.

**Parâmetro `min_area` em `safe_intersection`/`safe_difference`** agora é
explícito — caller pode passar `0` quando opera em CRS geográfico (caso
raro, mas legítimo). Default permanece `MIN_AREA_M2 = 1.0` (m²).

Cobertura de teste:
- `tests/test_uploader_crs.py` — 5 testes (passthrough, reprojeção, rejeição).
- `tests/test_spatial.py` — 8 testes novos (auditoria C2) cobrindo
  `assert_projected_crs` em 5880/3857 (aceita) vs 4326/4674/sem CRS (rejeita),
  e `min_area` parametrizável em `safe_*`.

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

### 3.3 Queimadas — preservação da contagem original AQ1km/INPE

Auditoria 2026-06-02 (C1) corrigiu viés MAUP em `qb_cicatrizes_classes.n_cicatrizes`.

**Antes**: cada polígono pós-`gpd.overlay()` recebia `n_cicatrizes = 1` e
o agrupamento por (município × classe × mês) somava. Uma única cicatriz
INPE que cruzasse N fragmentos de célula da mesma chave era contada N vezes.
KPIs institucionais ficavam inflados em municípios onde uma classe AHP
possuía regiões geograficamente disjuntas.

**Agora**: ID estável `_cicatriz_id` é atribuído **antes** do overlay
(via `reset_index().rename(columns={"index": "_cicatriz_id"})`). O ID
sobrevive ao `gpd.overlay()`, e a agregação usa `nunique` em vez de `sum`.

Resultado: **1 polígono original AQ1km = 1 cicatriz**, independente de
quantos fragmentos o overlay produza. A metodologia raiz INPE permanece
intacta — apenas a forma de agregar foi corrigida.

Cobertura: `modules/queimadas_bdq/tests/test_processor.py::TestIntersectByMonth`
(3 testes que provam: cicatriz fragmentada → 1; duas cicatrizes distintas
na mesma célula → 2; cicatriz tocando 2 classes diferentes → 1 por classe).

### 3.4 Validação cruzada PRODES (módulo `prodes_cerrado`)

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

## 4. Como os mapas são servidos (Migrations 011–014)

Até a migration 010, todo o GeoJSON era materializado integralmente pelo
servidor (RPCs `get_alertas_geojson`, `get_ap_geojson`) — payloads de
~40 MB chegavam ao cliente, com geometrias de 50+ vértices/polígono
sendo renderizadas mesmo em zoom estadual.

A partir da Migration 011 (2026-06-01) e refinada nas Migrations 012/014
(2026-06-02), todas as RPCs geoespaciais seguem o mesmo padrão.

### 4.1 RPC com filtro bbox + simplificação por zoom

```sql
get_alertas_bbox(xmin, ymin, xmax, ymax, zoom, ano, classificacao, limit)
get_ap_geojson_bbox(xmin, ymin, xmax, ymax, zoom, ano)
get_qb_geojson_bbox(xmin, ymin, xmax, ymax, zoom, ano)  -- Migration 012
```

- `WHERE ST_Intersects(geom, ST_MakeEnvelope(xmin,ymin,xmax,ymax,4326))`
- `ST_SimplifyPreserveTopology(geom, simplification_tolerance_choropleth(zoom))`
  para choropleth municipal (preserva bordas IBGE)
- `ST_SimplifyPreserveTopology(geom, simplification_tolerance(zoom))`
  para alertas (bordas naturalmente ruidosas — tolerância maior é aceitável)
- Tolerância **MVT/alertas**: 0,02° em z≤4; 0,005° em z6; 0,0001° em z14; 0 em z≥16.
- Tolerância **choropleth dedicada** (Migration 014): 0,005° em z≤4; 0,0001° em z14; 0 em z≥16
  — sempre ≤ tolerância MVT no mesmo zoom.

Payload típico: **10–100× menor**.

### 4.2 Vector Tiles binários (MVT)

```sql
get_alertas_mvt(z, x, y, ano)
get_ap_mvt(z, x, y, ano)
get_qb_mvt(z, x, y, ano)  -- Migration 012
```

- `ST_Transform(geom, 3857)` (Web Mercator é exigido pelo XYZ tiling).
- `ST_AsMVTGeom(g, ST_TileEnvelope(z,x,y), extent=4096, buffer=64, clip=TRUE)`.
- `ST_AsMVT(features, '<layer-name>', 4096, 'geom')` retorna o tile
  binário pronto para `addSource({ type: 'vector', tiles: [...] })`.

Cada tile típico em zoom 6 retorna **6–30 KB**. O navegador só baixa os
tiles visíveis, com cache HTTP padrão.

### 4.3 BaseMap (alertas) — viewport tracking

Migrado para `useAlertasBbox` na auditoria 2026-06-02 (C4). Antes mostrava
"top 3000 alertas por área" do ano inteiro — independente da vista. Agora:

- `onMoveEnd` atualiza state `bbox` no hook `useAlertasBbox`.
- Servidor retorna apenas o que está visível, ordenado por `area_ha DESC`.
- Badge "Top N no viewport" só aparece quando teto (`MAX_FEATURES_PER_VIEWPORT = 5000`)
  é atingido — raramente, em zoom estadual extremo.

### 4.4 Permissões e índices (Migration 013 — auditoria B1/M3)

- **`GRANT EXECUTE`** explícito nas 9 RPCs `get_ap_*` e `get_qb_*` (antes
  funcionavam por herança implícita do PostgreSQL — agora auditável via
  `information_schema.routine_privileges`).
- **Índice composto** `(ano, codealerta)` em `alertas_classificados` para
  acelerar `COUNT(DISTINCT codealerta) FILTER WHERE ano = ?` (`get_resumo_anual`).

### 4.5 Hover sem jank

`promoteId` na `<Source>` + `requestAnimationFrame` no `onMouseMove` mantém
o hover a 60 FPS sem re-renderizar React. CPU caiu de 8–12% para ~1%.

### 4.6 QueimadasMap — robustez interativa (auditoria 2026-06-02 — A2/A3/A6)

- `useEffect [mapStyle]` chama `map.setStyle()` + re-adiciona layers no
  `styledata`. Antes, alternar light/dark deixava o basemap travado até reload.
- Refs (`useRef<municipios>`, `useRef<onSelectMunicipio>`) sincronizadas por
  `useEffect` separados. Click handler lê `ref.current` — sem closure stale
  quando dados mudam (filtros, paginação, ano).
- Filtro de camada `['all', ['has', 'pct_prior'], ['>', ...]]` é
  null-safe — se a propriedade chegar ausente, a camada simplesmente não
  renderiza (em vez de retornar `false` silenciosamente).

### 4.7 Natural Breaks dinâmicos (auditoria M5)

`frontend/src/core/lib/breaks.ts` implementa **ckmeans** (Wang & Song 2011 —
1D k-means via programação dinâmica) sem dependência externa. O `BiomassaView`
usa `useMemo` para computar quebras de `biomassa_total_tc` a partir do
GeoJSON real e atualiza o `paint['fill-color']` via `setPaintProperty()` sem
remount. Quando os dados ainda não chegaram, cai para o fallback estático
de `BREAKS_BIOMASSA`. Badge "JENKS" na legenda sinaliza ao usuário quando as
quebras vêm da distribuição real (transparência metodológica).

---

## 5. Como cada gráfico do dashboard é alimentado

| Componente do Dashboard | Fonte | Função SQL | Cálculo |
|---|---|---|---|
| KPI "IPI 2025" | `agregado_municipios` | `get_resumo_anual` | Σ ha_irreg / Σ ha_total × 100 |
| Choropleth IPI | `agregado_municipios` + `municipios_pi.geojson` | client-side merge por nome | Interpolação cor por BREAKS_IPI [30, 60, 80] |
| Tab PRODES | `alertas_classificados.flag_validacao_externa` | `get_resumo_prodes` | Concordantes / (Conc + Disc) por ciclo |
| Mapa MATOPIBA | `municipios_pi.geojson` + `MATOPIBA_SET` | client-side | Paint condicional: âmbar se `_matopiba=true` |
| Choropleth áreas prioritárias | `ap_municipios_resumo` | `get_ap_geojson_bbox` (Migrations 011/014) | Paint `match` por `classe_max_prioridade` + tolerância choropleth |
| Ranking municípios prioridade | `ap_municipios_resumo` | `get_ap_ranking` | ORDER BY whitelist (proteção SQL injection) |
| Biomassa por classe | `ap_classes_municipio` | `get_ap_visao_geral` | Σ biomassa_total_tc agrupado por classe |
| Choropleth Biomassa | `ap_municipios_resumo` | `get_ap_geojson_bbox` | Paint `interpolate` com quebras Jenks dinâmicas (M5) |
| Tab Queimadas | `qb_cicatrizes_classes` | `get_qb_visao_geral` | Σ area_queimada_ha + COUNT(DISTINCT _cicatriz_id) preservando AQ1km/INPE |
| Choropleth Queimadas | `qb_municipios_resumo` | `get_qb_geojson_bbox` (Migration 012) | Step expression por `area_ha`, legenda reativa ao tema |
| Alertas (BaseMap) | `alertas_classificados` | `get_alertas_bbox` (Migration 011, refator C4) | Filtro espacial por viewport + simplificação por zoom |

---

## 6. Testes que garantem essas regras

### Python

| Suíte | O que valida | Quantidade |
|---|---|---|
| `tests/test_classify.py` | T1–T9 do pipeline alertas + precedência ASV→DERADSA | 38 |
| `tests/test_spatial.py` | `fix_geoms`, `dissolve_safe`, `safe_intersection`, `safe_difference` + **`assert_projected_crs` (C2)** | 30 |
| `tests/test_quality.py` | T1–T9 reconciliação de área | 9 |
| `tests/test_indicators.py` | IPI, reincidência, defasagem | 16 |
| `tests/test_uploader_crs.py` | Validação CRS no uploader | 5 |
| `tests/test_config.py` | **NOVO** — `core/config.py` (A5) + guard de regressão `C:/11.` | 14 |
| `tests/test_utils.py` + `test_registry.py` | Plataforma | 20 |
| `modules/areas_prioritarias/tests/` | Pipeline vetorial v3 | 34 |
| `modules/queimadas_bdq/tests/` | Pipeline AQ1km × classes + **TestIntersectByMonth (C1)** | 17 |
| **TOTAL Python** | | **169 pytest** |

### TypeScript (vitest)

| Suíte | O que valida | Quantidade |
|---|---|---|
| `frontend/src/core/lib/__tests__/constants.test.ts` | Constantes compartilhadas | (existente) |
| `frontend/src/core/lib/__tests__/breaks.test.ts` | **NOVO** — ckmeans/Jenks + helpers (M5) | 17 |

### SQL — Smokes em `tests/sql/`

| Arquivo | Migration coberta | Asserts |
|---|---|---|
| `test_migration_008_smoke.sql` | 008 areas_prioritarias v3 | 8 |
| `test_migration_009_smoke.sql` | 009 queimadas_bdq | 9 |
| `test_migration_011_smoke.sql` | 011 MVT + bbox | 6 |
| `test_migration_012_smoke.sql` | 012 queimadas MVT/bbox | 6 |
| `test_migration_013_smoke.sql` | 013 GRANTs + índice | 3 |
| `test_migration_014_smoke.sql` | 014 tolerância choropleth | 5 |
| **TOTAL SQL** | | **37 asserts** |

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

## 8. Reprodutibilidade fora do CGEO (auditoria 2026-06-02 — A5)

Até 2026-06-02, módulos como `queimadas_bdq` e `areas_prioritarias` continham
`Path("C:/11. REDD+/...")` hardcoded em 11 lugares. O pipeline só rodava no
computador de origem.

`core/config.py` centraliza a resolução de caminhos externos. Em **Linux/CI/
Docker** ou em qualquer outro Windows, basta definir no `.env`:

```bash
REDD_DATA_ROOT=/srv/redd            # ou C:/outro-caminho/REDD
# Opcional — sobrescritas individuais:
# REDD_CLASSES_GPKG=/alt/classes.gpkg
# REDD_FOREST_MASK_TIF=/alt/floresta.tif
# REDD_BIOMASS_DIR=/alt/biomassa
# REDD_QUEIMADAS_RAW_DIR=/alt/queimadas/raw
```

O fallback default permanece `C:/11. REDD+` (caminho histórico CGEO/SEMARH-PI),
de modo que **nenhuma reconfiguração é necessária** no ambiente de origem.

Um **guard de regressão** em `tests/test_config.py::test_no_hardcoded_paths_in_modules`
percorre `modules/**/*.py` com regex `r"C:[/\\]+11\."` e falha o CI se
qualquer colaborador reintroduzir paths absolutos.

---

*CGEO / SEMARH-PI — atualizado em **2026-06-02** com auditoria GIS completa
(18 achados, 4 migrations novas, 11 commits). Versão anterior: 2026-06-01.*
