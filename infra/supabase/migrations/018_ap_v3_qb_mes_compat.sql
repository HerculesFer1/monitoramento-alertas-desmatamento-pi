-- ============================================================
-- Migration 018 — Compatibilidade frontend v3 (queimadas + areas_prioritarias)
--
-- Aplicada no projeto institucional (ubcejvbnpuyouwpphryc) em 2026-06-18
-- para resolver 3 desencontros entre frontend e banco:
--
-- 1) get_ap_visao_geral — frontend espera {kpis: {prodes: {...}, deter: {...}}}
--    mas o banco institucional ainda tinha schema v2 flat.
-- 2) get_ap_geojson_bbox — hook usa, mas só get_ap_geojson existia.
-- 3) get_qb_municipios_mes — hook MesSeletor usa, não existia.
--
-- Tudo idempotente — CREATE OR REPLACE em todas as funções.
-- ============================================================

-- ─── 1. get_ap_visao_geral v3 (nested) ───────────────────────────────────
DROP FUNCTION IF EXISTS get_ap_visao_geral(SMALLINT) CASCADE;

CREATE OR REPLACE FUNCTION get_ap_visao_geral(p_ano SMALLINT DEFAULT 2025)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
    v_result JSON;
    v_floresta_total NUMERIC;
    v_desmat_total   NUMERIC;
    v_biomassa_total NUMERIC;
    v_n_mun     INT;
    v_n_classe5 INT;
BEGIN
    SELECT
        SUM(area_floresta_ha), SUM(area_desmat_ha), SUM(biomassa_total_tc),
        COUNT(DISTINCT municipio_cod),
        COUNT(DISTINCT municipio_cod) FILTER (WHERE classe_prioridade = 5 AND area_floresta_ha > 0)
    INTO v_floresta_total, v_desmat_total, v_biomassa_total, v_n_mun, v_n_classe5
    FROM ap_classes_municipio WHERE ano_prodes = p_ano;

    WITH por_classe_agg AS (
        SELECT classe_prioridade,
               COALESCE(MAX(prioridade_label),
                        CASE classe_prioridade
                          WHEN 1 THEN 'Muito Baixo' WHEN 2 THEN 'Baixo'
                          WHEN 3 THEN 'Médio'       WHEN 4 THEN 'Alto'
                          WHEN 5 THEN 'Muito Alto' END) AS prioridade_label,
               ROUND(SUM(area_floresta_ha)::NUMERIC, 2)  AS area_floresta_ha,
               ROUND(SUM(area_desmat_ha)::NUMERIC, 2)    AS area_desmat_ha,
               ROUND(SUM(biomassa_total_tc)::NUMERIC, 0) AS biomassa_total_tc,
               COUNT(DISTINCT municipio_cod) FILTER (WHERE area_floresta_ha > 0) AS n_municipios
        FROM ap_classes_municipio
        WHERE ano_prodes = p_ano
        GROUP BY classe_prioridade
    )
    SELECT json_build_object(
        'kpis', json_build_object(
            'prodes', json_build_object(
                'area_floresta_total_ha',  ROUND(v_floresta_total::NUMERIC, 2),
                'area_desmat_total_ha',    ROUND(v_desmat_total::NUMERIC, 2),
                'pct_desmat_estado',       ROUND((v_desmat_total / NULLIF(v_floresta_total, 0) * 100)::NUMERIC, 4),
                'biomassa_total_tc',       ROUND(v_biomassa_total::NUMERIC, 0),
                'total_municipios',        v_n_mun,
                'n_municipios_classe_max', v_n_classe5,
                'ano',                     p_ano
            ),
            'deter', json_build_object(
                'area_alertas_ha',         NULL,
                'n_municipios_com_alerta', 0,
                'disponivel',              FALSE
            )
        ),
        'por_classe', (SELECT json_agg(json_build_object(
            'classe_prioridade', classe_prioridade,
            'prioridade_label',  prioridade_label,
            'area_floresta_ha',  area_floresta_ha,
            'area_desmat_ha',    area_desmat_ha,
            'biomassa_total_tc', biomassa_total_tc,
            'n_municipios',      n_municipios
        ) ORDER BY classe_prioridade) FROM por_classe_agg)
    ) INTO v_result;

    RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION get_ap_visao_geral(SMALLINT) TO anon, authenticated;


