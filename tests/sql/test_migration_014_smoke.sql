-- Smoke tests para Migration 014 — tolerancia choropleth dedicada

-- 1) Nova funcao retorna valores monotonicos decrescentes por zoom
SELECT
    simplification_tolerance_choropleth(4)  > simplification_tolerance_choropleth(8)
    AND simplification_tolerance_choropleth(8)  > simplification_tolerance_choropleth(12)
    AND simplification_tolerance_choropleth(12) > simplification_tolerance_choropleth(16)
    AS choropleth_monotonica;

-- 2) Tolerancia choropleth e MAIS CONSERVADORA que MVT em todos os zooms
SELECT
    simplification_tolerance_choropleth(4)  <= simplification_tolerance(4)
    AND simplification_tolerance_choropleth(8)  <= simplification_tolerance(8)
    AND simplification_tolerance_choropleth(12) <= simplification_tolerance(12)
    AS choropleth_sempre_mais_fino;

-- 3) Em z>=16 ambas devem ser zero (preserva todos os vertices)
SELECT
    simplification_tolerance_choropleth(16) = 0.0
    AND simplification_tolerance(16) = 0.0
    AS zoom_alto_preserva_vertices;

-- 4) get_ap_geojson_bbox continua retornando FeatureCollection (sem regressao)
SELECT
    (get_ap_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 6, 2025::SMALLINT) ->> 'type')
    = 'FeatureCollection'
    AS ap_geojson_bbox_ainda_funciona;

-- 5) get_qb_geojson_bbox continua retornando FeatureCollection
SELECT
    (get_qb_geojson_bbox(-46.5, -11.5, -40.0, -2.5, 6, 2025::SMALLINT) ->> 'type')
    = 'FeatureCollection'
    AS qb_geojson_bbox_ainda_funciona;
