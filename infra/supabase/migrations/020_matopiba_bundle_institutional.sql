-- ============================================================
-- Migration 020: MATOPIBA bundle — institucional (ubcejvbnpuyouwpphryc)
-- ============================================================
-- Consolida 002 + 015 + 016 num único arquivo aplicado em 2026-06-25
-- no projeto institucional (que pulou estas 3 migrations no histórico
-- supabase_migrations.schema_migrations).
--
-- Objetivo: criar matopiba_municipios MV + helper matopiba_municipios_pi()
-- + RPCs get_resumo_matopiba / get_matopiba_municipios, que faltavam e
-- causavam 404 (PostgREST → "relation matopiba_municipios does not exist")
-- na MatopibaView do módulo alertas_mapbiomas.
--
-- Idempotente: DROP IF EXISTS + CREATE OR REPLACE em todos os blocos.
-- ============================================================

CREATE INDEX IF NOT EXISTS alertas_ano_cls_idx
  ON alertas_classificados (ano, classificacao);

DROP MATERIALIZED VIEW IF EXISTS matopiba_municipios CASCADE;

-- ── Helper: lista oficial dos 33 municípios MATOPIBA-PI ─────────────────
-- Fonte: Portaria MAPA 244/2015, anexa ao Decreto Federal 8.447/2015.
-- IMMUTABLE para que o planner reutilize o resultado.
CREATE OR REPLACE FUNCTION matopiba_municipios_pi()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT ARRAY[
        'Alvorada do Gurguéia','Antônio Almeida','Avelino Lopes','Baixa Grande do Ribeiro',
        'Barreiras do Piauí','Bertolínia','Bom Jesus','Colônia do Gurguéia','Corrente',
        'Cristalândia do Piauí','Cristino Castro','Curimatá','Currais','Eliseu Martins',
        'Gilbués','Júlio Borges','Landri Sales','Manoel Emídio','Marcos Parente',
        'Monte Alegre do Piauí','Morro Cabeça no Tempo','Palmeira do Piauí','Parnaguá',
        'Porto Alegre do Piauí','Redenção do Gurguéia','Riacho Frio','Ribeiro Gonçalves',
        'Santa Filomena','Santa Luz','São Gonçalo do Gurguéia','Sebastião Barros',
        'Sebastião Leal','Uruçuí'
    ]::TEXT[];
$$;

COMMENT ON FUNCTION matopiba_municipios_pi IS
    'Lista oficial dos 33 municípios piauienses do MATOPIBA (Portaria MAPA 244/2015, '
    'anexa ao Decreto Federal 8.447/2015). Reaproveitada pelas variantes _matopiba.';

-- ── MV matopiba_municipios (versão 016: filtra por nome) ────────────────
CREATE MATERIALIZED VIEW matopiba_municipios AS
WITH base AS (
  SELECT
    municipio, ano, bioma_predominante, serie_b,
    ha_irregular, ha_autorizado, ha_autorizado_parcialmente, ha_autorizado_total,
    ha_regularizado, ha_total, pct_irregular, pct_autorizado_total,
    num_alertas, reincidente, vpressao_dominante_ptbr, defasagem_media_dias
  FROM agregado_municipios
  WHERE municipio = ANY(matopiba_municipios_pi())
),
com_rank AS (
  SELECT *,
    RANK() OVER (PARTITION BY ano ORDER BY ha_irregular DESC) AS rank_irr_matopiba,
    ROUND(ha_irregular / NULLIF(SUM(ha_irregular) OVER (PARTITION BY ano), 0) * 100, 1)
      AS pct_do_matopiba_irr,
    LAG(pct_irregular, 1) OVER (PARTITION BY municipio ORDER BY ano)
      AS ipi_ano_anterior
  FROM base
)
SELECT
  municipio, ano, bioma_predominante, serie_b,
  ha_irregular, ha_autorizado, ha_autorizado_parcialmente, ha_autorizado_total,
  ha_regularizado, ha_total, pct_irregular, pct_autorizado_total,
  num_alertas, reincidente, vpressao_dominante_ptbr, defasagem_media_dias,
  rank_irr_matopiba, pct_do_matopiba_irr,
  ROUND((pct_irregular - ipi_ano_anterior)::NUMERIC, 1) AS delta_ipi_yoy
FROM com_rank
ORDER BY ano, rank_irr_matopiba;

CREATE UNIQUE INDEX matopiba_mun_pk ON matopiba_municipios (municipio, ano);
CREATE INDEX        matopiba_ano_idx  ON matopiba_municipios (ano);
CREATE INDEX        matopiba_rank_idx ON matopiba_municipios (ano, rank_irr_matopiba);

REVOKE ALL ON matopiba_municipios FROM PUBLIC;
GRANT SELECT ON matopiba_municipios TO anon, authenticated;

COMMENT ON MATERIALIZED VIEW matopiba_municipios IS
  'Municípios MATOPIBA-PI (filtro por nome via matopiba_municipios_pi). '
  'Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios;';

-- ── RPC: get_resumo_matopiba — KPIs agregados por ano ───────────────────
CREATE OR REPLACE FUNCTION get_resumo_matopiba()
RETURNS TABLE (
  ano SMALLINT, n_municipios BIGINT, n_reincidentes BIGINT,
  ha_total NUMERIC, ha_irregular NUMERIC, ha_autorizado_total NUMERIC,
  ha_regularizado NUMERIC, ipi NUMERIC, delta_ipi_yoy NUMERIC
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
    ROUND(SUM(ha_irregular) / NULLIF(SUM(ha_total), 0) * 100, 1)       AS ipi,
    ROUND(SUM(delta_ipi_yoy * ha_total)
          / NULLIF(SUM(ha_total) FILTER (WHERE delta_ipi_yoy IS NOT NULL), 0), 1)
                                                                       AS delta_ipi_yoy
  FROM matopiba_municipios
  GROUP BY ano
  ORDER BY ano;
$$;

-- ── RPC: get_matopiba_municipios — ranking municipal ────────────────────
CREATE OR REPLACE FUNCTION get_matopiba_municipios(p_ano SMALLINT DEFAULT NULL)
RETURNS TABLE (
  municipio TEXT, ano SMALLINT, bioma_predominante TEXT,
  ha_irregular NUMERIC, ha_autorizado_total NUMERIC, ha_total NUMERIC,
  pct_irregular NUMERIC, num_alertas INTEGER, reincidente BOOLEAN,
  vpressao_dominante_ptbr TEXT, rank_irr_matopiba BIGINT,
  pct_do_matopiba_irr NUMERIC, delta_ipi_yoy NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    municipio, ano, bioma_predominante,
    ha_irregular, ha_autorizado_total, ha_total,
    pct_irregular, num_alertas, reincidente, vpressao_dominante_ptbr,
    rank_irr_matopiba, pct_do_matopiba_irr, delta_ipi_yoy
  FROM matopiba_municipios
  WHERE (p_ano IS NULL OR ano = p_ano)
  ORDER BY ano, rank_irr_matopiba;
$$;

-- ── Refresh helper — chamar após cada execução do pipeline ──────────────
CREATE OR REPLACE FUNCTION refresh_matopiba()
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios;
$$;

-- ── GRANTs ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION matopiba_municipios_pi()              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_resumo_matopiba()                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_matopiba_municipios(SMALLINT)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_matopiba()                    TO authenticated;

REFRESH MATERIALIZED VIEW matopiba_municipios;

NOTIFY pgrst, 'reload schema';
