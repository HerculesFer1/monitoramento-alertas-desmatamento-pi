-- ============================================================
-- Migration 002: Módulo MATOPIBA + índices de performance
-- CGEO/SEMARH-PI — Pipeline v2
-- ============================================================

-- ── Índice composto (soluciona ARQ-6) ────────────────────────────────────
-- Queries mais frequentes filtram (ano, classificacao) conjuntamente.
CREATE INDEX IF NOT EXISTS alertas_ano_cls_idx
  ON alertas_classificados (ano, classificacao);

-- ── Materialized View: matopiba_municipios ───────────────────────────────
-- Adiciona métricas exclusivas da região:
--   · rank_irr_matopiba — ranking de área irregular dentro da região
--   · pct_do_matopiba   — participação percentual no total irregular da região
--   · delta_ipi_yoy     — variação do IPI ano a ano (YoY)
--
-- Por que Materialized View e não View simples?
--   View simples recalcularia as window functions a cada request.
--   Materialized View é pré-computada e atualizada com REFRESH após o pipeline.
-- ─────────────────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS matopiba_municipios;

CREATE MATERIALIZED VIEW matopiba_municipios AS
WITH base AS (
  SELECT
    municipio,
    ano,
    bioma_predominante,
    serie_b,
    ha_irregular,
    ha_autorizado,
    ha_autorizado_parcialmente,
    ha_autorizado_total,
    ha_regularizado,
    ha_total,
    pct_irregular,
    pct_autorizado_total,
    num_alertas,
    reincidente,
    vpressao_dominante_ptbr,
    defasagem_media_dias
  FROM agregado_municipios
  WHERE matopiba = TRUE
),
com_rank AS (
  SELECT
    *,
    -- Ranking de área irregular dentro do MATOPIBA-PI, por ano
    RANK() OVER (
      PARTITION BY ano ORDER BY ha_irregular DESC
    ) AS rank_irr_matopiba,

    -- % da área irregular do município em relação ao total irregular MATOPIBA no ano
    ROUND(
      ha_irregular
      / NULLIF(SUM(ha_irregular) OVER (PARTITION BY ano), 0) * 100,
      1
    ) AS pct_do_matopiba_irr,

    -- IPI do período anterior (LAG) para calcular delta YoY
    LAG(pct_irregular, 1) OVER (
      PARTITION BY municipio ORDER BY ano
    ) AS ipi_ano_anterior
  FROM base
)
SELECT
  municipio,
  ano,
  bioma_predominante,
  serie_b,
  ha_irregular,
  ha_autorizado,
  ha_autorizado_parcialmente,
  ha_autorizado_total,
  ha_regularizado,
  ha_total,
  pct_irregular,
  pct_autorizado_total,
  num_alertas,
  reincidente,
  vpressao_dominante_ptbr,
  defasagem_media_dias,
  rank_irr_matopiba,
  pct_do_matopiba_irr,
  -- Variação do IPI (positivo = piora, negativo = melhora)
  ROUND((pct_irregular - ipi_ano_anterior)::NUMERIC, 1) AS delta_ipi_yoy
FROM com_rank
ORDER BY ano, rank_irr_matopiba;

-- Índices na Materialized View
CREATE UNIQUE INDEX matopiba_mun_pk ON matopiba_municipios (municipio, ano);
CREATE INDEX matopiba_ano_idx       ON matopiba_municipios (ano);
CREATE INDEX matopiba_rank_idx      ON matopiba_municipios (ano, rank_irr_matopiba);