-- ─── 2. get_ap_geojson_bbox — filtrada por bbox + simplificada ───────────
CREATE OR REPLACE FUNCTION get_ap_geojson_bbox(
    p_xmin DOUBLE PRECISION, p_ymin DOUBLE PRECISION,
    p_xmax DOUBLE PRECISION, p_ymax DOUBLE PRECISION,
    p_zoom INT DEFAULT 6, p_ano SMALLINT DEFAULT 2025
)
RETURNS JSON LANGUAGE sql STABLE
SET search_path = public, extensions, pg_catalog
AS $$
    WITH bbox AS (SELECT ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) AS env)
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, simplification_tolerance(p_zoom)))::json,
            'properties', json_build_object(
                'cod',                  r.municipio_cod,
                'nome',                 r.municipio_nome,
                'classe_max',           r.classe_max_prioridade,
                'area_floresta_ha',     ROUND(r.area_floresta_ha::NUMERIC, 2),
                'area_desmat_ha',       ROUND(r.area_desmat_ha::NUMERIC, 2),
                'pct_floresta_estado',  ROUND(COALESCE(r.pct_floresta_estado, 0)::NUMERIC, 2),
                'biomassa_floresta_tc', ROUND(COALESCE(r.biomassa_floresta_tc, 0)::NUMERIC, 0),
                'agb_medio_tc_ha',      ROUND(COALESCE(r.agb_medio_tc_ha, 0)::NUMERIC, 2),
                'ha_deter_recente',     ROUND(COALESCE(r.ha_deter_recente, 0)::NUMERIC, 2),
                'bbox',                 r.bbox
            )
        )), '[]'::json)
    )
    FROM ap_municipios_resumo r, bbox
    WHERE r.ano_prodes = p_ano
      AND r.geom IS NOT NULL
      AND ST_Intersects(r.geom, bbox.env);
$$;

GRANT EXECUTE ON FUNCTION get_ap_geojson_bbox(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
    INT, SMALLINT
) TO anon, authenticated;


-- ─── 3. get_qb_municipios_mes ─────────────────────────────────────────────
-- Quando p_mes é NULL, delega para get_qb_municipios (dados anuais).
-- Quando p_mes está definido, agrega apenas aquele mês × ano.
CREATE OR REPLACE FUNCTION get_qb_municipios_mes(
    p_ano INT DEFAULT 2025, p_mes INT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE v_result JSON;
BEGIN
    IF p_mes IS NULL THEN
        RETURN get_qb_municipios(p_ano);
    END IF;

    WITH mes_agg AS (
        SELECT c.municipio_cod,
               MAX(c.municipio_nome) AS municipio_nome,
               SUM(c.area_queimada_ha) AS area_queimada_total_ha,
               SUM(c.n_cicatrizes)     AS n_cicatrizes_total,
               (SELECT classe_prioridade FROM qb_cicatrizes_classes c2
                WHERE c2.municipio_cod = c.municipio_cod
                  AND c2.ano = p_ano AND c2.mes = p_mes
                ORDER BY c2.area_queimada_ha DESC LIMIT 1) AS classe_max
        FROM qb_cicatrizes_classes c
        WHERE c.ano = p_ano AND c.mes = p_mes
        GROUP BY c.municipio_cod
        HAVING SUM(c.area_queimada_ha) > 0
    )
    SELECT json_agg(json_build_object(
        'municipio_cod',           m.municipio_cod,
        'municipio_nome',          m.municipio_nome,
        'area_queimada_total_ha',  ROUND(m.area_queimada_total_ha::NUMERIC, 4),
        'n_cicatrizes_total',      m.n_cicatrizes_total,
        'mes_pico',                p_mes,
        'classe_max_queimada',     m.classe_max,
        'pct_area_prioritaria',    NULL,
        'pct_queimada_estado',     NULL,
        'area_ha_por_classe',      NULL,
        'bbox',                    r.bbox,
        'geom',                    CASE WHEN r.geom IS NOT NULL
                                        THEN ST_AsGeoJSON(r.geom)::JSON ELSE NULL END
    ) ORDER BY m.area_queimada_total_ha DESC) INTO v_result
    FROM mes_agg m
    LEFT JOIN qb_municipios_resumo r
      ON r.municipio_cod = m.municipio_cod AND r.ano = p_ano;

    RETURN COALESCE(v_result, '[]'::JSON);
END; $$;

GRANT EXECUTE ON FUNCTION get_qb_municipios_mes(INT, INT) TO anon, authenticated;
