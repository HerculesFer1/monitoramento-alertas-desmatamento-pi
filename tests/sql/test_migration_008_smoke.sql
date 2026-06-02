-- Smoke tests para Migration 008 — areas_prioritarias
-- Rodar via psql ou Supabase SQL Editor após dados estarem populados.
-- Pré-requisitos:
--   - Migration 008 aplicada
--   - ap_classes_municipio e ap_municipios_resumo populadas para 2025

-- 1) Tabela ap_classes_municipio existe com colunas obrigatórias v3
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ap_classes_municipio'
      AND column_name IN ('municipio_cod', 'classe_prioridade', 'area_floresta_ha',
                          'agb_medio_tc_ha', 'biomassa_total_tc', 'ha_deter_recente')
    HAVING COUNT(*) = 6
) AS ap_classes_schema_v3_completo;

-- 2) Constraint chk_classe_prioridade vigente (1..5)
SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_classe_prioridade'
) AS constraint_classe_1_5_existe;

-- 3) ap_municipios_resumo tem geom GEOMETRY(GEOMETRY, 4326)
SELECT
    f_table_name = 'ap_municipios_resumo'
    AND srid     = 4326
    AS geom_resumo_em_4326
FROM geometry_columns
WHERE f_table_name = 'ap_municipios_resumo' AND f_geometry_column = 'geom';

-- 4) Índice GiST em geom existe
SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'ap_municipios_resumo'
      AND indexname = 'idx_ap_resumo_geom'
) AS gist_geom_indexado;

-- 5) get_ap_visao_geral retorna estrutura kpis.prodes + kpis.deter
SELECT
    (get_ap_visao_geral(2025::SMALLINT) -> 'kpis' -> 'prodes') IS NOT NULL
    AND (get_ap_visao_geral(2025::SMALLINT) -> 'kpis' -> 'deter') IS NOT NULL
    AS visao_geral_estrutura_correta;

-- 6) get_ap_ranking respeita whitelist de orderby (não quebra com input inválido)
SELECT
    get_ap_ranking(10, 'COLUNA_INEXISTENTE; DROP TABLE x', 2025::SMALLINT) IS NOT NULL
    AS ranking_resistente_a_injecao;

-- 7) get_ap_geojson retorna FeatureCollection válido
SELECT
    (get_ap_geojson(NULL, 2025::SMALLINT) ->> 'type') = 'FeatureCollection'
    AS geojson_retorna_feature_collection;

-- 8) RLS habilitado nas 3 tabelas do módulo
SELECT
    bool_and(rowsecurity)
    AS rls_habilitado_em_todas
FROM pg_tables
WHERE tablename IN ('ap_classes_municipio', 'ap_municipios_resumo', 'ap_execucoes');
