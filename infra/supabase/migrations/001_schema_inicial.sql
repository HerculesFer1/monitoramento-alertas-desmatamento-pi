-- ============================================================
-- NT-CGEO-001/2026 — Monitoramento Desmatamento PI
-- Migration 001: Schema inicial
-- Executar no SQL Editor do Supabase
-- ============================================================

-- Extensão PostGIS (habilitar também pelo painel: Database > Extensions)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- TABELA: alertas_classificados
-- Fragmentos geoespaciais do pipeline v2 (22 campos + geometry)
-- ============================================================
CREATE TABLE IF NOT EXISTS alertas_classificados (
  id_fragmento              TEXT PRIMARY KEY,
  codealerta                INTEGER,
  classificacao             TEXT NOT NULL
                            CHECK (classificacao IN (
                              'IRREGULAR','AUTORIZADO',
                              'AUTORIZADO_PARCIALMENTE','REGULARIZADO'
                            )),
  pct_cobertura             NUMERIC(6,2) CHECK (pct_cobertura BETWEEN 0 AND 100),
  fonte_classificacao       TEXT,
  instrumento_ref           TEXT,
  data_validade_instrumento DATE,
  ano                       SMALLINT NOT NULL CHECK (ano BETWEEN 2022 AND 2099),
  bioma                     TEXT,
  municipio                 TEXT,
  area_ha                   NUMERIC(12,4),
  area_original_ha          NUMERIC(12,4),
  vpressao                  TEXT,
  vpressao_ptbr             TEXT,
  fonte_list                TEXT[],
  datadetec                 DATE,
  dias_ate_publicacao       INTEGER,
  matopiba                  BOOLEAN DEFAULT FALSE,
  reincidente               BOOLEAN DEFAULT FALSE,
  ano_prodes_ref            SMALLINT,
  concordancia_prodes_pct   NUMERIC(6,2) CHECK (concordancia_prodes_pct BETWEEN 0 AND 100),
  flag_validacao_externa    TEXT,
  geom                      GEOMETRY(GEOMETRY, 4326),
  inserido_em               TIMESTAMPTZ DEFAULT NOW()
);

-- Índices espaciais e analíticos
CREATE INDEX IF NOT EXISTS alertas_geom_idx ON alertas_classificados USING GIST(geom);
CREATE INDEX IF NOT EXISTS alertas_ano_idx  ON alertas_classificados (ano);
CREATE INDEX IF NOT EXISTS alertas_mun_idx  ON alertas_classificados (municipio);
CREATE INDEX IF NOT EXISTS alertas_cls_idx  ON alertas_classificados (classificacao);
CREATE INDEX IF NOT EXISTS alertas_bio_idx  ON alertas_classificados (bioma);
CREATE INDEX IF NOT EXISTS alertas_mat_idx  ON alertas_classificados (matopiba) WHERE matopiba = TRUE;

-- ============================================================
-- TABELA: agregado_municipios
-- Agregado por município × ano (sem geometry)
-- ============================================================
CREATE TABLE IF NOT EXISTS agregado_municipios (
  id                          SERIAL PRIMARY KEY,
  municipio                   TEXT NOT NULL,
  ano                         SMALLINT NOT NULL,
  bioma_predominante          TEXT,
  matopiba                    BOOLEAN DEFAULT FALSE,
  serie_b                     BOOLEAN DEFAULT FALSE,
  ha_irregular                NUMERIC(12,4),
  ha_autorizado               NUMERIC(12,4),
  ha_autorizado_parcialmente  NUMERIC(12,4),
  ha_autorizado_total         NUMERIC(12,4),
  ha_regularizado             NUMERIC(12,4),
  ha_total                    NUMERIC(12,4),
  pct_irregular               NUMERIC(6,2),
  pct_autorizado              NUMERIC(6,2),
  pct_autorizado_parcialmente NUMERIC(6,2),
  pct_autorizado_total        NUMERIC(6,2),
  pct_regularizado            NUMERIC(6,2),
  num_alertas                 INTEGER,
  vpressao_dominante          TEXT,
  vpressao_dominante_ptbr     TEXT,
  reincidente                 BOOLEAN DEFAULT FALSE,
  anos_com_alerta_irregular   SMALLINT[],
  defasagem_media_dias        NUMERIC(8,2),
  inserido_em                 TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (municipio, ano)
);

CREATE INDEX IF NOT EXISTS agr_mun_idx  ON agregado_municipios (municipio);
CREATE INDEX IF NOT EXISTS agr_ano_idx  ON agregado_municipios (ano);
CREATE INDEX IF NOT EXISTS agr_mat_idx  ON agregado_municipios (matopiba) WHERE matopiba = TRUE;

-- ============================================================
-- TABELA: execucoes_pipeline
-- Auditoria de cada execução do pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS execucoes_pipeline (
  id            SERIAL PRIMARY KEY,
  executado_em  TIMESTAMPTZ DEFAULT NOW(),
  versao        TEXT DEFAULT 'v2',
  testes_ok     INTEGER,
  testes_total  INTEGER,
  n_alertas     INTEGER,
  n_municipios  INTEGER,
  ha_irregular  NUMERIC(12,2),
  ha_total      NUMERIC(12,2),
  log_resumo    TEXT
);

