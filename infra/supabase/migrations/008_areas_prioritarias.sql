-- Migration 008 — Módulo areas_prioritarias v3
-- Programa Jurisdicional REDD+ Piauí
-- v3: 5 classes (não 16), prioridade_label, agb_medio_tc_ha em resumo,
--     n_municipios_classe_max em visao_geral, biomassa em geojson.
-- Segue padrões de 001_schema_inicial.sql

-- ============================================================
-- TABELA PRINCIPAL: cruzamento município × classe × área
-- ============================================================
CREATE TABLE IF NOT EXISTS ap_classes_municipio (
    municipio_cod        TEXT          NOT NULL,
    municipio_nome       TEXT          NOT NULL,
    uf                   TEXT          NOT NULL DEFAULT 'PI',
    classe_prioridade    SMALLINT      NOT NULL,
    prioridade_label     TEXT,                   -- 'Muito Baixo'..'Muito Alto'
    area_total_ha        NUMERIC(12,4) NOT NULL,
    area_floresta_ha     NUMERIC(12,4) NOT NULL,
    area_desmat_ha       NUMERIC(12,4) NOT NULL,
    area_nao_floresta_ha NUMERIC(12,4) NOT NULL,
    pct_floresta         NUMERIC(6,2),
    pct_desmat           NUMERIC(6,2),
    ha_deter_recente     NUMERIC(12,4),           -- alertas DETER gap pós-PRODES, nullable
    agb_medio_tc_ha      NUMERIC(8,3),            -- AGB médio na interseção classe×município
    biomassa_total_tc    NUMERIC(12,4),           -- agb_medio × area_floresta_ha
    ano_prodes           SMALLINT      NOT NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ap_classes_municipio_pkey
        PRIMARY KEY (municipio_cod, classe_prioridade, ano_prodes),

    CONSTRAINT chk_classe_prioridade
        CHECK (classe_prioridade BETWEEN 1 AND 5),

    CONSTRAINT chk_ano_prodes
        CHECK (ano_prodes BETWEEN 2000 AND 2099),

    CONSTRAINT chk_areas_positivas
        CHECK (
            area_total_ha        >= 0
            AND area_floresta_ha     >= 0
            AND area_desmat_ha       >= 0
            AND area_nao_floresta_ha >= 0
        ),

    CONSTRAINT chk_pct_floresta
        CHECK (pct_floresta IS NULL OR pct_floresta BETWEEN 0 AND 100),

    CONSTRAINT chk_pct_desmat
        CHECK (pct_desmat IS NULL OR pct_desmat BETWEEN 0 AND 100),

    CONSTRAINT chk_ha_deter_positivo
        CHECK (ha_deter_recente IS NULL OR ha_deter_recente >= 0),

    CONSTRAINT chk_agb_sanidade
        CHECK (agb_medio_tc_ha IS NULL OR agb_medio_tc_ha BETWEEN 0 AND 1000)
);

-- ============================================================
-- TABELA RESUMO: uma linha por município (mapa + ranking)
-- Usa GEOMETRY(GEOMETRY) para aceitar POLYGON e MULTIPOLYGON.
-- ============================================================
CREATE TABLE IF NOT EXISTS ap_municipios_resumo (
    municipio_cod         TEXT          PRIMARY KEY,
    municipio_nome        TEXT          NOT NULL,
    uf                    TEXT          NOT NULL DEFAULT 'PI',
    classe_max_prioridade SMALLINT,
    area_total_ha         NUMERIC(12,4),
    area_floresta_ha      NUMERIC(12,4),
    area_desmat_ha        NUMERIC(12,4),
    ha_deter_recente      NUMERIC(12,4),           -- soma alertas DETER gap, nullable
    pct_floresta_estado   NUMERIC(6,2),            -- % da floresta total do PI
    biomassa_floresta_tc  NUMERIC(12,4),           -- soma biomassa_total_tc das classes
    agb_medio_tc_ha       NUMERIC(8,3),            -- AGB médio ponderado (nova — Tab Biomassa)
    geom                  GEOMETRY(GEOMETRY, 4326), -- POLYGON ou MULTIPOLYGON
    bbox                  JSONB,                   -- [[minX,minY],[maxX,maxY]] MapLibre
    ano_prodes            SMALLINT      NOT NULL,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resumo_classe
        CHECK (classe_max_prioridade IS NULL OR classe_max_prioridade BETWEEN 1 AND 5),

    CONSTRAINT chk_resumo_pct
        CHECK (pct_floresta_estado IS NULL OR pct_floresta_estado BETWEEN 0 AND 100),

    CONSTRAINT chk_resumo_ha_deter
        CHECK (ha_deter_recente IS NULL OR ha_deter_recente >= 0),

    CONSTRAINT chk_resumo_agb
        CHECK (agb_medio_tc_ha IS NULL OR agb_medio_tc_ha BETWEEN 0 AND 1000)
);

