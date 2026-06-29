-- ============================================================
-- Migration 024: get_qb_municipios_multianual + geom + bbox
-- ============================================================
-- Aplicada em 2026-06-26 no projeto institucional ubcejvbnpuyouwpphryc.
--
-- Versão original (migration 023) não retornava geom/bbox, então o
-- choropleth da MunicipalView ficava cinza quando usuário selecionava
-- "Todos os anos". Esta migration adiciona LEFT JOIN com
-- qb_municipios_resumo para anexar a geometria (estática por município,
-- pega DISTINCT ON do registro mais recente).
--
-- DROP + CREATE: sinatura de retorno mudou (não é só CREATE OR REPLACE).
-- ============================================================

DROP FUNCTION IF EXISTS get_qb_municipios_multianual(INT, INT);

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
    area_ano_pico_ha       NUMERIC,
    geom                   geometry,
    bbox                   JSONB
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
    ),
    geom_recent AS (
        SELECT DISTINCT ON (municipio_cod)
            municipio_cod, geom, bbox
        FROM qb_municipios_resumo
        WHERE geom IS NOT NULL
        ORDER BY municipio_cod, ano DESC
    )
    SELECT
        a.municipio_cod, a.municipio_nome, a.uf,
        a.area_queimada_total_ha, a.n_cicatrizes_total,
        a.classe_max_queimada, a.pct_area_prioritaria,
        a.n_anos_com_queima,
        p.ano_pico,
        ROUND(p.area_ano_pico_ha::NUMERIC, 4) AS area_ano_pico_ha,
        g.geom,
        g.bbox
    FROM agg a
    LEFT JOIN pico_ano   p USING (municipio_cod)
    LEFT JOIN geom_recent g USING (municipio_cod)
    ORDER BY a.area_queimada_total_ha DESC;
$$;

COMMENT ON FUNCTION get_qb_municipios_multianual IS
    'Ranking de municípios agregado na janela [ano_ini, ano_fim] + geom/bbox '
    'do registro mais recente em qb_municipios_resumo (geometria é estática IBGE).';

GRANT EXECUTE ON FUNCTION get_qb_municipios_multianual(INT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
