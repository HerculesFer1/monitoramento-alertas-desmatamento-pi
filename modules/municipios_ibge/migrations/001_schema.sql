-- modules/municipios_ibge/migrations/001_schema.sql
-- Malha municipal do Piauí (IBGE)

CREATE TABLE IF NOT EXISTS municipios_pi (
    id         BIGSERIAL PRIMARY KEY,
    nome       TEXT,
    codigo_ibge TEXT UNIQUE,
    geom       GEOMETRY(MULTIPOLYGON, 4326),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS municipios_geom_idx ON municipios_pi USING GIST (geom);

ALTER TABLE municipios_pi ENABLE ROW LEVEL SECURITY;
CREATE POLICY municipios_select ON municipios_pi FOR SELECT TO anon USING (true);