-- ============================================================
-- TABELA AUDITORIA: log de execuções + rastreabilidade temporal
-- ============================================================
CREATE TABLE IF NOT EXISTS ap_execucoes (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    modulo                 TEXT          NOT NULL DEFAULT 'areas_prioritarias',
    status                 TEXT          NOT NULL,
    ano_prodes             SMALLINT,
    total_municipios       INTEGER,
    total_registros        INTEGER,
    duracao_segundos       NUMERIC(10,2),
    -- Rastreabilidade PRODES
    image_date_min         DATE,
    image_date_max         DATE,
    data_referencia_prodes DATE,
    -- Cobertura DETER gap
    deter_gap_inicio       DATE,
    deter_gap_fim          DATE,
    fonte_complementar     TEXT,
    detalhes               JSONB,
    executado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_execucao_status
        CHECK (status IN ('sucesso', 'erro', 'parcial', 'dry_run')),

    CONSTRAINT chk_fonte_complementar
        CHECK (fonte_complementar IS NULL OR fonte_complementar IN ('DETER'))
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ap_classes_municipio_cod
    ON ap_classes_municipio (municipio_cod);

CREATE INDEX IF NOT EXISTS idx_ap_classes_ano
    ON ap_classes_municipio (ano_prodes);

CREATE INDEX IF NOT EXISTS idx_ap_classes_classe
    ON ap_classes_municipio (classe_prioridade);

CREATE INDEX IF NOT EXISTS idx_ap_classes_composto
    ON ap_classes_municipio (ano_prodes, classe_prioridade);

CREATE INDEX IF NOT EXISTS idx_ap_classes_deter_ativo
    ON ap_classes_municipio (ano_prodes, municipio_cod)
    WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0;

CREATE INDEX IF NOT EXISTS idx_ap_resumo_geom
    ON ap_municipios_resumo USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_ap_resumo_classe_max
    ON ap_municipios_resumo (classe_max_prioridade);

CREATE INDEX IF NOT EXISTS idx_ap_resumo_biomassa
    ON ap_municipios_resumo (biomassa_floresta_tc DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ap_resumo_deter_ativo
    ON ap_municipios_resumo (ano_prodes, ha_deter_recente DESC NULLS LAST)
    WHERE ha_deter_recente IS NOT NULL AND ha_deter_recente > 0;

CREATE INDEX IF NOT EXISTS idx_ap_execucoes_ano_status
    ON ap_execucoes (ano_prodes, status, executado_em DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE ap_classes_municipio   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_municipios_resumo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_execucoes           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_publica_ap_classes"
    ON ap_classes_municipio FOR SELECT USING (true);

CREATE POLICY "leitura_publica_ap_resumo"
    ON ap_municipios_resumo FOR SELECT USING (true);

CREATE POLICY "leitura_publica_ap_execucoes"
    ON ap_execucoes FOR SELECT USING (true);

-- ============================================================
-- RPC: get_ap_periodo_cobertura
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
-- RPC: get_ap_visao_geral — KPIs estado + distribuição por classe
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
-- RPC: get_ap_municipio_detalhe
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
-- RPC: get_ap_ranking — ranking de municípios ordenável
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
-- RPC: get_ap_geojson — GeoJSON para PrioridadeMap e BiomassaMap
-- Inclui agb_medio_tc_ha e biomassa_total_tc para Tab Biomassa.
-- ============================================================
CREATE OR REPLACE FUNCTION get_ap_geojson(
    p_cod TEXT     DEFAULT NULL,
    p_ano SMALLINT DEFAULT 2025
)
RETURNS JSON
LANGUAGE sql
STABLE
-- 'extensions' obrigatório p/ ST_AsGeoJSON do PostGIS (schema 'extensions')
SET search_path = public, extensions, pg_catalog
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
-- COMENTÁRIOS
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
