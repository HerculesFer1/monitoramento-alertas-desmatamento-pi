-- modules/deradsa_semarh/migrations/001_schema.sql
-- Tabela de DERADSAs SEMARH-PI

CREATE TABLE IF NOT EXISTS deradsa_semarh (
    id          BIGSERIAL PRIMARY KEY,
    id_deradsa  TEXT UNIQUE,            -- chave natural (campo "Id" do GeoJSON)
    ano         INT,
    geom        GEOMETRY(MULTIPOLYGON, 4326),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deradsa_geom_idx ON deradsa_semarh USING GIST (geom);
CREATE INDEX IF NOT EXISTS deradsa_ano_idx  ON deradsa_semarh (ano);

ALTER TABLE deradsa_semarh ENABLE ROW LEVEL SECURITY;
CREATE POLICY deradsa_select ON deradsa_semarh FOR SELECT TO anon USING (true);
