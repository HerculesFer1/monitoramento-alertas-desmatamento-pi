-- ============================================================
-- Migration 019 — RPCs do módulo PRODES (frontend prodes_cerrado)
--
-- 4 RPCs que faltavam no institucional, alimentando o slide
-- "Monitoramento de Alertas PRODES" do dashboard:
--   get_prodes_visao_geral, get_prodes_temporal,
--   get_prodes_top_municipios, get_prodes_municipios_geojson
--
-- Aplicada no projeto institucional (ubcejvbnpuyouwpphryc) em 2026-06-18.
-- Cada uma lê de alertas_classificados e/ou agregado_municipios.
-- ============================================================

-- ─── 1. KPIs do ano ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_prodes_visao_geral(p_ano INT DEFAULT 2025)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_result JSON;
    v_ha_irr NUMERIC; v_ha_total NUMERIC;
BEGIN
    SELECT SUM(ha_irregular), SUM(ha_total)
    INTO v_ha_irr, v_ha_total FROM agregado_municipios WHERE ano = p_ano;

    SELECT json_build_object(
        'ano',                        p_ano,
        'n_municipios_com_irregular', COUNT(*) FILTER (WHERE ha_irregular > 0),
        'n_municipios_total',         COUNT(*),
        'ha_irregular_total',         COALESCE(SUM(ha_irregular), 0),
        'ha_autorizado_total',        COALESCE(SUM(ha_autorizado_total), 0),
        'ha_regularizado_total',      COALESCE(SUM(ha_regularizado), 0),
        'ha_total',                   COALESCE(SUM(ha_total), 0),
        'n_poligonos',                COALESCE(SUM(num_alertas), 0),
        'n_reincidentes',             COUNT(*) FILTER (WHERE reincidente = TRUE),
        'n_matopiba',                 COUNT(*) FILTER (WHERE matopiba = TRUE),
        'pct_irregular_estado',       CASE WHEN v_ha_total > 0
                                           THEN ROUND((v_ha_irr / v_ha_total * 100)::NUMERIC, 2)
                                           ELSE 0 END
    ) INTO v_result FROM agregado_municipios WHERE ano = p_ano;
    RETURN v_result;
END; $$;

-- ─── 2. Série temporal anual ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_prodes_temporal()
RETURNS JSON LANGUAGE sql STABLE
SET search_path = public, pg_catalog
AS $$
    WITH por_ano AS (
        SELECT ano,
               SUM(ha_irregular)                 AS ha_irregular,
               SUM(ha_autorizado)                AS ha_autorizado,
               SUM(ha_autorizado_parcialmente)   AS ha_autorizado_parcialmente,
               SUM(ha_autorizado_total)          AS ha_autorizado_total,
               SUM(ha_regularizado)              AS ha_regularizado,
               SUM(ha_total)                     AS ha_total,
               COUNT(DISTINCT municipio)         AS n_municipios,
               SUM(num_alertas)                  AS n_poligonos
        FROM agregado_municipios GROUP BY ano
    )
    SELECT json_agg(json_build_object(
        'ano',                          ano,
        'ha_irregular',                 ROUND(ha_irregular::NUMERIC, 2),
        'ha_autorizado',                ROUND(ha_autorizado::NUMERIC, 2),
        'ha_autorizado_parcialmente',   ROUND(ha_autorizado_parcialmente::NUMERIC, 2),
        'ha_autorizado_total',          ROUND(ha_autorizado_total::NUMERIC, 2),
        'ha_regularizado',              ROUND(ha_regularizado::NUMERIC, 2),
        'ha_total',                     ROUND(ha_total::NUMERIC, 2),
        'n_municipios',                 n_municipios,
        'n_poligonos',                  n_poligonos,
        'pct_irregular',                CASE WHEN ha_total > 0
                                             THEN ROUND((ha_irregular / ha_total * 100)::NUMERIC, 2)
                                             ELSE 0 END,
        'pct_autorizado',               CASE WHEN ha_total > 0
                                             THEN ROUND((ha_autorizado / ha_total * 100)::NUMERIC, 2)
                                             ELSE 0 END,
        'pct_autorizado_parcialmente',  CASE WHEN ha_total > 0
                                             THEN ROUND((ha_autorizado_parcialmente / ha_total * 100)::NUMERIC, 2)
                                             ELSE 0 END,
        'pct_autorizado_total',         CASE WHEN ha_total > 0
                                             THEN ROUND((ha_autorizado_total / ha_total * 100)::NUMERIC, 2)
                                             ELSE 0 END,
        'pct_regularizado',             CASE WHEN ha_total > 0
                                             THEN ROUND((ha_regularizado / ha_total * 100)::NUMERIC, 2)
                                             ELSE 0 END
    ) ORDER BY ano)
    FROM por_ano;
