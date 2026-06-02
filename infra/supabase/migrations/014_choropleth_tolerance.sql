-- ============================================================
-- Migration 014 — Tolerância de simplificação dedicada para GeoJSON choropleth
-- Achado M1 da auditoria GIS 2026-06-02.
--
-- Problema: `simplification_tolerance(zoom)` retorna 0.02° (~2 km) em z≤4.
-- OK para MVT (renderiza tile pixelado por design), mas grosseiro demais
-- para GeoJSON choropleth de borda municipal — polígonos viram "octogonais"
-- perceptíveis em zoom estadual.
--
-- Solução: nova função `simplification_tolerance_choropleth(zoom)` com
-- tolerância máxima 0.005° (~500 m em latitude do Piauí). Original
-- preservada — MVT continua usando tolerância maior para payload menor.
--
-- Atualiza get_ap_geojson_bbox e get_qb_geojson_bbox para usar a nova
-- função. get_alertas_bbox mantém a tolerância MVT-grade (alertas têm
-- bordas naturalmente ruidosas — simplificação agressiva ainda é OK).
--
-- Safe to re-run: CREATE OR REPLACE em todas as funções.
-- ============================================================

-- ============================================================
-- Helper: tolerância dedicada para choropleth municipal
-- Mantém borda IBGE perceptível em zoom estadual.
-- ============================================================
CREATE OR REPLACE FUNCTION simplification_tolerance_choropleth(zoom INT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN zoom IS NULL OR zoom < 4 THEN 0.005   -- ~500 m (era 0.02° em MVT)
        WHEN zoom < 6  THEN 0.002    -- ~200 m
        WHEN zoom < 8  THEN 0.001    -- ~100 m
        WHEN zoom < 10 THEN 0.0005   -- ~50 m
        WHEN zoom < 12 THEN 0.0002   -- ~20 m
        WHEN zoom < 14 THEN 0.0001   -- ~10 m
        WHEN zoom < 16 THEN 0.00005  -- ~5 m
        ELSE 0.0                      -- preserva todos os vértices
    END;
$$;

COMMENT ON FUNCTION simplification_tolerance_choropleth IS
    'Tolerância dedicada a GeoJSON choropleth (bordas municipais IBGE).
     Mais conservadora que simplification_tolerance (MVT) — preserva
     forma municipal em zoom estadual sem ficar "octogonal".
     M1 da auditoria GIS 2026-06-02.';

-- ============================================================
-- RPC: get_ap_geojson_bbox — usa tolerância choropleth
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_geojson_bbox(
    p_xmin DOUBLE PRECISION,
    p_ymin DOUBLE PRECISION,
    p_xmax DOUBLE PRECISION,
    p_ymax DOUBLE PRECISION,
    p_zoom INT      DEFAULT 6,
    p_ano  SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
    WITH bbox AS (
        SELECT ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) AS env
    )
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            json_agg(
                json_build_object(
                    'type',     'Feature',
                    'geometry', ST_AsGeoJSON(
                        ST_SimplifyPreserveTopology(
                            r.geom,
                            simplification_tolerance_choropleth(p_zoom)
                        )
                    )::json,
                    'properties', json_build_object(
                        'cod',                 r.municipio_cod,
                        'nome',                r.municipio_nome,
                        'classe_max',          r.classe_max_prioridade,
                        'area_floresta_ha',    ROUND(r.area_floresta_ha::NUMERIC, 2),
                        'area_desmat_ha',      ROUND(r.area_desmat_ha::NUMERIC, 2),
                        'ha_deter_recente',    ROUND(COALESCE(r.ha_deter_recente, 0)::NUMERIC, 2),
                        'pct_floresta_estado', ROUND(r.pct_floresta_estado::NUMERIC, 2),
                        'agb_medio_tc_ha',     ROUND(COALESCE(r.agb_medio_tc_ha, 0)::NUMERIC, 2),
                        'biomassa_total_tc',   ROUND(COALESCE(r.biomassa_floresta_tc, 0)::NUMERIC, 0),
                        'bbox',                r.bbox
                    )
                )
            ),
            '[]'::json
        )
    )
    FROM ap_municipios_resumo r, bbox
    WHERE r.ano_prodes = p_ano
      AND r.geom IS NOT NULL
      AND ST_Intersects(r.geom, bbox.env);
$$;

COMMENT ON FUNCTION get_ap_geojson_bbox IS
    'GeoJSON bbox-aware de areas_prioritarias. Usa
     simplification_tolerance_choropleth para preservar bordas IBGE
     em zoom estadual (Migration 014).';

-- ============================================================
-- RPC: get_qb_geojson_bbox — usa tolerância choropleth
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_geojson_bbox(
    p_xmin DOUBLE PRECISION,
    p_ymin DOUBLE PRECISION,
    p_xmax DOUBLE PRECISION,
    p_ymax DOUBLE PRECISION,
    p_zoom INT      DEFAULT 6,
    p_ano  SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
    WITH bbox AS (
        SELECT ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) AS env
    )
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            json_agg(
                json_build_object(
                    'type',     'Feature',
                    'geometry', ST_AsGeoJSON(
                        ST_SimplifyPreserveTopology(
                            r.geom,
                            simplification_tolerance_choropleth(p_zoom)
                        )
                    )::json,
                    'properties', json_build_object(
                        'cod',                    r.municipio_cod,
                        'nome',                   r.municipio_nome,
                        'area_queimada_total_ha', ROUND(r.area_queimada_total_ha::NUMERIC, 2),
                        'n_cicatrizes_total',     r.n_cicatrizes_total,
                        'mes_pico',               r.mes_pico,
                        'classe_max_queimada',    r.classe_max_queimada,
                        'pct_area_prioritaria',   ROUND(COALESCE(r.pct_area_prioritaria, 0)::NUMERIC, 2),
                        'pct_queimada_estado',    ROUND(COALESCE(r.pct_queimada_estado, 0)::NUMERIC, 2),
                        'area_ha_por_classe',     r.area_ha_por_classe,
                        'bbox',                   r.bbox
                    )
                )
            ),
            '[]'::json
        )
    )
    FROM qb_municipios_resumo r, bbox
    WHERE r.ano = p_ano
      AND r.area_queimada_total_ha > 0
      AND r.geom IS NOT NULL
      AND ST_Intersects(r.geom, bbox.env);
$$;

COMMENT ON FUNCTION get_qb_geojson_bbox IS
    'GeoJSON bbox-aware de queimadas_bdq. Usa
     simplification_tolerance_choropleth para preservar bordas IBGE
     em zoom estadual (Migration 014).';

-- ============================================================
-- Permissões
-- ============================================================
GRANT EXECUTE ON FUNCTION simplification_tolerance_choropleth(INT)
    TO anon, authenticated;
