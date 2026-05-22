-- Migration 004 — Correção dupla da RPC get_resumo_prodes
-- Problema 1: contagem por fragmento (não por alerta único) → fix: DISTINCT ON (codealerta)
-- Problema 2: n_total incluía SEM_PRODES_NO_CICLO, inflando denominador → fix: filtro explícito
-- Resultado esperado: 5.918 validados | 4.198 concordantes | 70,9%
--
-- Aplicar via: Supabase Dashboard → SQL Editor → New Query → Run

CREATE OR REPLACE FUNCTION get_resumo_prodes()
RETURNS TABLE (
  ano_prodes_ref       SMALLINT,
  n_total              BIGINT,   -- apenas CONCORDANTE + DISCORDANTE (excl. SEM_PRODES)
  n_concordantes       BIGINT,
  n_discordantes       BIGINT,
  n_sem_prodes         BIGINT,   -- informativo (ciclo 2026 etc.)
  pct_concordancia     NUMERIC,
  media_cobertura_pct  NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  -- Passo 1: desduplicar por alerta (fragmentos do mesmo alerta teriam
  -- flag e concordância idênticos; o maior fragmento é o mais representativo)
  WITH alertas_unicos AS (
    SELECT DISTINCT ON (codealerta)
      codealerta,
      ano_prodes_ref,
      flag_validacao_externa,
      concordancia_prodes_pct
    FROM alertas_classificados
    WHERE bioma = 'Cerrado'
      AND ano_prodes_ref IS NOT NULL
    ORDER BY codealerta, area_ha DESC
  )
  SELECT
    ano_prodes_ref,
    -- n_total = apenas alertas com resultado concreto (CONCORDANTE ou DISCORDANTE)
    COUNT(*) FILTER (
      WHERE flag_validacao_externa IN ('CONCORDANTE', 'DISCORDANTE')
    )                                                                 AS n_total,
    COUNT(*) FILTER (
      WHERE flag_validacao_externa = 'CONCORDANTE'
    )                                                                 AS n_concordantes,
    COUNT(*) FILTER (
      WHERE flag_validacao_externa = 'DISCORDANTE'
    )                                                                 AS n_discordantes,
    -- n_sem_prodes = alertas em ciclo sem PRODES disponível (ex.: ago-dez/2025 → ciclo 2026)
    COUNT(*) FILTER (
      WHERE flag_validacao_externa = 'SEM_PRODES_NO_CICLO'
    )                                                                 AS n_sem_prodes,
    ROUND(
      COUNT(*) FILTER (WHERE flag_validacao_externa = 'CONCORDANTE')::NUMERIC
      / NULLIF(
          COUNT(*) FILTER (
            WHERE flag_validacao_externa IN ('CONCORDANTE', 'DISCORDANTE')
          ), 0
        ) * 100, 1
    )                                                                 AS pct_concordancia,
    ROUND(
      AVG(concordancia_prodes_pct) FILTER (
        WHERE flag_validacao_externa = 'CONCORDANTE'
      )::NUMERIC, 1
    )                                                                 AS media_cobertura_pct
  FROM alertas_unicos
  GROUP BY ano_prodes_ref
  ORDER BY ano_prodes_ref;
$$;

-- Confirmar resultado esperado:
-- SELECT SUM(n_total), SUM(n_concordantes), SUM(n_sem_prodes)
-- FROM get_resumo_prodes();
-- Deve retornar: 5918 | 4198 | 747