$$;

-- ─── 3. Top N municípios por irregular ──────────────────────────────
CREATE OR REPLACE FUNCTION get_prodes_top_municipios(p_ano INT DEFAULT 2025, p_limit INT DEFAULT 20)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_result JSON;
BEGIN
    WITH base AS (
        SELECT municipio, ha_irregular, ha_total,
               num_alertas      AS n_poligonos,
               matopiba, reincidente,
               COALESCE(anos_com_alerta_irregular, ARRAY[]::int[]) AS anos_com_irregular
        FROM agregado_municipios
        WHERE ano = p_ano AND ha_irregular > 0
        ORDER BY ha_irregular DESC LIMIT p_limit
    ),
    ranked AS (
        SELECT ROW_NUMBER() OVER (ORDER BY ha_irregular DESC) AS rank, *
        FROM base
    )
    SELECT json_agg(json_build_object(
        'rank',               rank,
        'municipio',          municipio,
        'ha_irregular',       ROUND(ha_irregular::NUMERIC, 2),
        'ha_total',           ROUND(ha_total::NUMERIC, 2),
        'pct_irregular',      CASE WHEN ha_total > 0
                                   THEN ROUND((ha_irregular / ha_total * 100)::NUMERIC, 2)
                                   ELSE 0 END,
        'n_poligonos',        n_poligonos,
        'matopiba',           matopiba,
        'reincidente',        reincidente,
        'anos_com_irregular', anos_com_irregular
    ) ORDER BY rank) INTO v_result FROM ranked;
    RETURN COALESCE(v_result, '[]'::JSON);
END; $$;

-- ─── 4. GeoJSON dos municípios (FeatureCollection) ──────────────────
-- agregado_municipios não tem geom; usa envoltório convexo dos alertas
-- do município/ano como aproximação visual.
CREATE OR REPLACE FUNCTION get_prodes_municipios_geojson(p_ano INT DEFAULT 2025)
RETURNS JSON LANGUAGE sql STABLE
SET search_path = public, extensions, pg_catalog
AS $$
    WITH muns AS (
        SELECT
            am.municipio, am.ano,
            am.ha_irregular, am.ha_total, am.pct_irregular,
            am.matopiba, am.reincidente,
            ST_ConvexHull(ST_Collect(ac.geom)) AS geom
        FROM agregado_municipios am
        LEFT JOIN alertas_classificados ac
          ON ac.municipio = am.municipio AND ac.ano = am.ano
        WHERE am.ano = p_ano AND am.ha_total > 0
        GROUP BY am.municipio, am.ano, am.ha_irregular, am.ha_total,
                 am.pct_irregular, am.matopiba, am.reincidente
    )
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(json_build_object(
            'type', 'Feature',
            'geometry', CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::json ELSE NULL END,
            'properties', json_build_object(
                'municipio',     municipio,
                'ano',           ano,
                'ha_irregular',  ROUND(ha_irregular::NUMERIC, 2),
                'ha_total',      ROUND(ha_total::NUMERIC, 2),
                'pct_irregular', pct_irregular,
                'matopiba',      matopiba,
                'reincidente',   reincidente
            )
        )), '[]'::json)
    )
    FROM muns;
$$;

GRANT EXECUTE ON FUNCTION get_prodes_visao_geral(INT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_prodes_temporal()              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_prodes_top_municipios(INT, INT)TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_prodes_municipios_geojson(INT) TO anon, authenticated;
