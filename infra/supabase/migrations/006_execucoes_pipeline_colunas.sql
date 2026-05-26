-- Migration 006: Adicionar colunas de auditoria em execucoes_pipeline
-- CGEO/SEMARH-PI — Pipeline v2
--
-- Contexto: o orquestrador (core/orchestrator.py) passou a registrar
-- automaticamente cada execução com status, duração e resumo por módulo.
-- Essas colunas são lidas pelo DataStatusBadge no frontend (topbar do dashboard).
--
-- Aplicar via: Supabase Dashboard → SQL Editor → New Query → Run
-- Executar APÓS migrations 001–005.
-- ============================================================

-- Coluna de status da execução: ok | warning | error
ALTER TABLE execucoes_pipeline
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ok'
        CHECK (status IN ('ok', 'warning', 'error'));

-- Duração total da execução em segundos
ALTER TABLE execucoes_pipeline
    ADD COLUMN IF NOT EXISTS duracao_s INTEGER;

-- Módulos executados com sucesso / total de módulos
ALTER TABLE execucoes_pipeline
    ADD COLUMN IF NOT EXISTS modulos_ok INTEGER;

ALTER TABLE execucoes_pipeline
    ADD COLUMN IF NOT EXISTS modulos_total INTEGER;

-- Texto de resumo legível (exibido no tooltip do DataStatusBadge)
ALTER TABLE execucoes_pipeline
    ADD COLUMN IF NOT EXISTS log_resumo TEXT;

-- ── Verificação ───────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'execucoes_pipeline'
-- ORDER BY ordinal_position;
