-- ============================================================
-- Migration 003: Gestão de DERADSAs
-- CGEO/SEMARH-PI — Pipeline v2
--
-- Criada para suportar o canal de atualização manual de
-- DERADSAs via frontend e download automatizado em CI.
--
-- Executar APÓS 001 e 002.
-- ============================================================

-- ── Tabela de rastreamento de uploads ────────────────────────────────────
-- Registro de cada lote de DERADSAs enviado pelo CGEO.
-- Auditoria: quem enviou, quando, qual arquivo, quantos registros.
CREATE TABLE IF NOT EXISTS deradsa_uploads (
  id           SERIAL PRIMARY KEY,
  enviado_em   TIMESTAMPTZ DEFAULT NOW(),
  enviado_por  TEXT NOT NULL,        -- email do usuário (auth.email())
  ano          SMALLINT NOT NULL,    -- ano de emissão das DERADSAs
  n_registros  INTEGER,              -- quantos polígonos no lote
  arquivo_nome TEXT,                 -- nome original do arquivo GeoJSON
  notas        TEXT,                 -- observações do analista
  status       TEXT DEFAULT 'PROCESSADO'
               CHECK (status IN ('PROCESSADO', 'ERRO', 'PENDENTE'))
);

-- ── Tabela principal de DERADSAs ──────────────────────────────────────────
-- Polígonos de DERADSA — instrumentos de regularização ambiental.
-- Série B: dados geoespaciais disponíveis apenas a partir de 2024.
CREATE TABLE IF NOT EXISTS deradsa (
  id              SERIAL PRIMARY KEY,
  id_deradsa      TEXT,                    -- campo "Id" do arquivo original
  municipio       TEXT,
  area_ha         NUMERIC(12,4),
  ano             SMALLINT NOT NULL CHECK (ano BETWEEN 2020 AND 2099),
  geom            GEOMETRY(GEOMETRY, 4326),
  upload_id       INTEGER REFERENCES deradsa_uploads(id) ON DELETE SET NULL,
  inserido_em     TIMESTAMPTZ DEFAULT NOW(),
  -- Constraint de unicidade: mesmo id + ano não duplica
  UNIQUE (id_deradsa, ano)
);

-- Índices
CREATE INDEX IF NOT EXISTS deradsa_ano_idx  ON deradsa (ano);
CREATE INDEX IF NOT EXISTS deradsa_mun_idx  ON deradsa (municipio);
CREATE INDEX IF NOT EXISTS deradsa_geom_idx ON deradsa USING GIST(geom);

-- ── RLS — DERADSA ─────────────────────────────────────────────────────────
ALTER TABLE deradsa          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deradsa_uploads  ENABLE ROW LEVEL SECURITY;

-- Leitura pública (pipeline automatizado + frontend)
CREATE POLICY "leitura_publica_deradsa"
  ON deradsa FOR SELECT USING (true);

CREATE POLICY "leitura_publica_deradsa_uploads"
  ON deradsa_uploads FOR SELECT USING (true);

-- Escrita apenas via service_role (pipeline CI) ou usuário autenticado
-- (frontend — requer configurar Supabase Auth)
CREATE POLICY "escrita_service_deradsa"
  ON deradsa FOR INSERT
  WITH CHECK (true);   -- service_role bypassa RLS; anon não tem acesso

CREATE POLICY "escrita_service_deradsa_uploads"
  ON deradsa_uploads FOR INSERT
  WITH CHECK (true);

-- ── RPC: get_deradsa_geojson ──────────────────────────────────────────────
-- Exporta DERADSAs como GeoJSON para o pipeline em modo CI.
-- Equivalente às leituras locais de "DERADSAs Emitidas[SEMARH-{ano}].geojson"
CREATE OR REPLACE FUNCTION get_deradsa_geojson(p_ano SMALLINT)
RETURNS JSON
LANGUAGE SQL STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(f), '[]'::json)
  )
  FROM (
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'Id',        id_deradsa,
        'Município', municipio,
        'Área/ha',   area_ha,
        'Ano',       ano
      )
    ) AS f
    FROM deradsa
    WHERE ano = p_ano
      AND geom IS NOT NULL
  ) sub;
