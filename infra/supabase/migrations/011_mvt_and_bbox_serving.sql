-- ============================================================
-- Migration 011 — Vector Tiles (MVT) + bbox-aware GeoJSON
-- Objetivo: serializar geometrias com simplificação topológica e
-- filtro bbox no servidor (reduz payload de ~40 MB para ~500 KB/tile).
-- Endereça: C1 (sem MVT), C2 (sem filtro bbox), C3 (limit 3000 oculto).
--
-- Compatibilidade: RPCs antigas (get_alertas_geojson, get_ap_geojson)
-- permanecem inalteradas — frontend migra incrementalmente.
--
-- Safe to re-run: usa CREATE OR REPLACE em todas as funções.
-- ============================================================

-- Garante que PostGIS é >= 3 (precisa de ST_AsMVT / ST_AsMVTGeom)
DO $$
DECLARE v_postgis_version TEXT;
BEGIN
    SELECT extversion INTO v_postgis_version FROM pg_extension WHERE extname = 'postgis';
    IF v_postgis_version IS NULL THEN
        RAISE EXCEPTION 'Extensão postgis não encontrada — habilitar em Database > Extensions.';
    END IF;
    -- Aceita 3.0+ (ST_AsMVT disponível desde PostGIS 2.4, mas usamos features 3.x)
    IF split_part(v_postgis_version, '.', 1)::INT < 3 THEN
        RAISE NOTICE 'PostGIS %: recomendado 3.x para MVT. Continuando...', v_postgis_version;
    END IF;
END $$;

-- ============================================================
-- Helper: tolerância de simplificação por nível de zoom
-- Retorna tolerância em graus (CRS 4326).
-- z=4 (estado)  → ~0.01°  (~1 km)
-- z=8 (município) → ~0.001° (~100 m)
-- z=12 (parcela) → ~0.00005° (~5 m)
-- z=16 (vértice) → 0 (sem simplificação)
-- ============================================================
CREATE OR REPLACE FUNCTION simplification_tolerance(zoom INT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN zoom IS NULL OR zoom < 4  THEN 0.02
        WHEN zoom < 6  THEN 0.01
        WHEN zoom < 8  THEN 0.005
        WHEN zoom < 10 THEN 0.001
        WHEN zoom < 12 THEN 0.0005
        WHEN zoom < 14 THEN 0.0001
        WHEN zoom < 16 THEN 0.00005
        ELSE 0.0
    END;
$$;

COMMENT ON FUNCTION simplification_tolerance IS
    'Tolerância de ST_SimplifyPreserveTopology em graus (CRS 4326) por nível de zoom.
     Equilibra payload vs precisão visual — zoom alto preserva vértices.';

-- ============================================================
-- RPC: get_alertas_bbox
-- GeoJSON dos alertas filtrado por bbox + simplificação por zoom.
-- Substitui get_alertas_geojson sem limit hardcoded.
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
SET search_path = public, pg_catalog
AS $$
    WITH bbox AS (
        SELECT ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) AS env
    ),
    filtered AS (
        SELECT
            a.id_fragmento,
            a.codealerta,
            a.classificacao,
            a.ano,
            a.bioma,
            a.municipio,
            a.area_ha,
            a.matopiba,
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
            json_agg(
                json_build_object(
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
                )
            ),
            '[]'::json
        )
    )
    FROM filtered;
$$;

COMMENT ON FUNCTION get_alertas_bbox IS
    'Alertas em GeoJSON filtrados por bbox (ST_Intersects) e simplificados por zoom.
     Substitui get_alertas_geojson — payload tipicamente 10-100× menor.
     ORDER BY area_ha DESC: prioriza alertas grandes quando p_limit atinge.';

-- ============================================================
-- RPC: get_alertas_mvt — Mapbox Vector Tile binário
-- MapLibre: type: "vector", tiles: ["/api/alertas/{z}/{x}/{y}"]
-- ============================================================
CREATE OR REPLACE FUNCTION get_alertas_mvt(
    z INT, x INT, y INT,
    p_ano SMALLINT DEFAULT NULL
)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
    mvt bytea;
