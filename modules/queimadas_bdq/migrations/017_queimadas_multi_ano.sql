-- Migration 017 — Módulo queimadas_bdq · análise multi-ano (2022–2025)
-- Programa Jurisdicional REDD+ Piauí
--
-- Adiciona RPCs comparativas que olham todo o intervalo de anos em vez
-- de um único ano. As RPCs existentes em 009 (get_qb_visao_geral, etc.)
-- continuam funcionando — esta migration é aditiva.
--
-- Novas RPCs (SECURITY DEFINER):
--   get_qb_serie_anual        (p_ano_ini, p_ano_fim)         — área/cicatrizes por ano
--   get_qb_comparativo_anos   (p_ano_ini, p_ano_fim)         — heatmap ano × classe
--   get_qb_ranking_multianual (p_ano_ini, p_ano_fim, p_lim)  — soma + média + anos com fogo
--   get_qb_recorrencia        (p_ano_ini, p_ano_fim, p_lim)  — IRF (índice de recorrência)
--   get_qb_sazonalidade       (p_ano_ini, p_ano_fim)         — padrão mensal médio
--
-- Novo índice composto: (ano, municipio_cod) — acelera os GROUP BY multi-ano.

-- ============================================================
-- ÍNDICE COMPOSTO — acelera GROUP BY ano, municipio_cod
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_qb_classes_ano_mun
    ON qb_cicatrizes_classes (ano, municipio_cod);

