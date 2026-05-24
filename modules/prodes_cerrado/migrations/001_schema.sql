-- modules/prodes_cerrado/migrations/001_schema.sql
-- Polígonos PRODES-Cerrado (INPE) para validação cruzada de alertas

CREATE TABLE IF NOT EXISTS prodes_cerrado (
    id         BIGSERIAL PRIMARY KEY,
    ano        INT,                      -- ciclo PRODES (ago Y-1 → jul Y)
    geom       GEOMETRY(MULTIPOLYGON, 4326),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prodes_geom_idx ON prodes_cerrado USING GIST (geom);
CREATE INDEX IF NOT EXISTS prodes_ano_idx  ON prodes_cerrado (ano);

ALTER TABLE prodes_cerrado ENABLE ROW LEVEL SECURITY;
CREATE POLICY prodes_select ON prodes_cerrado FOR SELECT TO anon USING (true);