BEGIN
    WITH tile AS (
        SELECT ST_TileEnvelope(z, x, y) AS env_3857
    ),
    bbox AS (
        SELECT ST_Transform(env_3857, 4326) AS env_4326, env_3857 FROM tile
    ),
    mvtgeom AS (
        SELECT
            ST_AsMVTGeom(
                ST_Transform(a.geom, 3857),
                bbox.env_3857,
                4096, 64, TRUE
            ) AS geom,
            a.id_fragmento,
            a.codealerta,
            a.classificacao,
            a.ano,
            a.area_ha,
            a.municipio,
            a.matopiba
        FROM alertas_classificados a, bbox
        WHERE ST_Intersects(a.geom, bbox.env_4326)
          AND (p_ano IS NULL OR a.ano = p_ano)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'alertas', 4096, 'geom') INTO mvt FROM mvtgeom;

    RETURN mvt;
END;
$$;

COMMENT ON FUNCTION get_alertas_mvt IS
    'Mapbox Vector Tile (MVT) binário no z/x/y. Buffer 64px, extent 4096.
     Cliente MapLibre: source type=vector. ~10-50 KB/tile típico.';

-- ============================================================
-- RPC: get_ap_geojson_bbox — variante bbox-aware do get_ap_geojson
-- Mantém retro: get_ap_geojson original permanece.
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
                        ST_SimplifyPreserveTopology(r.geom, simplification_tolerance(p_zoom))
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
    'Variante bbox-aware de get_ap_geojson. Cliente envia bbox visível + zoom;
     servidor retorna GeoJSON simplificado apenas dos municípios na vista.
     Original mantida para retrocompatibilidade.';

-- ============================================================
-- RPC: get_ap_mvt — vector tiles para áreas prioritárias (municípios)
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_mvt(
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
            r.classe_max_prioridade  AS classe_max,
            ROUND(r.area_floresta_ha::NUMERIC, 2)                       AS area_floresta_ha,
            ROUND(r.area_desmat_ha::NUMERIC, 2)                         AS area_desmat_ha,
            ROUND(COALESCE(r.biomassa_floresta_tc, 0)::NUMERIC, 0)      AS biomassa_total_tc,
            ROUND(COALESCE(r.agb_medio_tc_ha, 0)::NUMERIC, 2)           AS agb_medio_tc_ha
        FROM ap_municipios_resumo r, bbox
        WHERE r.ano_prodes = p_ano
          AND r.geom IS NOT NULL
          AND ST_Intersects(r.geom, bbox.env_4326)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'areas_prioritarias', 4096, 'geom') INTO mvt FROM mvtgeom;

    RETURN mvt;
END;
$$;

COMMENT ON FUNCTION get_ap_mvt IS
    'MVT de áreas prioritárias por município. Layer name: areas_prioritarias.
     promoteId no MapLibre: usar property cod para feature-state hover.';

-- ============================================================
-- Permissões — leitura pública (anon) das novas RPCs
-- ============================================================
GRANT EXECUTE ON FUNCTION simplification_tolerance(INT)                                                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_alertas_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, SMALLINT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_alertas_mvt(INT, INT, INT, SMALLINT)                                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_ap_geojson_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, SMALLINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_ap_mvt(INT, INT, INT, SMALLINT)                                            TO anon, authenticated;

-- ============================================================
-- Marcar RPCs antigas como deprecated em comentário
-- ============================================================
COMMENT ON FUNCTION get_alertas_geojson IS
    'DEPRECATED (Migration 011): preferir get_alertas_bbox(xmin,ymin,xmax,ymax,zoom,...).
     Mantida por 1 release para retrocompatibilidade do frontend.';

COMMENT ON FUNCTION get_ap_geojson IS
    'DEPRECATED (Migration 011): preferir get_ap_geojson_bbox(...) ou get_ap_mvt(z,x,y).
     Mantida para retrocompatibilidade — usar em telas que precisam de TODOS os municípios sem bbox (ex: estado inteiro a zoom baixo).';
