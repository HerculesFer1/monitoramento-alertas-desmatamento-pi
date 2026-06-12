-- ==============================================================
-- MATOPIBA bundle — 002 + 015 + 016 concatenadas, ordem correta
-- Cole TUDO no SQL Editor do Supabase e clique RUN.
-- Idempotente: CREATE OR REPLACE + DROP IF EXISTS em todos os blocos.
-- ==============================================================

-- ##############################################################
-- ## PARTE 1/3 — Migration 002 (matopiba_municipios MV inicial)
-- ##############################################################

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
SET search_path = public, pg_catalog  -- previne search_path injection em funções SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY matopiba_municipios;
$$;

COMMENT ON FUNCTION refresh_matopiba IS
  'Atualiza a Materialized View matopiba_municipios após execução do pipeline. '
  'Chamar via supabase.rpc("refresh_matopiba") no _upload_supabase.py.';

-- ##############################################################
-- ## PARTE 2/3 — Migration 015 (helper + RPCs _matopiba)
-- ##############################################################

-- ============================================================
-- Migration 015: Panorama MATOPIBA — recorte transversal
-- Programa Jurisdicional REDD+ Piauí
--
-- O módulo MATOPIBA deixa de ser um sub-recorte do MapBiomas e
-- passa a ser um panorama transversal: mesmas perguntas dos demais
-- módulos (Alertas, PRODES, Queimadas, Áreas Prioritárias), mas
-- com WHERE municipio ∈ {33 municípios da Portaria MAPA 244/2015,
-- anexa ao Decreto Federal 8.447/2015}.
--
-- Fornecidos aqui:
--   1. Helper SQL matopiba_municipios_pi() — lista oficial dos 33 munic.
--   2. Variantes _matopiba das RPCs Queimadas (qb_*)
--   3. Variantes _matopiba das RPCs Áreas Prioritárias (ap_*)
--
-- Alertas: já existem get_resumo_matopiba()/get_matopiba_municipios()
-- desde a migration 002.
--
-- PRODES: o front-end agrega no cliente a partir de get_prodes_*
-- (cada registro já vem com matopiba boolean). Não há RPC nova aqui
-- para manter o acoplamento baixo com a tabela prodes (cujo schema
-- vive na migração que existe apenas no Supabase remoto).
-- ============================================================

-- ============================================================
-- 1. Helper: matopiba_municipios_pi()
-- ------------------------------------------------------------
-- Fonte: Decreto Federal nº 8.447/2015 (26 municípios piauienses).
-- IMMUTABLE para que o planner reutilize o resultado em cada query.
-- ============================================================
CREATE OR REPLACE FUNCTION matopiba_municipios_pi()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT ARRAY[
        'Alvorada do Gurguéia',
        'Antônio Almeida',
        'Avelino Lopes',
        'Baixa Grande do Ribeiro',
        'Barreiras do Piauí',
        'Bertolínia',
        'Bom Jesus',
        'Colônia do Gurguéia',
        'Corrente',
        'Cristalândia do Piauí',
        'Cristino Castro',
        'Curimatá',
        'Currais',
        'Eliseu Martins',
        'Gilbués',
        'Júlio Borges',
        'Landri Sales',
        'Manoel Emídio',
        'Marcos Parente',
        'Monte Alegre do Piauí',
        'Morro Cabeça no Tempo',
        'Palmeira do Piauí',
        'Parnaguá',
        'Porto Alegre do Piauí',
        'Redenção do Gurguéia',
        'Riacho Frio',
        'Ribeiro Gonçalves',
        'Santa Filomena',
        'Santa Luz',
        'São Gonçalo do Gurguéia',
        'Sebastião Barros',
        'Sebastião Leal',
        'Uruçuí'
    ]::TEXT[];
$$;

COMMENT ON FUNCTION matopiba_municipios_pi IS
    'Lista oficial dos 33 municípios piauienses do MATOPIBA (Portaria MAPA 244/2015, anexa ao Decreto Federal 8.447/2015). '
    'Reaproveitada pelas variantes _matopiba das RPCs de cada módulo.';

