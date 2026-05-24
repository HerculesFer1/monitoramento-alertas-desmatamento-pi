# Flow: Classificação de Alerta MapBiomas

**Persona:** P1 (Analista Ambiental)
**Módulo:** alertas_mapbiomas
**Gatilho:** Pipeline executado com novo shapefile MapBiomas

## Fluxo de Dados (Backend)

```
1. Download
   └─ MapBiomas Alerta API / arquivo local
      → Alertas de Desmatamento(MAPBIOMAS).geojson

2. Leitura
   └─ LocalGeoJSONReader.read()
      → GeoDataFrame bruto (colunas CODEALERTA, BIOMA, MUNICIPIO, ANODETEC, ...)

3. Filtro Temporal
   └─ anos configurados (ANOS = [2022, 2023, 2024, 2025])

4. Reprojeção
   └─ → EPSG:4326

5. Parse + Enriquecimento
   └─ processor.parse_alertas()
      → add: area_ha, area_original_ha, VPRESSAO, vpressao_ptbr

6. Cruzamento ASV/DERADSA
   └─ classify.AlertClassifier
      ├─ ASVs SINAFLOR  → pct_cobertura (área coberta / área alerta)
      ├─ DERADSAs SEMARH → verificação adicional
      └─ PRODES-Cerrado → flag discordante

7. Classificação em 4 classes
   ┌─────────────────────────────────────────────────────────┐
   │ pct_cobertura ≥ threshold_autorizado (99%)              │
   │   → AUTORIZADO (verde)                                  │
   │ 0 < pct_cobertura < 99% E tem instrumento válido        │
   │   → AUTORIZADO_PARCIALMENTE (azul)                      │
   │ Tem DERADSA no ano de detecção                          │
   │   → REGULARIZADO (laranja)                              │
   │ Sem instrumento legal                                    │
   │   → IRREGULAR (vermelho)                               │
   └─────────────────────────────────────────────────────────┘

8. Indicadores
   └─ indicators.apply_indicators()
      → add: reincidente, IPI, codealerta (lowercase), ...

9. Testes de Qualidade (T1–T9)
   └─ quality.run_all_tests()
      → QualityReport com n_passed/n_total

10. Agregação Municipal
    └─ aggregator.aggregate()
       → agregado_municipios.json, monthly_alertas.json, resumo_estatico.json

11. Upload Supabase + Export GeoJSON
    └─ core.uploader + alertas_classificados.geojson
```

## Fluxo de Visualização (Frontend)

```
Usuário abre dashboard
    │
    ├─ Aba "Visão Geral" (ExecutivaView)
    │   ├─ KPIs: total alertas, ha irregular, IPI, % autorizado
    │   ├─ Gráfico temporal (área por classe, IPI por ano)
    │   ├─ Mapa de alertas (MapView/BaseMap — MapLibre GL)
    │   └─ Pie chart distribuição de classes
    │
    ├─ Aba "Panorama Municipal" (MunicipalView)
    │   ├─ Tabela top-20 municípios por ha irregular
    │   └─ BarChart por município (filtrável por bioma/ano)
    │
    ├─ Aba "Evolução Temporal" (TemporalView)
    │   ├─ AreaChart acumulado por ano
    │   └─ Heatmap mensal (monthly_alertas.json)
    │
    └─ Aba "MATOPIBA" (MatopibaView)
        ├─ KPIs MATOPIBA vs restante do PI
        └─ Ranking municipal MATOPIBA
```

## Estados de Dados

| Estado | Fonte | Indicador |
|--------|-------|-----------|
| Ao Vivo | Supabase RPC | Badge verde "AO VIVO" |
| Estático | resumo_estatico.json | Badge cinza "ESTÁTICO" |
| Sem dados | Erro de fetch | ErrorBoundary + mensagem |
