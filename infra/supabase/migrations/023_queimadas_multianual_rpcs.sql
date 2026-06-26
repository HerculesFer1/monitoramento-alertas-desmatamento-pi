-- ============================================================
-- Migration 023: RPCs multianuais de queimadas (modo "Todos os anos")
-- ============================================================
-- Aplicada em 2026-06-26 no projeto institucional ubcejvbnpuyouwpphryc.
--
-- Fix B0 (commit 3944276) tornou "Todos os anos" cair em
-- ANO_RECENTE_COMPLETO como proxy. Mas o nome do filtro promete
-- agregação multi-ano de verdade. Estas RPCs entregam isso — somando
-- área, cicatrizes e municípios distintos em uma janela [p_ano_ini, p_ano_fim].
--
-- 3 RPCs criadas:
--   get_qb_visao_geral_multianual(ano_ini, ano_fim) → KPIs + por_classe + por_mes (média)
--   get_qb_municipios_multianual(ano_ini, ano_fim)  → ranking + n_anos + ano_pico
--   get_qb_temporal_multianual(ano_ini, ano_fim)    → sazonalidade média mensal
--
-- Convenção: por_mes contém MÉDIA mensal entre os anos da janela, não
-- soma — soma cresce proporcional ao n de anos e distorce visualização.
--
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- search_path inclui extensions porque PostGIS vive lá no Supabase.
-- ============================================================

