-- Migration 010 — areas_prioritarias v3 upgrade
-- Upgrade from v2 (raster pixel-counting, <=16 classes) to v3 (vector overlay, 5 classes).
-- Applied: 2026-05-29
-- Safe to re-run: uses IF EXISTS / IF NOT EXISTS guards throughout.
--
-- Changes applied:
--   1. TRUNCATE old raster data (incompatible with 5-class constraint)
--   2. Fix constraint chk_classe_prioridade: <= 16 → BETWEEN 1 AND 5
--   3. Fix constraint chk_resumo_classe: <= 16 → BETWEEN 1 AND 5
--   4. ADD COLUMN prioridade_label to ap_classes_municipio
--   5. ADD COLUMN agb_medio_tc_ha, biomassa_total_tc to ap_classes_municipio (if missing)
--   6. ADD COLUMN agb_medio_tc_ha, biomassa_floresta_tc to ap_municipios_resumo (if missing)
--   7. ADD sanity constraints for new AGB columns (guarded via DO block)
--   8. CREATE INDEX for biomassa and deter (IF NOT EXISTS)
--   9. CREATE OR REPLACE all 5 RPC functions (v3)
--  10. Update COMMENTs

-- ============================================================
-- 1. TRUNCATE old v2 raster data
-- ============================================================
TRUNCATE ap_classes_municipio, ap_municipios_resumo, ap_execucoes CASCADE;

-- ============================================================
-- 2. Fix ap_classes_municipio: constraint 1..5
-- ============================================================
ALTER TABLE ap_classes_municipio
    DROP CONSTRAINT IF EXISTS chk_classe_prioridade;

ALTER TABLE ap_classes_municipio
    ADD CONSTRAINT chk_classe_prioridade
        CHECK (classe_prioridade BETWEEN 1 AND 5);

-- ============================================================
-- 3. Fix ap_municipios_resumo: constraint 1..5
-- ============================================================
ALTER TABLE ap_municipios_resumo
    DROP CONSTRAINT IF EXISTS chk_resumo_classe;

ALTER TABLE ap_municipios_resumo
    ADD CONSTRAINT chk_resumo_classe
        CHECK (classe_max_prioridade IS NULL OR classe_max_prioridade BETWEEN 1 AND 5);

-- ============================================================
-- 4-6. ADD new columns (IF NOT EXISTS — safe to re-run)
-- ============================================================

-- ap_classes_municipio
ALTER TABLE ap_classes_municipio
    ADD COLUMN IF NOT EXISTS prioridade_label  TEXT,
    ADD COLUMN IF NOT EXISTS agb_medio_tc_ha   NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS biomassa_total_tc  NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS ha_deter_recente   NUMERIC(12,4);

-- ap_municipios_resumo
ALTER TABLE ap_municipios_resumo
    ADD COLUMN IF NOT EXISTS agb_medio_tc_ha      NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS biomassa_floresta_tc  NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS ha_deter_recente      NUMERIC(12,4);

-- ============================================================
-- 7. Sanity constraints for new columns (guarded via DO block)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ap_classes_municipio'
          AND constraint_name = 'chk_agb_sanidade'
    ) THEN
        ALTER TABLE ap_classes_municipio
            ADD CONSTRAINT chk_agb_sanidade
                CHECK (agb_medio_tc_ha IS NULL OR agb_medio_tc_ha BETWEEN 0 AND 1000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ap_classes_municipio'
          AND constraint_name = 'chk_ha_deter_positivo'
    ) THEN
        ALTER TABLE ap_classes_municipio
            ADD CONSTRAINT chk_ha_deter_positivo
                CHECK (ha_deter_recente IS NULL OR ha_deter_recente >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ap_municipios_resumo'
          AND constraint_name = 'chk_resumo_agb'
    ) THEN
        ALTER TABLE ap_municipios_resumo
            ADD CONSTRAINT chk_resumo_agb
                CHECK (agb_medio_tc_ha IS NULL OR agb_medio_tc_ha BETWEEN 0 AND 1000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ap_municipios_resumo'
          AND constraint_name = 'chk_resumo_ha_deter'
    ) THEN
        ALTER TABLE ap_municipios_resumo
            ADD CONSTRAINT chk_resumo_ha_deter
                CHECK (ha_deter_recente IS NULL OR ha_deter_recente >= 0);
    END IF;
END $$;

