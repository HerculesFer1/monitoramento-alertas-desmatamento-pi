-- ============================================================
-- Migration 025 — Restaura campos por_classe faltantes
--
-- Aplicada no projeto institucional ubcejvbnpuyouwpphryc.
--
-- Dois bugs distintos com mesma raiz: RPCs deixaram de devolver
-- campos que o frontend exige como obrigatórios.
--
-- 1) get_ap_visao_geral (corrompida na migration 018):
--    ao migrar para schema nested {kpis: {prodes, deter}}, os
--    campos por_classe perderam area_total_ha, pct_floresta_media,
--    ha_deter_recente — quebrando ProdesPrioridadeView.tsx:219
--    com `pctFlor.toFixed(1)` em undefined.
--
-- 2) get_qb_temporal_multianual (incompleta desde a migration 023):
--    nunca devolveu por_classe (objeto com chaves "1".."5").
--    TemporalGrafico.tsx desenha SÓ as 5 linhas por classe — sem
--    o objeto, gráfico ficava vazio mesmo com area_ha rico.
--
-- Idempotente: CREATE OR REPLACE em ambas.
-- ============================================================

-- ─── 1. get_ap_visao_geral — restaura 3 campos no por_classe ────────────
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
               ROUND(SUM(area_floresta_ha)::NUMERIC, 2)             AS area_floresta_ha,
               ROUND(SUM(area_desmat_ha)::NUMERIC, 2)               AS area_desmat_ha,
               ROUND(SUM(area_total_ha)::NUMERIC, 2)                AS area_total_ha,
               ROUND(AVG(pct_floresta)::NUMERIC, 2)                 AS pct_floresta_media,
               ROUND(COALESCE(SUM(ha_deter_recente), 0)::NUMERIC, 2) AS ha_deter_recente,
               ROUND(SUM(biomassa_total_tc)::NUMERIC, 0)            AS biomassa_total_tc,
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
            'classe_prioridade',  classe_prioridade,
            'prioridade_label',   prioridade_label,
            'area_floresta_ha',   area_floresta_ha,
            'area_desmat_ha',     area_desmat_ha,
            'area_total_ha',      area_total_ha,
            'pct_floresta_media', pct_floresta_media,
            'ha_deter_recente',   ha_deter_recente,
            'biomassa_total_tc',  biomassa_total_tc,
            'n_municipios',       n_municipios
        ) ORDER BY classe_prioridade) FROM por_classe_agg)
    ) INTO v_result;

    RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION get_ap_visao_geral(SMALLINT) TO anon, authenticated;

COMMENT ON FUNCTION get_ap_visao_geral IS
    'Visão geral PRODES × Prioridade. por_classe inclui area_total_ha, '
    'pct_floresta_media e ha_deter_recente (restaurados na migration 025 '
    'após regressão da 018). Frontend ProdesPrioridadeView depende dos 3.';


-- ─── 2. get_qb_temporal_multianual — adiciona por_classe ────────────────
CREATE OR REPLACE FUNCTION get_qb_temporal_multianual(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2026
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
    WITH meses AS (
        SELECT generate_series(1, 12) AS mes
    ),
    -- Totais mensais por ano (para AVG entre anos do total)
    por_ano_mes AS (
        SELECT ano, mes,
               SUM(area_queimada_ha) AS area_ha,
               SUM(n_cicatrizes)     AS n_cicatrizes
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY ano, mes
    ),
    media_mes AS (
        SELECT
            m.mes,
            COALESCE(ROUND(AVG(p.area_ha)::NUMERIC, 4), 0)           AS area_ha,
            COALESCE(ROUND(AVG(p.n_cicatrizes)::NUMERIC, 0)::INT, 0) AS n_cicatrizes
        FROM meses m
        LEFT JOIN por_ano_mes p ON p.mes = m.mes
        GROUP BY m.mes
    ),
    -- Quebra por classe: total mensal POR ano POR classe → média entre anos
    por_ano_mes_classe AS (
        SELECT ano, mes, classe_prioridade,
               SUM(area_queimada_ha) AS area_classe
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY ano, mes, classe_prioridade
    ),
    media_mes_classe AS (
        SELECT mes, classe_prioridade,
               ROUND(AVG(area_classe)::NUMERIC, 4) AS area_classe_media
        FROM por_ano_mes_classe
        GROUP BY mes, classe_prioridade
    ),
    por_classe_obj AS (
        SELECT m.mes,
               COALESCE(
                   jsonb_object_agg(mc.classe_prioridade::TEXT, mc.area_classe_media)
                       FILTER (WHERE mc.classe_prioridade IS NOT NULL),
                   '{}'::JSONB
               ) AS por_classe
        FROM meses m
        LEFT JOIN media_mes_classe mc ON mc.mes = m.mes
        GROUP BY m.mes
    )
    SELECT json_agg(
        json_build_object(
            'mes',          mm.mes,
            'area_ha',      mm.area_ha,
            'n_cicatrizes', mm.n_cicatrizes,
            'por_classe',   pc.por_classe
        ) ORDER BY mm.mes
    )
    FROM media_mes mm
    JOIN por_classe_obj pc ON pc.mes = mm.mes;
$$;

COMMENT ON FUNCTION get_qb_temporal_multianual IS
    'Sazonalidade mensal média entre [ano_ini, ano_fim]. Sempre 12 entradas. '
    'por_classe contém {"1":ha, "2":ha, ...} média entre anos (não soma). '
    'por_classe restaurado na migration 025 — TemporalGrafico depende dele.';

GRANT EXECUTE ON FUNCTION get_qb_temporal_multianual(INT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