-- ============================================================
-- 2. QUEIMADAS — variantes _matopiba
-- ------------------------------------------------------------
-- Mantêm o mesmo formato JSON das funções originais
-- (modules/queimadas_bdq/migrations/009_queimadas_bdq.sql)
-- para que o front-end troque apenas o nome da RPC.
-- ============================================================

-- ── 2.1 Visão Geral ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_qb_visao_geral_matopiba(p_ano INT DEFAULT 2025)
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
          AND municipio_nome = ANY(matopiba_municipios_pi())
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
                        / NULLIF((
                            SELECT SUM(area_queimada_ha)
                            FROM qb_cicatrizes_classes
                            WHERE ano = p_ano
                              AND municipio_nome = ANY(matopiba_municipios_pi())
                        ), 0)
                        * 100, 2
                    )
                ) ORDER BY classe_prioridade
            ) AS dados
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
          AND municipio_nome = ANY(matopiba_municipios_pi())
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
          AND municipio_nome = ANY(matopiba_municipios_pi())
        GROUP BY mes
    )
    SELECT json_build_object(
        'kpis', json_build_object(
            'area_queimada_total_ha', ROUND((SELECT area_total_ha FROM totais)::NUMERIC, 4),
            'n_cicatrizes_total',     (SELECT n_total            FROM totais),
            'municipios_afetados',    (SELECT municipios_afetados FROM totais),
            'area_prioritaria_ha',    ROUND((SELECT area_prioritaria_ha FROM totais)::NUMERIC, 4),
            'pct_em_prioritarias',    (SELECT pct_prioritaria    FROM totais),
            'ano',                    p_ano,
            'recorte',                'MATOPIBA-PI',
            'n_municipios_recorte',   array_length(matopiba_municipios_pi(), 1)
        ),
        'por_classe', (SELECT dados FROM por_classe),
        'por_mes',    (SELECT dados FROM por_mes)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_qb_visao_geral_matopiba IS
    'Espelha get_qb_visao_geral com WHERE municipio_nome ∈ MATOPIBA-PI. '
    'Mesmo schema JSON; campo extra "recorte" identifica o filtro.';

-- ── 2.2 Série mensal (temporal) ──────────────────────────────
CREATE OR REPLACE FUNCTION get_qb_temporal_matopiba(p_ano INT DEFAULT 2025)
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
            SUM(CASE WHEN classe_prioridade = 1 THEN area_queimada_ha ELSE 0 END) AS area_classe_1,
            SUM(CASE WHEN classe_prioridade = 2 THEN area_queimada_ha ELSE 0 END) AS area_classe_2,
            SUM(CASE WHEN classe_prioridade = 3 THEN area_queimada_ha ELSE 0 END) AS area_classe_3,
            SUM(CASE WHEN classe_prioridade = 4 THEN area_queimada_ha ELSE 0 END) AS area_classe_4,
            SUM(CASE WHEN classe_prioridade = 5 THEN area_queimada_ha ELSE 0 END) AS area_classe_5
        FROM qb_cicatrizes_classes
        WHERE ano = p_ano
          AND municipio_nome = ANY(matopiba_municipios_pi())
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

-- ── 2.3 Ranking dos 26 municípios ────────────────────────────
CREATE OR REPLACE FUNCTION get_qb_ranking_matopiba(
    p_ano   INT DEFAULT 2025,
    p_limit INT DEFAULT 26
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
          AND municipio_nome = ANY(matopiba_municipios_pi())
        ORDER BY area_queimada_total_ha DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- 3. ÁREAS PRIORITÁRIAS — variantes _matopiba
-- ------------------------------------------------------------
-- Espelham get_ap_visao_geral / get_ap_ranking (v3) com filtro
-- de municípios MATOPIBA-PI. Mantêm o mesmo formato JSON.
--
-- ROBUSTEZ: as colunas v3 (ha_deter_recente, biomassa_total_tc,
-- biomassa_floresta_tc, agb_medio_tc_ha, prioridade_label) são
-- adicionadas pela migration 010. Se ela ainda não foi aplicada,
-- detectamos a ausência e geramos as funções com fallback (0 / NULL),
-- evitando ERROR 42703.
-- ============================================================

DO $migration$
DECLARE
    -- Colunas em ap_classes_municipio (v3)
    has_deter_classes      boolean;
    has_biomassa_classes   boolean;
    has_label_classes      boolean;
    -- Colunas em ap_municipios_resumo (v3)
    has_deter_resumo       boolean;
    has_biomassa_resumo    boolean;
    has_agb_resumo         boolean;

    -- Snippets gerados condicionalmente
    expr_sum_deter_classes  text;
    expr_filter_deter       text;
    expr_bool_deter         text;
    expr_sum_biomassa_clas  text;
    expr_max_label          text;
    expr_sum_deter_porclas  text;
    expr_ha_deter_resumo    text;
    expr_biomassa_resumo    text;
    expr_agb_resumo         text;
BEGIN
    -- ── Detecção de colunas v3 ────────────────────────────────────
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_classes_municipio'
                     AND column_name  = 'ha_deter_recente')
      INTO has_deter_classes;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_classes_municipio'
                     AND column_name  = 'biomassa_total_tc')
      INTO has_biomassa_classes;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_classes_municipio'
                     AND column_name  = 'prioridade_label')
      INTO has_label_classes;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_municipios_resumo'
                     AND column_name  = 'ha_deter_recente')
      INTO has_deter_resumo;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_municipios_resumo'
                     AND column_name  = 'biomassa_floresta_tc')
      INTO has_biomassa_resumo;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name   = 'ap_municipios_resumo'
                     AND column_name  = 'agb_medio_tc_ha')
      INTO has_agb_resumo;

    -- ── Snippets com fallback ─────────────────────────────────────
    expr_sum_deter_classes := CASE WHEN has_deter_classes
        THEN 'COALESCE(SUM(ha_deter_recente), 0)' ELSE '0' END;
    expr_filter_deter      := CASE WHEN has_deter_classes
        THEN 'FILTER (WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0)' ELSE '' END;
    expr_bool_deter        := CASE WHEN has_deter_classes
        THEN 'BOOL_OR(ha_deter_recente IS NOT NULL)' ELSE 'FALSE' END;
    expr_sum_biomassa_clas := CASE WHEN has_biomassa_classes
        THEN 'ROUND(SUM(biomassa_total_tc)::NUMERIC, 0)' ELSE 'NULL::NUMERIC' END;
    expr_max_label         := CASE WHEN has_label_classes
        THEN 'MAX(prioridade_label)' ELSE 'NULL::TEXT' END;
    expr_sum_deter_porclas := CASE WHEN has_deter_classes
        THEN 'ROUND(COALESCE(SUM(ha_deter_recente), 0)::NUMERIC, 2)' ELSE '0::NUMERIC' END;

    expr_ha_deter_resumo   := CASE WHEN has_deter_resumo
        THEN 'COALESCE(ha_deter_recente, 0)' ELSE '0' END;
    expr_biomassa_resumo   := CASE WHEN has_biomassa_resumo
        THEN 'COALESCE(biomassa_floresta_tc, 0)' ELSE '0' END;
    expr_agb_resumo        := CASE WHEN has_agb_resumo
        THEN 'COALESCE(agb_medio_tc_ha, 0)' ELSE '0' END;

    -- ── 3.1 Visão Geral ───────────────────────────────────────────
    EXECUTE format($f$
        CREATE OR REPLACE FUNCTION get_ap_visao_geral_matopiba(p_ano SMALLINT DEFAULT 2025)
        RETURNS JSON
        LANGUAGE sql
        STABLE
        AS $body$
            SELECT json_build_object(
                'periodo_cobertura', get_ap_periodo_cobertura(p_ano),

                'kpis', json_build_object(
                    'prodes', (
                        SELECT json_build_object(
                            'area_floresta_total_ha',   ROUND(SUM(area_floresta_ha)::NUMERIC, 2),
                            'area_desmat_total_ha',     ROUND(SUM(area_desmat_ha)::NUMERIC,   2),
                            'pct_desmat_recorte',       ROUND(
                                (SUM(area_desmat_ha) / NULLIF(SUM(area_total_ha), 0) * 100)::NUMERIC, 2
                            ),
                            'total_municipios',         COUNT(DISTINCT municipio_cod),
                            'biomassa_total_tc',        %1$s,
                            'n_municipios_classe_max',  (
                                SELECT COUNT(*)
                                FROM ap_municipios_resumo r
                                WHERE r.ano_prodes = p_ano
                                  AND r.classe_max_prioridade = 5
                                  AND r.municipio_nome = ANY(matopiba_municipios_pi())
                            )
                        )
                        FROM ap_classes_municipio c
                        WHERE c.ano_prodes = p_ano
                          AND EXISTS (
                              SELECT 1 FROM ap_municipios_resumo r
                              WHERE r.municipio_cod = c.municipio_cod
                                AND r.municipio_nome = ANY(matopiba_municipios_pi())
                          )
                    ),
                    'deter', (
                        SELECT json_build_object(
                            'area_alertas_ha',         ROUND(%2$s::NUMERIC, 2),
                            'n_municipios_com_alerta', COUNT(DISTINCT municipio_cod) %3$s,
                            'disponivel',              %4$s
                        )
                        FROM ap_classes_municipio c
                        WHERE c.ano_prodes = p_ano
                          AND EXISTS (
                              SELECT 1 FROM ap_municipios_resumo r
                              WHERE r.municipio_cod = c.municipio_cod
                                AND r.municipio_nome = ANY(matopiba_municipios_pi())
                          )
                    ),
                    'recorte', json_build_object(
                        'nome',         'MATOPIBA-PI',
                        'base_legal',   'Decreto Federal 8.447/2015',
                        'n_municipios', array_length(matopiba_municipios_pi(), 1)
                    )
                ),

                'por_classe', (
                    SELECT json_agg(row_to_json(t) ORDER BY t.classe_prioridade)
                    FROM (
                        SELECT
                            classe_prioridade,
                            %5$s                                                          AS prioridade_label,
                            ROUND(SUM(area_floresta_ha)::NUMERIC,                  2)    AS area_floresta_ha,
                            ROUND(SUM(area_desmat_ha)::NUMERIC,                    2)    AS area_desmat_ha,
                            ROUND(SUM(area_total_ha)::NUMERIC,                     2)    AS area_total_ha,
                            ROUND(AVG(pct_floresta)::NUMERIC,                      2)    AS pct_floresta_media,
                            %6$s                                                          AS ha_deter_recente,
                            COUNT(DISTINCT municipio_cod)                                 AS n_municipios
                        FROM ap_classes_municipio c
                        WHERE c.ano_prodes = p_ano
                          AND EXISTS (
                              SELECT 1 FROM ap_municipios_resumo r
                              WHERE r.municipio_cod = c.municipio_cod
                                AND r.municipio_nome = ANY(matopiba_municipios_pi())
                          )
                        GROUP BY classe_prioridade
                    ) t
                )
            );
        $body$
    $f$, expr_sum_biomassa_clas, expr_sum_deter_classes, expr_filter_deter,
         expr_bool_deter, expr_max_label, expr_sum_deter_porclas);

    -- ── 3.2 Ranking ───────────────────────────────────────────────
    EXECUTE format($f$
        CREATE OR REPLACE FUNCTION get_ap_ranking_matopiba(
            p_limit   INTEGER  DEFAULT 26,
            p_orderby TEXT     DEFAULT 'area_desmat_ha',
            p_ano     SMALLINT DEFAULT 2025
        )
        RETURNS JSON
        LANGUAGE plpgsql
        STABLE
        AS $body$
        DECLARE
            v_result JSON;
        BEGIN
            IF p_orderby NOT IN (
                'area_floresta_ha', 'area_desmat_ha', 'ha_deter_recente',
                'pct_floresta_estado', 'classe_max_prioridade',
                'biomassa_floresta_tc', 'agb_medio_tc_ha', 'municipio_nome'
            ) THEN
                p_orderby := 'area_desmat_ha';
            END IF;

            SELECT json_agg(row_to_json(t))
            INTO v_result
            FROM (
                SELECT
                    municipio_cod,
                    municipio_nome,
                    classe_max_prioridade,
                    ROUND(area_total_ha::NUMERIC,                         2) AS area_total_ha,
                    ROUND(area_floresta_ha::NUMERIC,                      2) AS area_floresta_ha,
                    ROUND(area_desmat_ha::NUMERIC,                        2) AS area_desmat_ha,
                    ROUND(%1$s::NUMERIC,                                  2) AS ha_deter_recente,
                    ROUND(pct_floresta_estado::NUMERIC,                   2) AS pct_floresta_estado,
                    ROUND(%2$s::NUMERIC,                                  0) AS biomassa_floresta_tc,
                    ROUND(%3$s::NUMERIC,                                  2) AS agb_medio_tc_ha
                FROM ap_municipios_resumo
                WHERE ano_prodes = p_ano
                  AND municipio_nome = ANY(matopiba_municipios_pi())
                ORDER BY
                    CASE WHEN p_orderby = 'municipio_nome'        THEN municipio_nome::TEXT           END ASC,
                    CASE WHEN p_orderby = 'area_floresta_ha'      THEN area_floresta_ha               END DESC,
                    CASE WHEN p_orderby = 'area_desmat_ha'        THEN area_desmat_ha                 END DESC,
                    CASE WHEN p_orderby = 'ha_deter_recente'      THEN %1$s                           END DESC,
                    CASE WHEN p_orderby = 'pct_floresta_estado'   THEN pct_floresta_estado            END DESC,
                    CASE WHEN p_orderby = 'classe_max_prioridade' THEN classe_max_prioridade::NUMERIC END ASC,
                    CASE WHEN p_orderby = 'biomassa_floresta_tc'  THEN %2$s                           END DESC,
                    CASE WHEN p_orderby = 'agb_medio_tc_ha'       THEN %3$s                           END DESC
                LIMIT p_limit
            ) t;

            RETURN COALESCE(v_result, '[]'::JSON);
        END;
        $body$
    $f$, expr_ha_deter_resumo, expr_biomassa_resumo, expr_agb_resumo);

    -- ── Aviso operacional ─────────────────────────────────────────
    IF NOT has_deter_classes OR NOT has_biomassa_classes THEN
        RAISE NOTICE
          'Migration 015: colunas v3 ausentes em ap_classes_municipio. '
          'As RPCs get_ap_*_matopiba foram criadas com fallback (0/NULL). '
          'Aplique a migration 010 para habilitar DETER e biomassa.';
    END IF;
END;
$migration$;

COMMENT ON FUNCTION get_ap_visao_geral_matopiba IS
    'Espelha get_ap_visao_geral (v3) com recorte MATOPIBA-PI (26 municípios). '
    'Mesmo shape JSON; "kpis.recorte" descreve o recorte. '
    'Gerada via DO block para sobreviver à ausência das colunas v3.';

-- ============================================================
-- 4. GRANTs — alinhados com as RPCs originais
-- ============================================================
GRANT EXECUTE ON FUNCTION matopiba_municipios_pi()                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_visao_geral_matopiba(INT)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_temporal_matopiba(INT)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_qb_ranking_matopiba(INT, INT)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_ap_visao_geral_matopiba(SMALLINT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_ap_ranking_matopiba(INTEGER, TEXT, SMALLINT)      TO anon, authenticated;

-- ##############################################################
-- ## PARTE 3/3 — Migration 016 (recria MV usando matopiba_municipios_pi())
-- ##############################################################

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

-- ==============================================================
-- Forçar reload do schema cache do PostgREST (efeito imediato no API)
-- ==============================================================
NOTIFY pgrst, 'reload schema';
