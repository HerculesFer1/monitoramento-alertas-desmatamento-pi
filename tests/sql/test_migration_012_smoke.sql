-- Smoke tests para Migration 012 — Queimadas bbox + MVT
-- Rodar via psql ou Supabase SQL Editor após aplicar 012_queimadas_mvt_bbox.sql
-- Pré-requisito: dados em qb_municipios_resumo para o ano testado.
--
-- Cada SELECT abaixo deve retornar TRUE — senão, migration regrediu.

-- 1) get_qb_geojson_bbox retorna FeatureCollection (estrutura mínima)
SELECT
    (get_qb_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 6, 2025::SMALLINT) ->> 'type')
    = 'FeatureCollection'
    AS bbox_retorna_feature_collection;

-- 2) bbox Piauí deve cobrir municípios com queimada (>= 1)
SELECT
    json_array_length(
        (get_qb_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 6, 2025::SMALLINT)
         ->> 'features')::JSON
    ) >= 1
    AS bbox_piaui_tem_features;

-- 3) bbox muito pequena retorna features vazia mas FeatureCollection válido
SELECT
    json_array_length(
        (get_qb_geojson_bbox(0.0, 0.0, 0.01, 0.01, 8, 2025::SMALLINT)
         ->> 'features')::JSON
    ) = 0
    AS bbox_fora_piaui_vazio;

-- 4) MVT no tile que cobre Piauí (z=4, x=5, y=8) retorna bytes
--    (depende de haver dados; se vazio, vira NULL — verificar manualmente)
SELECT
    octet_length(get_qb_mvt(4, 5, 8, 2025::SMALLINT)) > 0
    AS mvt_piaui_z4_tem_bytes;

-- 5) MVT fora do Piauí (z=4, x=0, y=0) retorna NULL ou 0 bytes
SELECT
    COALESCE(octet_length(get_qb_mvt(4, 0, 0, 2025::SMALLINT)), 0) = 0
    AS mvt_fora_piaui_vazio;

-- 6) RPC antiga continua existindo (retrocompatibilidade)
SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_qb_municipios'
) AS rpc_antiga_preservada;
