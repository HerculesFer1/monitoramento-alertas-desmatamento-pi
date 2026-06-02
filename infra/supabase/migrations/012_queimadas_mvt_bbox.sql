-- ============================================================
-- Migration 012 — Queimadas: Vector Tiles (MVT) + bbox-aware GeoJSON
-- Achado A1 da auditoria GIS 2026-06-02.
--
-- Problema endereçado:
--   `get_qb_municipios(p_ano)` (migration 009) retornava geom completa
--   de 224 municípios + payload ~5-20 MB cada vez que a aba Queimadas
--   abre. Sem filtro bbox no servidor e sem simplificação por zoom.
--
-- Solução (espelha padrão da Migration 011 / ADR-008):
--   - get_qb_geojson_bbox(xmin,ymin,xmax,ymax,zoom,ano)
--   - get_qb_mvt(z, x, y, ano)        — MVT binário (~10-50 KB/tile)
--
-- Compatibilidade:
--   - get_qb_municipios original (009) permanece ativo — marcado deprecated.
--   - simplification_tolerance é reutilizado da Migration 011.
--
-- Safe to re-run: CREATE OR REPLACE em todas as funções.
-- ============================================================

-- Pré-requisito: Migration 011 já deve ter sido aplicada
-- (simplification_tolerance é definida lá).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'simplification_tolerance'
    ) THEN
        RAISE EXCEPTION 'Migration 011 (MVT helpers) deve ser aplicada antes da 012.';
    END IF;
END $$;

-- ============================================================
-- RPC: get_qb_geojson_bbox
-- GeoJSON dos municípios com queimada filtrado por bbox + simplificado por zoom.
-- Substitui get_qb_municipios sem geom hardcoded de 5-20 MB.
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
                        ST_SimplifyPreserveTopology(r.geom, simplification_tolerance(p_zoom))
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
    'Queimadas em GeoJSON filtradas por bbox (ST_Intersects) e simplificadas por zoom.
     Substitui get_qb_municipios — payload tipicamente 10-100x menor.
     Filtra area_queimada > 0 (mantém compatibilidade com client antigo).';

-- ============================================================
-- RPC: get_qb_mvt — Mapbox Vector Tile binário (queimadas)
-- MapLibre: type:"vector", tiles:["/api/queimadas/{z}/{x}/{y}"]
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_mvt(
    z INT, x INT, y INT,
    p_ano SMALLINT DEFAULT 2025
)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
    mvt bytea;
BEGIN
    WITH tile AS (SELECT ST_TileEnvelope(z, x, y) AS env_3857),
    bbox AS (SELECT ST_Transform(env_3857, 4326) AS env_4326, env_3857 FROM tile),
    mvtgeom AS (
        SELECT
            ST_AsMVTGeom(
                ST_Transform(r.geom, 3857),
                bbox.env_3857,
                4096, 64, TRUE
            ) AS geom,
            r.municipio_cod          AS cod,
            r.municipio_nome         AS nome,
            ROUND(r.area_queimada_total_ha::NUMERIC, 2)              AS area_queimada_ha,
            r.n_cicatrizes_total                                      AS n_cicatrizes,
            r.mes_pico                                                AS mes_pico,
            r.classe_max_queimada                                     AS classe_max,
            ROUND(COALESCE(r.pct_area_prioritaria, 0)::NUMERIC, 2)    AS pct_prior
        FROM qb_municipios_resumo r, bbox
        WHERE r.ano = p_ano
          AND r.area_queimada_total_ha > 0
          AND r.geom IS NOT NULL
          AND ST_Intersects(r.geom, bbox.env_4326)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'queimadas', 4096, 'geom') INTO mvt FROM mvtgeom;

    RETURN mvt;
END;
$$;

COMMENT ON FUNCTION get_qb_mvt IS
    'MVT de queimadas por município. Layer name: queimadas.
     promoteId no MapLibre: usar property cod para feature-state hover.';

-- ============================================================
-- Permissões — leitura pública (anon) das novas RPCs
-- ============================================================
GRANT EXECUTE ON FUNCTION get_qb_geojson_bbox(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
    INT, SMALLINT
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_qb_mvt(INT, INT, INT, SMALLINT)
    TO anon, authenticated;

-- ============================================================
-- Marcar RPC antiga como deprecated em comentário
-- ============================================================
COMMENT ON FUNCTION get_qb_municipios(INT) IS
    'DEPRECATED (Migration 012): preferir get_qb_geojson_bbox(...) ou get_qb_mvt(z,x,y).
     Mantida para retrocompatibilidade — payload 5-20 MB para vista estadual.';
