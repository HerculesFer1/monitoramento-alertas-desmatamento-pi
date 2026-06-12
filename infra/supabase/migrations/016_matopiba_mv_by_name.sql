-- ============================================================
-- Migration 016: matopiba_municipios MV → filtro por nome
-- ============================================================
-- Problema: a materialized view criada na migration 002 filtra
--   WHERE agregado_municipios.matopiba = TRUE
-- O campo booleano é populado pelo pipeline a partir da lista vigente
-- no momento da carga. Quando a lista oficial muda (26 → 33 conforme
-- Portaria MAPA 244/2015), os 7 novos municípios ficam com
-- matopiba=FALSE até a próxima execução do pipeline.
--
-- Solução: recriar a MV filtrando por nome contra a função
-- matopiba_municipios_pi() (criada na migration 015), que tem a lista
-- oficial em SQL. Assim o recorte fica sempre sincronizado com a lista
-- canônica, sem depender de re-upload.
--
-- Idempotente: DROP/CREATE com CONCURRENTLY refresh ao final.
-- Pré-requisito: migrations 002 e 015 aplicadas.
-- ============================================================

-- Pré-checagem: 015 precisa existir.
DO $check$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'matopiba_municipios_pi'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION
          'Migration 015 não aplicada: função matopiba_municipios_pi() ausente. '
          'Aplique 015_matopiba_panorama.sql antes desta.';
    END IF;
END;
$check$;

-- DROP e recria — o CONCURRENTLY do REFRESH só funciona após a view
-- existir, mas a recriação inteira é mais segura que ALTER MATERIALIZED VIEW.
DROP MATERIALIZED VIEW IF EXISTS matopiba_municipios CASCADE;

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
  WHERE municipio = ANY(matopiba_municipios_pi())   -- ← mudança chave: por nome
),
com_rank AS (
  SELECT
    *,
    RANK() OVER (
      PARTITION BY ano ORDER BY ha_irregular DESC
    ) AS rank_irr_matopiba,
    ROUND(
      ha_irregular
      / NULLIF(SUM(ha_irregular) OVER (PARTITION BY ano), 0) * 100,
      1
    ) AS pct_do_matopiba_irr,
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
  ROUND((pct_irregular - ipi_ano_anterior)::NUMERIC, 1) AS delta_ipi_yoy
FROM com_rank
ORDER BY ano, rank_irr_matopiba;

-- Índices (recria, pois o DROP removeu junto)
CREATE UNIQUE INDEX matopiba_mun_pk ON matopiba_municipios (municipio, ano);
CREATE INDEX matopiba_ano_idx       ON matopiba_municipios (ano);
CREATE INDEX matopiba_rank_idx      ON matopiba_municipios (ano, rank_irr_matopiba);

-- GRANTs (DROP CASCADE remove privilégios)
REVOKE ALL ON matopiba_municipios FROM PUBLIC;
GRANT SELECT ON matopiba_municipios TO anon, authenticated;

-- Carrega dados imediatamente (CONCURRENTLY exigiria primeira carga seqüencial)
REFRESH MATERIALIZED VIEW matopiba_municipios;

COMMENT ON MATERIALIZED VIEW matopiba_municipios IS
  'Municípios MATOPIBA-PI com métricas regionais (rank, pct, delta IPI). '
  'Filtra por nome via matopiba_municipios_pi() — sincroniza com a lista '
  'oficial sem depender do campo booleano agregado_municipios.matopiba.';

-- ============================================================
-- Aviso: se a lista oficial em matopiba_municipios_pi() mudar,
-- basta rodar:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios;
-- (a função refresh_matopiba() criada na 002 continua válida)
-- ============================================================
