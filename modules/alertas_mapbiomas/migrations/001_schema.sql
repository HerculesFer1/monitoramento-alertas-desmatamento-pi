-- modules/alertas_mapbiomas/migrations/001_schema.sql
-- Alertas classificados e agregado municipal
-- (schema já existente — mantido aqui para referência e versionamento)

-- Tabela já criada por infra/supabase/migrations/
-- Esta migration é um no-op se aplicada após as migrations globais.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'alertas_classificados'
    ) THEN
        RAISE NOTICE 'alertas_classificados não existe — aplicar infra/supabase/migrations/ primeiro';
    END IF;
END $$;
