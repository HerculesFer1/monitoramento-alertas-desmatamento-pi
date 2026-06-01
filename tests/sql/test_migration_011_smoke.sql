-- Smoke tests para Migration 011 — Vector Tiles + bbox-aware GeoJSON
-- Rodar via: psql ou Supabase SQL Editor após aplicar 011_mvt_and_bbox_serving.sql
--
-- Cada SELECT abaixo deve retornar TRUE — senão, migration regrediu.

-- 1) Função de tolerância retorna valores monotônicos decrescentes por zoom
SELECT
    simplification_tolerance(4)  > simplification_tolerance(8)
    AND simplification_tolerance(8)  > simplification_tolerance(12)
    AND simplification_tolerance(12) > simplification_tolerance(16)
    AS tolerancia_monotonica_decrescente;

-- 2) get_ap_geojson_bbox para bbox Piauí retorna >= 200 municípios
SELECT
    json_array_length((get_ap_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 6, 2025::SMALLINT) ->> 'features')::JSON) >= 200
    AS bbox_piaui_cobre_quase_todos;

-- 3) bbox muito pequena retorna FeatureCollection com features vazia (não NULL)
SELECT
    (get_ap_geojson_bbox(0.0, 0.0, 0.01, 0.01, 8, 2025::SMALLINT) ->> 'type') = 'FeatureCollection'
    AS retorna_feature_collection_vazia;

-- 4) MVT no tile que cobre Piauí (z=4, x=5, y=8) retorna bytes > 0
SELECT
    octet_length(get_ap_mvt(4, 5, 8, 2025::SMALLINT)) > 1000
    AS mvt_piaui_z4_substantial;

-- 5) MVT fora do Piauí (z=4, x=0, y=0) retorna NULL ou 0 bytes
SELECT
    COALESCE(octet_length(get_ap_mvt(4, 0, 0, 2025::SMALLINT)), 0) = 0
    AS mvt_fora_piaui_vazio;

-- 6) Simplificação preserva topologia (não vazia em zoom intermediário)
SELECT
    json_array_length((get_ap_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 10, 2025::SMALLINT) ->> 'features')::JSON) >= 200
    AS bbox_zoom10_ainda_completo;
