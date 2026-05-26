-- Migration 007: Índices de performance em execucoes_pipeline
-- CGEO/SEMARH-PI — Pipeline v2
--
-- Depende de: Migration 006 (coluna `status` deve existir)
--
-- Aplicar via: Supabase Dashboard → SQL Editor → New Query → Run
-- Executar APÓS migration 006.
-- ============================================================

-- Índice principal: acelera ORDER BY executado_em DESC LIMIT 1
-- Usado pelo DataStatusBadge a cada carregamento do dashboard.
CREATE INDEX IF NOT EXISTS idx_execucoes_executado_em
    ON execucoes_pipeline (executado_em DESC);

-- Índice parcial: filtragem de execuções com problema (warning/error).
-- Parcial porque é minoria das linhas — índice compacto e eficiente.
CREATE INDEX IF NOT EXISTS idx_execucoes_status_problematico
    ON execucoes_pipeline (status, executado_em DESC)
    WHERE status IN ('warning', 'error');

-- ── Verificação ───────────────────────────────────────────────────────────
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'execucoes_pipeline';
