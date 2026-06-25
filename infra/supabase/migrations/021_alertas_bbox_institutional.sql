-- ============================================================
-- Migration 021: get_alertas_bbox + get_alertas_mvt no institucional
-- ============================================================
-- Aplicada em 2026-06-25 no projeto ubcejvbnpuyouwpphryc.
--
-- Contexto: a Migration 011 original foi parcialmente aplicada — apenas
-- o helper simplification_tolerance(zoom) entrou. As RPCs de alertas
-- (get_alertas_bbox, get_alertas_mvt) ficaram de fora, e o frontend
-- (BaseMap.tsx → useAlertasBbox) renderiza o mapa de Visão Geral do
-- módulo Mapbiomas vazio (apenas contorno do PI, sem polígonos de
-- alerta) porque a RPC retorna PGRST202.
--
-- Esta migration aplica apenas as 2 RPCs ausentes; as variantes _bbox
-- de áreas prioritárias (get_ap_geojson_bbox, get_ap_mvt) já estão no
-- banco via migrations 008/010.
--
-- search_path inclui 'extensions' (PostGIS vive lá no Supabase).
-- ============================================================

CREATE OR REPLACE FUNCTION get_alertas_bbox(
    p_xmin   DOUBLE PRECISION,
    p_ymin   DOUBLE PRECISION,
    p_xmax   DOUBLE PRECISION,
    p_ymax   DOUBLE PRECISION,
    p_zoom   INT      DEFAULT 8,
    p_ano    SMALLINT DEFAULT NULL,
    p_classificacao TEXT DEFAULT NULL,
    p_limit  INT      DEFAULT 5000
)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_catalog
AS $$
    WITH bbox AS (
        SELECT ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) AS env
    ),
    filtered AS (
        SELECT
            a.id_fragmento, a.codealerta, a.classificacao,
            a.ano, a.bioma, a.municipio, a.area_ha, a.matopiba,
            ST_SimplifyPreserveTopology(a.geom, simplification_tolerance(p_zoom)) AS geom_simp
        FROM alertas_classificados a, bbox
        WHERE ST_Intersects(a.geom, bbox.env)
          AND (p_ano           IS NULL OR a.ano           = p_ano)
          AND (p_classificacao IS NULL OR a.classificacao = p_classificacao)
        ORDER BY a.area_ha DESC NULLS LAST
        LIMIT p_limit
    )
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            json_agg(json_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(geom_simp)::json,
                'properties', json_build_object(
                    'id_fragmento',  id_fragmento,
                    'codealerta',    codealerta,
                    'classificacao', classificacao,
                    'ano',           ano,
                    'bioma',         bioma,
                    'municipio',     municipio,
                    'area_ha',       area_ha,
                    'matopiba',      matopiba
                )
            )),
            '[]'::json
        )
    )
    FROM filtered;
$$;

COMMENT ON FUNCTION get_alertas_bbox IS
    'Alertas em GeoJSON filtrados por bbox (ST_Intersects) e simplificados por zoom. '
    'Substitui get_alertas_geojson — payload tipicamente 10-100× menor.';

CREATE OR REPLACE FUNCTION get_alertas_mvt(
    z INT, x INT, y INT,
    p_ano SMALLINT DEFAULT NULL
)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
    mvt bytea;
BEGIN
    WITH tile AS (SELECT ST_TileEnvelope(z, x, y) AS env_3857),
    bbox AS (SELECT ST_Transform(env_3857, 4326) AS env_4326, env_3857 FROM tile),
    mvtgeom AS (
        SELECT
            ST_AsMVTGeom(
                ST_Transform(a.geom, 3857),
                bbox.env_3857,
                4096, 64, TRUE
            ) AS geom,
            a.id_fragmento, a.codealerta, a.classificacao,
            a.ano, a.area_ha, a.municipio, a.matopiba
        FROM alertas_classificados a, bbox
        WHERE ST_Intersects(a.geom, bbox.env_4326)
          AND (p_ano IS NULL OR a.ano = p_ano)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'alertas', 4096, 'geom') INTO mvt FROM mvtgeom;
    RETURN mvt;
END;
$$;

COMMENT ON FUNCTION get_alertas_mvt IS
    'Mapbox Vector Tile (MVT) binário no z/x/y. Buffer 64px, extent 4096. '
    'Cliente MapLibre: source type=vector. ~10-50 KB/tile típico.';

GRANT EXECUTE ON FUNCTION get_alertas_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, SMALLINT, TEXT, INT)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_alertas_mvt(INT, INT, INT, SMALLINT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