-- ============================================================
-- RPC 1: Série anual — área queimada, cicatrizes e % prioritária por ano
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_serie_anual(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2025
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    WITH serie AS (
        SELECT
            ano,
            SUM(area_queimada_ha)                                         AS area_ha,
            SUM(n_cicatrizes)                                             AS n_cicatrizes,
            COUNT(DISTINCT municipio_cod)                                 AS municipios_afetados,
            SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                                                                          AS area_prioritaria_ha,
            ROUND(
                SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                / NULLIF(SUM(area_queimada_ha), 0) * 100, 2
            )                                                             AS pct_prioritaria
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY ano
    )
    SELECT json_agg(
        json_build_object(
            'ano',                  ano,
            'area_ha',              ROUND(area_ha::NUMERIC, 4),
            'n_cicatrizes',         n_cicatrizes,
            'municipios_afetados',  municipios_afetados,
            'area_prioritaria_ha',  ROUND(area_prioritaria_ha::NUMERIC, 4),
            'pct_prioritaria',      pct_prioritaria
        ) ORDER BY ano
    ) INTO v_result
    FROM serie;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 2: Heatmap ano × classe — para visualização comparativa
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_comparativo_anos(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2025
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'ano',               ano,
            'classe_prioridade', classe_prioridade,
            'prioridade_label',  prioridade_label,
            'area_ha',           ROUND(area_ha::NUMERIC, 4),
            'n_cicatrizes',      n_cicatrizes
        ) ORDER BY ano, classe_prioridade
    ) INTO v_result
    FROM (
        SELECT
            ano,
            classe_prioridade,
            MAX(prioridade_label)     AS prioridade_label,
            SUM(area_queimada_ha)     AS area_ha,
            SUM(n_cicatrizes)         AS n_cicatrizes
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY ano, classe_prioridade
    ) t;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 3: Ranking multianual — soma + média + nº anos com fogo
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_ranking_multianual(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2025,
    p_limit   INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_n_anos INT := p_ano_fim - p_ano_ini + 1;
BEGIN
    -- Window function precisa ficar fora de json_agg — pré-calculamos o rank
    -- em CTE e depois agregamos. Postgres não aceita janela aninhada em agg.
    WITH base AS (
        SELECT
            municipio_cod,
            MAX(municipio_nome)                          AS municipio_nome,
            SUM(area_queimada_ha)                        AS area_total_ha,
            SUM(n_cicatrizes)                            AS n_cicatrizes_total,
            COUNT(DISTINCT ano) FILTER (
                WHERE area_queimada_ha > 0
            )                                            AS anos_com_fogo
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY municipio_cod
        HAVING SUM(area_queimada_ha) > 0
        ORDER BY area_total_ha DESC
        LIMIT p_limit
    ),
    ranked AS (
        SELECT ROW_NUMBER() OVER (ORDER BY area_total_ha DESC) AS rank, *
        FROM base
    )
    SELECT json_agg(
        json_build_object(
            'rank',                rank,
            'municipio_cod',       municipio_cod,
            'municipio_nome',      municipio_nome,
            'area_total_ha',       ROUND(area_total_ha::NUMERIC, 4),
            'area_media_anual_ha', ROUND((area_total_ha / v_n_anos)::NUMERIC, 4),
            'n_cicatrizes_total',  n_cicatrizes_total,
            'anos_com_fogo',       anos_com_fogo,
            'pct_anos_com_fogo',   ROUND((anos_com_fogo::NUMERIC / v_n_anos) * 100, 1)
        ) ORDER BY rank
    ) INTO v_result FROM ranked;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 4: Recorrência — Índice de Recorrência de Fogo (IRF)
--   IRF = anos com queima / anos analisados, por município
--   Filtro: apenas municípios com IRF >= 0.5 (recorrência alta)
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_recorrencia(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2025,
    p_limit   INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_n_anos INT := p_ano_fim - p_ano_ini + 1;
BEGIN
    SELECT json_agg(
        json_build_object(
            'municipio_cod',  municipio_cod,
            'municipio_nome', municipio_nome,
            'anos_com_fogo',  anos_com_fogo,
            'irf',            ROUND((anos_com_fogo::NUMERIC / v_n_anos), 3),
            'area_total_ha',  ROUND(area_total_ha::NUMERIC, 4)
        ) ORDER BY anos_com_fogo DESC, area_total_ha DESC
    ) INTO v_result
    FROM (
        SELECT
            municipio_cod,
            MAX(municipio_nome)            AS municipio_nome,
            COUNT(DISTINCT ano) FILTER (
                WHERE area_queimada_ha > 0
            )                              AS anos_com_fogo,
            SUM(area_queimada_ha)          AS area_total_ha
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY municipio_cod
        HAVING COUNT(DISTINCT ano) FILTER (WHERE area_queimada_ha > 0) >= CEIL(v_n_anos / 2.0)
        ORDER BY anos_com_fogo DESC, area_total_ha DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 5: Sazonalidade — padrão mensal médio do período
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_sazonalidade(
    p_ano_ini INT DEFAULT 2022,
    p_ano_fim INT DEFAULT 2025
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_n_anos INT := p_ano_fim - p_ano_ini + 1;
BEGIN
    WITH por_mes AS (
        SELECT
            mes,
            SUM(area_queimada_ha)                  AS area_total_ha,
            SUM(n_cicatrizes)                      AS n_cicatrizes_total
        FROM qb_cicatrizes_classes
        WHERE ano BETWEEN p_ano_ini AND p_ano_fim
        GROUP BY mes
    )
    SELECT json_agg(
        json_build_object(
            'mes',                 mes,
            'area_media_anual_ha', ROUND((area_total_ha / v_n_anos)::NUMERIC, 4),
            'area_total_ha',       ROUND(area_total_ha::NUMERIC, 4),
            'n_cicatrizes_total',  n_cicatrizes_total,
            'pct_do_ano',          ROUND(
                area_total_ha
                / NULLIF((SELECT SUM(area_queimada_ha) FROM qb_cicatrizes_classes
                          WHERE ano BETWEEN p_ano_ini AND p_ano_fim), 0)
                * 100, 2
            )
        ) ORDER BY mes
    ) INTO v_result
    FROM por_mes;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- GRANTs — leitura pública para frontend (anon + authenticated)
-- ============================================================
GRANT EXECUTE ON FUNCTION get_qb_serie_anual(INT, INT)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_comparativo_anos(INT, INT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_ranking_multianual(INT, INT, INT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_recorrencia(INT, INT, INT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_sazonalidade(INT, INT)             TO anon, authenticated;