-- ============================================================
-- 8. Índices (IF NOT EXISTS — idempotente)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ap_resumo_biomassa
    ON ap_municipios_resumo (biomassa_floresta_tc DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ap_resumo_deter_ativo
    ON ap_municipios_resumo (ano_prodes, ha_deter_recente DESC NULLS LAST)
    WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0;

CREATE INDEX IF NOT EXISTS idx_ap_classes_deter_ativo
    ON ap_classes_municipio (ano_prodes, municipio_cod)
    WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0;

-- ============================================================
-- 9. RPC v3: get_ap_periodo_cobertura
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_periodo_cobertura(p_ano SMALLINT DEFAULT 2025)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
    SELECT row_to_json(t)
    FROM (
        SELECT
            ano_prodes,
            image_date_min,
            image_date_max,
            data_referencia_prodes,
            deter_gap_inicio,
            deter_gap_fim,
            fonte_complementar
        FROM ap_execucoes
        WHERE ano_prodes = p_ano
          AND status     = 'sucesso'
        ORDER BY executado_em DESC
        LIMIT 1
    ) t;
$$;

-- ============================================================
-- RPC v3: get_ap_visao_geral — KPIs estado + distribuição por classe
-- Inclui n_municipios_classe_max (classe 5 = Muito Alto).
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_visao_geral(p_ano SMALLINT DEFAULT 2025)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
    SELECT json_build_object(

        'periodo_cobertura', get_ap_periodo_cobertura(p_ano),

        'kpis', json_build_object(
            'prodes', (
                SELECT json_build_object(
                    'area_floresta_total_ha',   ROUND(SUM(area_floresta_ha)::NUMERIC, 2),
                    'area_desmat_total_ha',     ROUND(SUM(area_desmat_ha)::NUMERIC,   2),
                    'pct_desmat_estado',        ROUND(
                        (SUM(area_desmat_ha) / NULLIF(SUM(area_total_ha), 0) * 100)::NUMERIC, 2
                    ),
                    'total_municipios',         COUNT(DISTINCT municipio_cod),
                    'biomassa_total_tc',        ROUND(SUM(biomassa_total_tc)::NUMERIC, 0),
                    'n_municipios_classe_max',  (
                        SELECT COUNT(*)
                        FROM ap_municipios_resumo
                        WHERE ano_prodes = p_ano
                          AND classe_max_prioridade = 5
                    )
                )
                FROM ap_classes_municipio
                WHERE ano_prodes = p_ano
            ),
            'deter', (
                SELECT json_build_object(
                    'area_alertas_ha',         ROUND(COALESCE(SUM(ha_deter_recente), 0)::NUMERIC, 2),
                    'n_municipios_com_alerta', COUNT(DISTINCT municipio_cod)
                        FILTER (WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0),
                    'disponivel',              BOOL_OR(ha_deter_recente IS NOT NULL)
                )
                FROM ap_classes_municipio
                WHERE ano_prodes = p_ano
            )
        ),

        'por_classe', (
            SELECT json_agg(row_to_json(t) ORDER BY t.classe_prioridade)
            FROM (
                SELECT
                    classe_prioridade,
                    MAX(prioridade_label)                                            AS prioridade_label,
                    ROUND(SUM(area_floresta_ha)::NUMERIC,                     2)    AS area_floresta_ha,
                    ROUND(SUM(area_desmat_ha)::NUMERIC,                       2)    AS area_desmat_ha,
                    ROUND(SUM(area_total_ha)::NUMERIC,                        2)    AS area_total_ha,
                    ROUND(AVG(pct_floresta)::NUMERIC,                         2)    AS pct_floresta_media,
                    ROUND(COALESCE(SUM(ha_deter_recente), 0)::NUMERIC,        2)    AS ha_deter_recente,
                    COUNT(DISTINCT municipio_cod)                                    AS n_municipios
                FROM ap_classes_municipio
                WHERE ano_prodes = p_ano
                GROUP BY classe_prioridade
            ) t
        )
    );
$$;

-- ============================================================
-- RPC v3: get_ap_municipio_detalhe
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_municipio_detalhe(
    p_cod TEXT,
    p_ano SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
    SELECT json_build_object(
        'municipio', (
            SELECT row_to_json(r)
            FROM ap_municipios_resumo r
            WHERE municipio_cod = p_cod
        ),
        'classes', (
            SELECT json_agg(row_to_json(c) ORDER BY c.classe_prioridade)
            FROM (
                SELECT
                    classe_prioridade,
                    prioridade_label,
                    area_total_ha,
                    area_floresta_ha,
                    area_desmat_ha,
                    area_nao_floresta_ha,
                    pct_floresta,
                    pct_desmat,
                    ha_deter_recente,
                    agb_medio_tc_ha,
                    biomassa_total_tc
                FROM ap_classes_municipio
                WHERE municipio_cod = p_cod
                  AND ano_prodes    = p_ano
            ) c
        )
    );
$$;

-- ============================================================
-- RPC v3: get_ap_ranking — ranking de municípios ordenável
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_ranking(
    p_limit   INTEGER  DEFAULT 224,
    p_orderby TEXT     DEFAULT 'area_desmat_ha',
    p_ano     SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Whitelist contra SQL injection
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
            ROUND(COALESCE(ha_deter_recente, 0)::NUMERIC,         2) AS ha_deter_recente,
            ROUND(pct_floresta_estado::NUMERIC,                   2) AS pct_floresta_estado,
            ROUND(COALESCE(biomassa_floresta_tc, 0)::NUMERIC,     0) AS biomassa_floresta_tc,
            ROUND(COALESCE(agb_medio_tc_ha, 0)::NUMERIC,          2) AS agb_medio_tc_ha
        FROM ap_municipios_resumo
        WHERE ano_prodes = p_ano
        ORDER BY
            CASE WHEN p_orderby = 'municipio_nome'        THEN municipio_nome::TEXT           END ASC,
            CASE WHEN p_orderby = 'area_floresta_ha'      THEN area_floresta_ha               END DESC,
            CASE WHEN p_orderby = 'area_desmat_ha'        THEN area_desmat_ha                 END DESC,
            CASE WHEN p_orderby = 'ha_deter_recente'      THEN COALESCE(ha_deter_recente, 0)  END DESC,
            CASE WHEN p_orderby = 'pct_floresta_estado'   THEN pct_floresta_estado            END DESC,
            CASE WHEN p_orderby = 'classe_max_prioridade' THEN classe_max_prioridade::NUMERIC  END ASC,
            CASE WHEN p_orderby = 'biomassa_floresta_tc'  THEN biomassa_floresta_tc           END DESC,
            CASE WHEN p_orderby = 'agb_medio_tc_ha'       THEN agb_medio_tc_ha               END DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

-- ============================================================
-- RPC v3: get_ap_geojson — GeoJSON para PrioridadeMap e BiomassaMap
-- Inclui agb_medio_tc_ha e biomassa_total_tc para Tab Biomassa.
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_geojson(
    p_cod TEXT     DEFAULT NULL,
    p_ano SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            json_agg(
                json_build_object(
                    'type',     'Feature',
                    'geometry', ST_AsGeoJSON(geom)::json,
                    'properties', json_build_object(
                        'cod',                 municipio_cod,
                        'nome',                municipio_nome,
                        'classe_max',          classe_max_prioridade,
                        'area_floresta_ha',    ROUND(area_floresta_ha::NUMERIC,                2),
                        'area_desmat_ha',      ROUND(area_desmat_ha::NUMERIC,                  2),
                        'ha_deter_recente',    ROUND(COALESCE(ha_deter_recente, 0)::NUMERIC,   2),
                        'pct_floresta_estado', ROUND(pct_floresta_estado::NUMERIC,             2),
                        'agb_medio_tc_ha',     ROUND(COALESCE(agb_medio_tc_ha, 0)::NUMERIC,   2),
                        'biomassa_total_tc',   ROUND(COALESCE(biomassa_floresta_tc, 0)::NUMERIC, 0),
                        'bbox',                bbox
                    )
                )
            ),
            '[]'::json
        )
    )
    FROM ap_municipios_resumo
    WHERE ano_prodes = p_ano
      AND (p_cod IS NULL OR municipio_cod = p_cod)
      AND geom IS NOT NULL;
$$;

-- ============================================================
-- 10. COMMENTs v3
-- ============================================================
COMMENT ON TABLE ap_classes_municipio IS
    'Cruzamento PRODES × 5 classes de prioridade por município — REDD+ Piauí v3.
     Pipeline: gpd.overlay() vetorial (não pixel-counting).
     prioridade_label: Muito Baixo..Muito Alto.
     ha_deter_recente: alertas DETER gap pós-PRODES, nullable.
     agb_medio_tc_ha: AGB médio na interseção classe×município (rasterstats).
     biomassa_total_tc: agb_medio × area_floresta_ha.
     Chave: (municipio_cod, classe_prioridade, ano_prodes).';

COMMENT ON TABLE ap_municipios_resumo IS
    'Resumo por município para ranking, mapa coroplético e Tab Biomassa.
     agb_medio_tc_ha: AGB médio ponderado por area_floresta_ha (nova col v3).
     ha_deter_recente: soma alertas DETER gap por município, nullable.
     geom: aceita POLYGON ou MULTIPOLYGON (IBGE pode gerar ambos).
     bbox: [[minX,minY],[maxX,maxY]] para MapLibre GL fitBounds.';

COMMENT ON TABLE ap_execucoes IS
    'Audit log de execuções com rastreabilidade temporal completa.
     image_date_min/max: período real coberto pelo PRODES (≠ ano calendário).
     deter_gap_inicio/fim: período coberto pelo DETER complementar.';

COMMENT ON FUNCTION get_ap_visao_geral IS
    'KPIs do estado separados: prodes (confirmado INPE) e deter (alertas provisórios).
     Inclui n_municipios_classe_max (municípios com floresta em classe 5 = Muito Alto).';

COMMENT ON FUNCTION get_ap_ranking IS
    'Ranking ordenável. Whitelist inclui agb_medio_tc_ha (nova v3).
     p_orderby protegido por whitelist contra SQL injection.';

COMMENT ON FUNCTION get_ap_geojson IS
    'GeoJSON com agb_medio_tc_ha e biomassa_total_tc (nova v3) para Tab Biomassa.
     p_cod=NULL retorna todos os municípios.';