-- ── 1. Visão geral agregada multi-ano ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_qb_visao_geral_multianual(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2026
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
    v_result JSON;
BEGIN
    WITH
    janela AS (
        SELECT * FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
    ),
    totais AS (
        SELECT
            SUM(area_queimada_ha)                                              AS area_total_ha,
            SUM(n_cicatrizes)                                                  AS n_total,
            COUNT(DISTINCT municipio_cod)                                       AS municipios_afetados,
            SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                                                                                AS area_prioritaria_ha,
            ROUND(
                SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                / NULLIF(SUM(area_queimada_ha), 0) * 100, 2
            )                                                                   AS pct_prioritaria
        FROM janela
    ),
    por_classe AS (
        SELECT json_agg(
            json_build_object(
                'classe_prioridade', classe_prioridade,
                'prioridade_label',  prioridade_label,
                'area_queimada_ha',  area_queimada_ha,
                'n_cicatrizes',      n_cicatrizes,
                'pct_do_total',      pct_do_total
            ) ORDER BY classe_prioridade
        ) AS dados
        FROM (
            SELECT
                classe_prioridade,
                MAX(prioridade_label)                                  AS prioridade_label,
                ROUND(SUM(area_queimada_ha)::NUMERIC, 4)               AS area_queimada_ha,
                SUM(n_cicatrizes)                                       AS n_cicatrizes,
                ROUND(
                    SUM(area_queimada_ha)
                    / NULLIF((SELECT SUM(area_queimada_ha) FROM janela), 0)
                    * 100, 2
                )                                                       AS pct_do_total
            FROM janela
            GROUP BY classe_prioridade
        ) sub
    ),
    por_mes AS (
        SELECT json_agg(
            json_build_object(
                'mes',            mes,
                'area_ha',        area_ha_media,
                'n_cicatrizes',   n_cicatrizes_media
            ) ORDER BY mes
        ) AS dados
        FROM (
            SELECT
                mes,
                ROUND(AVG(area_anual_mes)::NUMERIC, 4)  AS area_ha_media,
                ROUND(AVG(n_anual_mes)::NUMERIC, 0)::INT AS n_cicatrizes_media
            FROM (
                SELECT
                    ano, mes,
                    SUM(area_queimada_ha) AS area_anual_mes,
                    SUM(n_cicatrizes)     AS n_anual_mes
                FROM janela
                GROUP BY ano, mes
            ) anual
            GROUP BY mes
        ) avg_mes
    )
    SELECT json_build_object(
        'kpis', json_build_object(
            'area_queimada_total_ha', ROUND((SELECT area_total_ha FROM totais)::NUMERIC, 4),
            'n_cicatrizes_total',     (SELECT n_total            FROM totais),
            'municipios_afetados',    (SELECT municipios_afetados FROM totais),
            'area_prioritaria_ha',    ROUND((SELECT area_prioritaria_ha FROM totais)::NUMERIC, 4),
            'pct_em_prioritarias',    (SELECT pct_prioritaria    FROM totais),
            'ano_ini',                p_ano_ini,
            'ano_fim',                p_ano_fim,
            'modo',                   'multianual',
            'n_anos',                 p_ano_fim - p_ano_ini + 1
        ),
        'por_classe', COALESCE((SELECT dados FROM por_classe), '[]'::JSON),
        'por_mes',    COALESCE((SELECT dados FROM por_mes),    '[]'::JSON)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_qb_visao_geral_multianual IS
    'Espelha get_qb_visao_geral somando SUM(area) e DISTINCT(municipio) na janela [ano_ini, ano_fim]. '
    'por_mes contém a MÉDIA mensal entre os anos (sazonalidade típica), não soma.';

-- ── 2. Ranking de municípios agregado multi-ano ───────────────────────────
CREATE OR REPLACE FUNCTION get_qb_municipios_multianual(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2026
)
RETURNS TABLE (
    municipio_cod          TEXT,
    municipio_nome         TEXT,
    uf                     TEXT,
    area_queimada_total_ha NUMERIC,
    n_cicatrizes_total     INTEGER,
    classe_max_queimada    SMALLINT,
    pct_area_prioritaria   NUMERIC,
    n_anos_com_queima      BIGINT,
    ano_pico               INTEGER,
    area_ano_pico_ha       NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
    WITH janela AS (
        SELECT * FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
    ),
    por_mun_ano AS (
        SELECT municipio_cod, municipio_nome, uf, ano,
               SUM(area_queimada_ha) AS area_ano
        FROM janela
        GROUP BY municipio_cod, municipio_nome, uf, ano
    ),
    pico_ano AS (
        SELECT DISTINCT ON (municipio_cod)
            municipio_cod, ano AS ano_pico, area_ano AS area_ano_pico_ha
        FROM por_mun_ano
        WHERE area_ano > 0
        ORDER BY municipio_cod, area_ano DESC
    ),
    agg AS (
        SELECT
            municipio_cod, municipio_nome, MAX(uf) AS uf,
            ROUND(SUM(area_queimada_ha)::NUMERIC, 4) AS area_queimada_total_ha,
            SUM(n_cicatrizes)::INTEGER                AS n_cicatrizes_total,
            MAX(classe_prioridade)::SMALLINT          AS classe_max_queimada,
            ROUND(
                SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                / NULLIF(SUM(area_queimada_ha), 0) * 100, 2
            )                                          AS pct_area_prioritaria,
            COUNT(DISTINCT ano) FILTER (WHERE area_queimada_ha > 0) AS n_anos_com_queima
        FROM janela
        GROUP BY municipio_cod, municipio_nome
        HAVING SUM(area_queimada_ha) > 0
    )
    SELECT
        a.municipio_cod, a.municipio_nome, a.uf,
        a.area_queimada_total_ha, a.n_cicatrizes_total,
        a.classe_max_queimada, a.pct_area_prioritaria,
        a.n_anos_com_queima,
        p.ano_pico,
        ROUND(p.area_ano_pico_ha::NUMERIC, 4) AS area_ano_pico_ha
    FROM agg a
    LEFT JOIN pico_ano p USING (municipio_cod)
    ORDER BY a.area_queimada_total_ha DESC;
$$;

COMMENT ON FUNCTION get_qb_municipios_multianual IS
    'Ranking de municípios agregado na janela [ano_ini, ano_fim]. '
    'Inclui métricas exclusivas multi-ano: n_anos_com_queima e ano_pico.';

-- ── 3. Sazonalidade média multi-ano (curva mensal típica) ─────────────────
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
            COALESCE(ROUND(AVG(p.area_ha)::NUMERIC, 4), 0)        AS area_ha,
            COALESCE(ROUND(AVG(p.n_cicatrizes)::NUMERIC, 0)::INT, 0) AS n_cicatrizes
        FROM meses m
        LEFT JOIN por_ano_mes p ON p.mes = m.mes
        GROUP BY m.mes
    )
    SELECT json_agg(
        json_build_object(
            'mes',          mes,
            'area_ha',      area_ha,
            'n_cicatrizes', n_cicatrizes
        ) ORDER BY mes
    )
    FROM media_mes;
$$;

COMMENT ON FUNCTION get_qb_temporal_multianual IS
    'Sazonalidade mensal média entre [ano_ini, ano_fim]. Sempre 12 entradas. MÉDIA, não soma.';

-- ── GRANTs ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_qb_visao_geral_multianual(INT, INT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_municipios_multianual(INT, INT)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_temporal_multianual(INT, INT)      TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