-- ============================================================
-- RPC: get_alertas_geojson
-- Retorna FeatureCollection paginada com filtros opcionais.
-- Uso no frontend: supabase.rpc('get_alertas_geojson', { p_ano: 2024 })
-- ============================================================
CREATE OR REPLACE FUNCTION get_alertas_geojson(
  p_ano            SMALLINT DEFAULT NULL,
  p_classificacao  TEXT     DEFAULT NULL,
  p_municipio      TEXT     DEFAULT NULL,
  p_bioma          TEXT     DEFAULT NULL,
  p_matopiba       BOOLEAN  DEFAULT NULL,
  p_limit          INT      DEFAULT 2000,
  p_offset         INT      DEFAULT 0
)
RETURNS JSON
LANGUAGE SQL STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(f), '[]'::json)
  )
  FROM (
    SELECT json_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'id_fragmento',           id_fragmento,
        'classificacao',          classificacao,
        'area_ha',                area_ha,
        'municipio',              municipio,
        'bioma',                  bioma,
        'ano',                    ano,
        'matopiba',               matopiba,
        'reincidente',            reincidente,
        'vpressao_ptbr',          vpressao_ptbr,
        'pct_cobertura',          pct_cobertura,
        'flag_validacao_externa', flag_validacao_externa,
        'concordancia_prodes_pct',concordancia_prodes_pct,
        'datadetec',              datadetec
      )
    ) AS f
    FROM alertas_classificados
    WHERE (p_ano IS NULL            OR ano            = p_ano)
      AND (p_classificacao IS NULL  OR classificacao  = p_classificacao)
      AND (p_municipio IS NULL      OR municipio      ILIKE p_municipio)
      AND (p_bioma IS NULL          OR bioma          = p_bioma)
      AND (p_matopiba IS NULL       OR matopiba       = p_matopiba)
    ORDER BY area_ha DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) sub;
$$;

-- ============================================================
-- RPC: get_resumo_anual
-- KPIs agregados por ano — alimenta gráficos do dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_resumo_anual()
RETURNS TABLE (
  ano                 SMALLINT,
  n_alertas           BIGINT,
  ha_total            NUMERIC,
  ha_irregular        NUMERIC,
  ha_autorizado_total NUMERIC,
  ha_regularizado     NUMERIC,
  ipi                 NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ano,
    COUNT(DISTINCT codealerta)                                    AS n_alertas,
    ROUND(SUM(area_ha)::NUMERIC, 2)                               AS ha_total,
    ROUND(SUM(CASE WHEN classificacao = 'IRREGULAR'
                   THEN area_ha ELSE 0 END)::NUMERIC, 2)          AS ha_irregular,
    ROUND(SUM(CASE WHEN classificacao IN ('AUTORIZADO','AUTORIZADO_PARCIALMENTE')
                   THEN area_ha ELSE 0 END)::NUMERIC, 2)          AS ha_autorizado_total,
    ROUND(SUM(CASE WHEN classificacao = 'REGULARIZADO'
                   THEN area_ha ELSE 0 END)::NUMERIC, 2)          AS ha_regularizado,
    ROUND(
      SUM(CASE WHEN classificacao = 'IRREGULAR' THEN area_ha ELSE 0 END)
      / NULLIF(SUM(area_ha), 0) * 100, 1
    )                                                              AS ipi
  FROM alertas_classificados
  GROUP BY ano
  ORDER BY ano;
$$;

-- ============================================================
-- RPC: get_resumo_prodes
-- Concordância PRODES por ciclo — slide Validação PRODES
-- ============================================================
CREATE OR REPLACE FUNCTION get_resumo_prodes()
RETURNS TABLE (
  ano_prodes_ref       SMALLINT,
  n_total              BIGINT,
  n_concordantes       BIGINT,
  n_discordantes       BIGINT,
  pct_concordancia     NUMERIC,
  media_cobertura_pct  NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ano_prodes_ref,
    COUNT(*)                                                      AS n_total,
    COUNT(*) FILTER (WHERE flag_validacao_externa = 'CONCORDANTE') AS n_concordantes,
    COUNT(*) FILTER (WHERE flag_validacao_externa = 'DISCORDANTE') AS n_discordantes,
    ROUND(
      COUNT(*) FILTER (WHERE flag_validacao_externa = 'CONCORDANTE')::NUMERIC
      / NULLIF(COUNT(*) FILTER (
          WHERE flag_validacao_externa IN ('CONCORDANTE','DISCORDANTE')
        ), 0) * 100, 1
    )                                                              AS pct_concordancia,
    ROUND(AVG(concordancia_prodes_pct) FILTER (
      WHERE flag_validacao_externa = 'CONCORDANTE'
    )::NUMERIC, 1)                                                 AS media_cobertura_pct
  FROM alertas_classificados
  WHERE bioma = 'Cerrado'
    AND ano_prodes_ref IS NOT NULL
  GROUP BY ano_prodes_ref
  ORDER BY ano_prodes_ref;
$$;

-- ============================================================
-- Row Level Security (RLS) — leitura pública, escrita só via service_role
-- ============================================================
ALTER TABLE alertas_classificados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agregado_municipios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE execucoes_pipeline     ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon key pode SELECT)
CREATE POLICY "leitura_publica_alertas"
  ON alertas_classificados FOR SELECT USING (true);

CREATE POLICY "leitura_publica_agregado"
  ON agregado_municipios FOR SELECT USING (true);

CREATE POLICY "leitura_publica_execucoes"
  ON execucoes_pipeline FOR SELECT USING (true);

-- Comentário final
COMMENT ON TABLE alertas_classificados IS
  'Fragmentos classificados do pipeline desmatamento PI v2 — CGEO/SEMARH-PI';
COMMENT ON TABLE agregado_municipios IS
  'Agregado por município×ano — alimenta dashboard e relatórios';
COMMENT ON TABLE execucoes_pipeline IS
  'Registro de auditoria de cada execução do pipeline';
