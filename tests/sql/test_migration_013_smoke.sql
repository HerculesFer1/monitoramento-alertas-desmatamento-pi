-- Smoke tests para Migration 013 — GRANT EXECUTE + indice composto
-- Rodar via psql ou Supabase SQL Editor após aplicar 013_polimento_grants_indices.sql

-- 1) anon tem EXECUTE em todas as RPCs get_ap_*
SELECT
    has_function_privilege('anon', 'get_ap_visao_geral(smallint)',         'EXECUTE') AND
    has_function_privilege('anon', 'get_ap_municipio_detalhe(text,smallint)', 'EXECUTE') AND
    has_function_privilege('anon', 'get_ap_ranking(integer,text,smallint)',  'EXECUTE') AND
    has_function_privilege('anon', 'get_ap_geojson(text,smallint)',          'EXECUTE') AND
    has_function_privilege('anon', 'get_ap_periodo_cobertura(smallint)',     'EXECUTE')
    AS anon_executa_ap_rpcs;

-- 2) anon tem EXECUTE em todas as RPCs get_qb_*
SELECT
    has_function_privilege('anon', 'get_qb_visao_geral(integer)',         'EXECUTE') AND
    has_function_privilege('anon', 'get_qb_municipios(integer)',          'EXECUTE') AND
    has_function_privilege('anon', 'get_qb_temporal(integer)',            'EXECUTE') AND
    has_function_privilege('anon', 'get_qb_ranking(integer,integer)',     'EXECUTE')
    AS anon_executa_qb_rpcs;

-- 3) Indice composto criado
SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'alertas_classificados'
      AND indexname = 'alertas_ano_codealerta_idx'
) AS indice_composto_criado;

-- 4) Planner usa o indice em COUNT(DISTINCT codealerta) por ano
--    (verificacao manual via EXPLAIN — comentado por nao ser smoke booleano)
-- EXPLAIN ANALYZE
-- SELECT ano, COUNT(DISTINCT codealerta)
-- FROM alertas_classificados
-- WHERE ano = 2025
-- GROUP BY ano;