-- ── RPC: get_resumo_matopiba ──────────────────────────────────────────────
-- KPIs agregados do MATOPIBA-PI por ano — alimenta cards da 5ª aba.
CREATE OR REPLACE FUNCTION get_resumo_matopiba()
RETURNS TABLE (
  ano                  SMALLINT,
  n_municipios         BIGINT,
  n_reincidentes       BIGINT,
  ha_total             NUMERIC,
  ha_irregular         NUMERIC,
  ha_autorizado_total  NUMERIC,
  ha_regularizado      NUMERIC,
  ipi                  NUMERIC,
  delta_ipi_yoy        NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ano,
    COUNT(DISTINCT municipio)                                          AS n_municipios,
    COUNT(DISTINCT municipio) FILTER (WHERE reincidente = TRUE)        AS n_reincidentes,
    ROUND(SUM(ha_total)::NUMERIC, 2)                                   AS ha_total,
    ROUND(SUM(ha_irregular)::NUMERIC, 2)                               AS ha_irregular,
    ROUND(SUM(ha_autorizado_total)::NUMERIC, 2)                        AS ha_autorizado_total,
    ROUND(SUM(ha_regularizado)::NUMERIC, 2)                            AS ha_regularizado,
    ROUND(
      SUM(ha_irregular) / NULLIF(SUM(ha_total), 0) * 100, 1
    )                                                                   AS ipi,
    -- Delta IPI em relação ao ano anterior (média ponderada por ha_total)
    ROUND(
      SUM(delta_ipi_yoy * ha_total) / NULLIF(SUM(ha_total) FILTER (WHERE delta_ipi_yoy IS NOT NULL), 0),
      1
    )                                                                   AS delta_ipi_yoy
  FROM matopiba_municipios
  GROUP BY ano
  ORDER BY ano;
$$;

-- ── RPC: get_matopiba_municipios ──────────────────────────────────────────
-- Ranking de municípios MATOPIBA com todos os campos da view.
CREATE OR REPLACE FUNCTION get_matopiba_municipios(
  p_ano SMALLINT DEFAULT NULL
)
RETURNS TABLE (
  municipio             TEXT,
  ano                   SMALLINT,
  bioma_predominante    TEXT,
  ha_irregular          NUMERIC,
  ha_autorizado_total   NUMERIC,
  ha_total              NUMERIC,
  pct_irregular         NUMERIC,
  num_alertas           INTEGER,
  reincidente           BOOLEAN,
  vpressao_dominante_ptbr TEXT,
  rank_irr_matopiba     BIGINT,
  pct_do_matopiba_irr   NUMERIC,
  delta_ipi_yoy         NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    municipio,
    ano,
    bioma_predominante,
    ha_irregular,
    ha_autorizado_total,
    ha_total,
    pct_irregular,
    num_alertas,
    reincidente,
    vpressao_dominante_ptbr,
    rank_irr_matopiba,
    pct_do_matopiba_irr,
    delta_ipi_yoy
  FROM matopiba_municipios
  WHERE (p_ano IS NULL OR ano = p_ano)
  ORDER BY ano, rank_irr_matopiba;
$$;

-- ── RLS para a Materialized View ──────────────────────────────────────────
-- Materialized Views não suportam RLS diretamente no PostgreSQL.
-- Acesso controlado via GRANT (leitura pública, escrita apenas service_role).
REVOKE ALL ON matopiba_municipios FROM PUBLIC;
GRANT SELECT ON matopiba_municipios TO anon, authenticated;

-- ── Comentários ───────────────────────────────────────────────────────────
COMMENT ON MATERIALIZED VIEW matopiba_municipios IS
  'Municípios MATOPIBA-PI com métricas regionais (rank, pct, delta IPI). '
  'Atualizar com: REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios';

-- ── Como atualizar após nova execução do pipeline ─────────────────────────
-- Adicionar ao final do _upload_supabase.py:
--   sb.rpc('refresh_matopiba', {}).execute()
--
-- E criar a função de refresh:
CREATE OR REPLACE FUNCTION refresh_matopiba()
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios;
$$;

COMMENT ON FUNCTION refresh_matopiba IS
  'Atualiza a Materialized View matopiba_municipios após execução do pipeline. '
  'Chamar via supabase.rpc("refresh_matopiba") no _upload_supabase.py.';
