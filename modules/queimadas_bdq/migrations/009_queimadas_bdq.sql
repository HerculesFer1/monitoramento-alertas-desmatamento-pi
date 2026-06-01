-- Migration 009 — Módulo queimadas_bdq
-- Programa Jurisdicional REDD+ Piauí
-- Cicatrizes de Queimadas (AQ1km V6 Coleção 2 — BD Queimadas INPE)
-- × 5 classes de prioridade AHP × municípios do Piauí
--
-- Tabelas:
--   qb_cicatrizes_classes  — área queimada por (município × classe × mês)
--   qb_municipios_resumo   — resumo anual por município (mapa choropleth)
--   qb_execucoes           — log de execução do pipeline
--
-- RPCs (SECURITY DEFINER):
--   get_qb_visao_geral(p_ano)
--   get_qb_municipios(p_ano)
--   get_qb_temporal(p_ano)
--   get_qb_ranking(p_ano, p_limit)

-- ============================================================
-- TABELA PRINCIPAL: área queimada por município × classe × mês
-- ============================================================
CREATE TABLE IF NOT EXISTS qb_cicatrizes_classes (
    municipio_cod       TEXT          NOT NULL,
    municipio_nome      TEXT          NOT NULL,
    uf                  TEXT          NOT NULL DEFAULT 'PI',
    classe_prioridade   SMALLINT      NOT NULL,
    prioridade_label    TEXT,
    mes                 SMALLINT      NOT NULL,
    area_queimada_ha    NUMERIC(12,4) NOT NULL DEFAULT 0,
    n_cicatrizes        INTEGER       NOT NULL DEFAULT 0,
    ano                 SMALLINT      NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT qb_classes_pkey
        PRIMARY KEY (municipio_cod, classe_prioridade, mes, ano),

    CONSTRAINT qb_chk_classe
        CHECK (classe_prioridade BETWEEN 1 AND 5),

    CONSTRAINT qb_chk_mes
        CHECK (mes BETWEEN 1 AND 12),

    CONSTRAINT qb_chk_ano
        CHECK (ano BETWEEN 2002 AND 2099),

    CONSTRAINT qb_chk_area_positiva
        CHECK (area_queimada_ha >= 0),

    CONSTRAINT qb_chk_n_positivo
        CHECK (n_cicatrizes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_qb_classes_ano
    ON qb_cicatrizes_classes (ano);

CREATE INDEX IF NOT EXISTS idx_qb_classes_municipio
    ON qb_cicatrizes_classes (municipio_cod);

CREATE INDEX IF NOT EXISTS idx_qb_classes_classe
    ON qb_cicatrizes_classes (classe_prioridade);

-- ============================================================
-- TABELA RESUMO: uma linha por (município × ano)
-- Inclui geometria para mapa choropleth
-- ============================================================
CREATE TABLE IF NOT EXISTS qb_municipios_resumo (
    municipio_cod           TEXT          NOT NULL,
    municipio_nome          TEXT,
    uf                      TEXT          NOT NULL DEFAULT 'PI',
    geom                    GEOMETRY(GEOMETRY, 4326),
    bbox                    JSONB,
    area_queimada_total_ha  NUMERIC(12,4) NOT NULL DEFAULT 0,
    n_cicatrizes_total      INTEGER       NOT NULL DEFAULT 0,
    mes_pico                SMALLINT,
    classe_max_queimada     SMALLINT,
    pct_area_prioritaria    NUMERIC(6,2),   -- % área queimada em classes 4+5
    pct_queimada_estado     NUMERIC(6,2),   -- % do total queimado no PI
    area_ha_por_classe      JSONB,          -- {"1": 0.0, "2": 10.5, ...}
    ano                     SMALLINT        NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT qb_resumo_pkey
        PRIMARY KEY (municipio_cod, ano),

    CONSTRAINT qb_resumo_chk_classe_max
        CHECK (classe_max_queimada IS NULL OR classe_max_queimada BETWEEN 1 AND 5),

    CONSTRAINT qb_resumo_chk_mes_pico
        CHECK (mes_pico IS NULL OR mes_pico BETWEEN 1 AND 12),

    CONSTRAINT qb_resumo_chk_pct_prior
        CHECK (pct_area_prioritaria IS NULL OR pct_area_prioritaria BETWEEN 0 AND 100),

    CONSTRAINT qb_resumo_chk_area
        CHECK (area_queimada_total_ha >= 0)
);

CREATE INDEX IF NOT EXISTS idx_qb_resumo_ano
    ON qb_municipios_resumo (ano);

CREATE INDEX IF NOT EXISTS idx_qb_resumo_geom
    ON qb_municipios_resumo USING GIST (geom);

-- ============================================================
-- TABELA LOG: registro de cada execução do pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS qb_execucoes (
    id                    SERIAL        PRIMARY KEY,
    ano                   SMALLINT      NOT NULL,
    n_cicatrizes_piaui    INTEGER,
    area_queimada_ha      NUMERIC(12,4),
    n_municipios_afetados INTEGER,
    meses_com_dados       TEXT,             -- ex.: "1,2,3,8,9,10,11,12"
    n_registros_classes   INTEGER,
    fonte_dados           TEXT          DEFAULT 'AQ1km_V6_colecao2',
    executado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RPC 1: Visão Geral — KPIs + distribuição por classe + série mensal
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_visao_geral(p_ano INT DEFAULT 2025)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    WITH
    totais AS (
        SELECT
            SUM(area_queimada_ha)                                        AS area_total_ha,
            SUM(n_cicatrizes)                                            AS n_total,
            COUNT(DISTINCT municipio_cod)                                AS municipios_afetados,
            SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                                                                         AS area_prioritaria_ha,
            ROUND(
                SUM(CASE WHEN classe_prioridade >= 4 THEN area_queimada_ha ELSE 0 END)
                / NULLIF(SUM(area_queimada_ha), 0) * 100, 2
            )                                                            AS pct_prioritaria
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
    ),
    por_classe AS (
        SELECT
            json_agg(
                json_build_object(
                    'classe_prioridade', classe_prioridade,
                    'prioridade_label',  MAX(prioridade_label),
                    'area_queimada_ha',  ROUND(SUM(area_queimada_ha)::NUMERIC, 4),
                    'n_cicatrizes',      SUM(n_cicatrizes),
                    'pct_do_total',      ROUND(
                        SUM(area_queimada_ha)
                        / NULLIF((SELECT SUM(area_queimada_ha) FROM qb_cicatrizes_classes WHERE ano = p_ano), 0)
                        * 100, 2
                    )
                ) ORDER BY classe_prioridade
            ) AS dados
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
        GROUP BY classe_prioridade
    ),
    por_mes AS (
        SELECT
            json_agg(
                json_build_object(
                    'mes',            mes,
                    'area_ha',        ROUND(SUM(area_queimada_ha)::NUMERIC, 4),
                    'n_cicatrizes',   SUM(n_cicatrizes)
                ) ORDER BY mes
            ) AS dados
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
        GROUP BY mes
    )
    SELECT json_build_object(
        'kpis', json_build_object(
            'area_queimada_total_ha', ROUND((SELECT area_total_ha FROM totais)::NUMERIC, 4),
            'n_cicatrizes_total',     (SELECT n_total            FROM totais),
            'municipios_afetados',    (SELECT municipios_afetados FROM totais),
            'area_prioritaria_ha',    ROUND((SELECT area_prioritaria_ha FROM totais)::NUMERIC, 4),
            'pct_em_prioritarias',    (SELECT pct_prioritaria    FROM totais),
            'ano',                    p_ano
        ),
        'por_classe', (SELECT dados FROM por_classe),
        'por_mes',    (SELECT dados FROM por_mes)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================
-- RPC 2: Municípios — dados para mapa choropleth
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_municipios(p_ano INT DEFAULT 2025)
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
            'municipio_cod',          municipio_cod,
            'municipio_nome',         municipio_nome,
            'area_queimada_total_ha', area_queimada_total_ha,
            'n_cicatrizes_total',     n_cicatrizes_total,
            'mes_pico',               mes_pico,
            'classe_max_queimada',    classe_max_queimada,
            'pct_area_prioritaria',   pct_area_prioritaria,
            'pct_queimada_estado',    pct_queimada_estado,
            'area_ha_por_classe',     area_ha_por_classe,
            'bbox',                   bbox,
            'geom',                   CASE
                                        WHEN geom IS NOT NULL
                                        THEN ST_AsGeoJSON(geom)::JSON
                                        ELSE NULL
                                      END
        )
    ) INTO v_result
    FROM qb_municipios_resumo
    WHERE ano = p_ano
      AND area_queimada_total_ha > 0
    ORDER BY area_queimada_total_ha DESC;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 3: Temporal — série mensal Jan–Dez
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_temporal(p_ano INT DEFAULT 2025)
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
            mes,
            SUM(area_queimada_ha)   AS area_ha,
            SUM(n_cicatrizes)       AS n_cicatrizes,
            -- Breakout por classe
            SUM(CASE WHEN classe_prioridade = 1 THEN area_queimada_ha ELSE 0 END) AS area_classe_1,
            SUM(CASE WHEN classe_prioridade = 2 THEN area_queimada_ha ELSE 0 END) AS area_classe_2,
            SUM(CASE WHEN classe_prioridade = 3 THEN area_queimada_ha ELSE 0 END) AS area_classe_3,
            SUM(CASE WHEN classe_prioridade = 4 THEN area_queimada_ha ELSE 0 END) AS area_classe_4,
            SUM(CASE WHEN classe_prioridade = 5 THEN area_queimada_ha ELSE 0 END) AS area_classe_5
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
        GROUP BY mes
        ORDER BY mes
    )
    SELECT json_agg(
        json_build_object(
            'mes',          mes,
            'area_ha',      ROUND(area_ha::NUMERIC, 4),
            'n_cicatrizes', n_cicatrizes,
            'por_classe', json_build_object(
                '1', ROUND(area_classe_1::NUMERIC, 4),
                '2', ROUND(area_classe_2::NUMERIC, 4),
                '3', ROUND(area_classe_3::NUMERIC, 4),
                '4', ROUND(area_classe_4::NUMERIC, 4),
                '5', ROUND(area_classe_5::NUMERIC, 4)
            )
        ) ORDER BY mes
    ) INTO v_result
    FROM serie;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC 4: Ranking — top municípios por área queimada
-- ============================================================
CREATE OR REPLACE FUNCTION get_qb_ranking(
    p_ano   INT DEFAULT 2025,
    p_limit INT DEFAULT 20
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
            'rank',                   ROW_NUMBER() OVER (ORDER BY area_queimada_total_ha DESC),
            'municipio_cod',          municipio_cod,
            'municipio_nome',         municipio_nome,
            'area_queimada_total_ha', area_queimada_total_ha,
            'n_cicatrizes_total',     n_cicatrizes_total,
            'classe_max_queimada',    classe_max_queimada,
            'pct_area_prioritaria',   pct_area_prioritaria,
            'mes_pico',               mes_pico
        )
    ) INTO v_result
    FROM (
        SELECT *
        FROM qb_municipios_resumo
        WHERE ano = p_ano
          AND area_queimada_total_ha > 0
        ORDER BY area_queimada_total_ha DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- Row Level Security (RLS) — leitura pública, escrita via service key
-- ============================================================
ALTER TABLE qb_cicatrizes_classes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_municipios_resumo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_execucoes           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qb_classes_select  ON qb_cicatrizes_classes;
DROP POLICY IF EXISTS qb_resumo_select   ON qb_municipios_resumo;
DROP POLICY IF EXISTS qb_exec_select     ON qb_execucoes;

CREATE POLICY qb_classes_select ON qb_cicatrizes_classes
    FOR SELECT USING (true);

CREATE POLICY qb_resumo_select ON qb_municipios_resumo
    FOR SELECT USING (true);

CREATE POLICY qb_exec_select ON qb_execucoes
    FOR SELECT USING (true);

-- Grant EXECUTE nas RPCs para anon + authenticated
GRANT EXECUTE ON FUNCTION get_qb_visao_geral(INT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_municipios(INT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_temporal(INT)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_ranking(INT, INT)        TO anon, authenticated;