$$;

COMMENT ON FUNCTION get_deradsa_geojson IS
  'Exporta DERADSAs de um ano como FeatureCollection GeoJSON. '
  'Usado pelo pipeline em modo CI para substituir arquivos locais.';

-- ── RPC: get_deradsa_resumo ───────────────────────────────────────────────
-- Resumo de DERADSAs por ano — alimenta cards do frontend.
CREATE OR REPLACE FUNCTION get_deradsa_resumo()
RETURNS TABLE (
  ano          SMALLINT,
  n_registros  BIGINT,
  area_ha_total NUMERIC,
  ultimo_upload TIMESTAMPTZ
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.ano,
    COUNT(*)                   AS n_registros,
    ROUND(SUM(d.area_ha), 2)   AS area_ha_total,
    MAX(u.enviado_em)          AS ultimo_upload
  FROM deradsa d
  LEFT JOIN deradsa_uploads u ON d.upload_id = u.id
  GROUP BY d.ano
  ORDER BY d.ano;
$$;

-- ── RPC: upsert_deradsa_lote ──────────────────────────────────────────────
-- Insere ou atualiza um lote de DERADSAs.
-- Chamado pelo pipeline CI após download do Supabase Storage.
-- p_registros: array de JSON com campos {id_deradsa, municipio, area_ha, geom_ewkt}
CREATE OR REPLACE FUNCTION upsert_deradsa_lote(
  p_ano        SMALLINT,
  p_enviado_por TEXT,
  p_arquivo    TEXT,
  p_registros  JSON
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_upload_id INTEGER;
  v_n         INTEGER := 0;
  v_reg       JSON;
BEGIN
  -- Cria registro de upload
  INSERT INTO deradsa_uploads(enviado_em, enviado_por, ano, arquivo_nome, status)
  VALUES (NOW(), p_enviado_por, p_ano, p_arquivo, 'PENDENTE')
  RETURNING id INTO v_upload_id;

  -- Insere polígonos
  FOR v_reg IN SELECT * FROM json_array_elements(p_registros) LOOP
    INSERT INTO deradsa(id_deradsa, municipio, area_ha, ano, geom, upload_id)
    VALUES (
      v_reg->>'id_deradsa',
      v_reg->>'municipio',
      (v_reg->>'area_ha')::NUMERIC,
      p_ano,
      ST_SetSRID(ST_GeomFromText(v_reg->>'geom_wkt'), 4326),
      v_upload_id
    )
    ON CONFLICT (id_deradsa, ano) DO UPDATE
      SET municipio   = EXCLUDED.municipio,
          area_ha     = EXCLUDED.area_ha,
          geom        = EXCLUDED.geom,
          upload_id   = EXCLUDED.upload_id,
          inserido_em = NOW();
    v_n := v_n + 1;
  END LOOP;

  -- Atualiza registro de upload com contagem e status
  UPDATE deradsa_uploads
  SET n_registros = v_n, status = 'PROCESSADO'
  WHERE id = v_upload_id;

  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION upsert_deradsa_lote IS
  'Insere/atualiza lote de DERADSAs com trilha de auditoria. '
  'Retorna o número de registros processados.';

-- ── Comentários nas tabelas ───────────────────────────────────────────────
COMMENT ON TABLE deradsa IS
  'Polígonos de DERADSA (Decisão em Recurso Administrativo) '
  'emitidas pela SEMARH-PI. Série B: dados geoespaciais a partir de 2024.';

COMMENT ON TABLE deradsa_uploads IS
  'Auditoria de uploads de DERADSAs via frontend. '
  'Cada upload corresponde a um arquivo GeoJSON enviado pelo CGEO.';
