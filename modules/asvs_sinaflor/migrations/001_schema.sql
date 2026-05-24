-- modules/asvs_sinaflor/migrations/001_schema.sql
-- Tabela de ASVs SINAFLOR — Autorizações de Supressão Vegetal do Piauí

CREATE TABLE IF NOT EXISTS asvs_sinaflor (
    id            BIGSERIAL PRIMARY KEY,
    nu_autoriz    TEXT UNIQUE,          -- número da autorização (chave natural)
    status_aut    TEXT,
    bioma_pamg    TEXT,
    dt_valid_i    DATE,                 -- início da vigência
    dt_valid_f    DATE,                 -- fim da vigência
    geom          GEOMETRY(MULTIPOLYGON, 4326),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asvs_geom_idx ON asvs_sinaflor USING GIST (geom);
CREATE INDEX IF NOT EXISTS asvs_status_idx ON asvs_sinaflor (status_aut);

-- RLS: somente leitura para anon
ALTER TABLE asvs_sinaflor ENABLE ROW LEVEL SECURITY;
CREATE POLICY asvs_select ON asvs_sinaflor FOR SELECT TO anon USING (true);
