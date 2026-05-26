-- Migration 006: índices de performance em execucoes_pipeline
-- Aplicar em: Supabase Dashboard → SQL Editor
--
-- Contexto: o DataStatusBadge (frontend) consulta a última execução via
--   ORDER BY executado_em DESC LIMIT 1
-- Sem índice, essa query faz full table scan a cada carregamento do dashboard.
-- Com o índice, a resposta é direta — custo fixo independente do histórico.

-- Índice principal: acelera a query ORDER BY executado_em DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_execucoes_executado_em
    ON execucoes_pipeline (executado_em DESC);

-- Índice parcial secundário: filtragem futura por execuções com problema
-- (ex: "quantas vezes o pipeline falhou nos últimos 6 meses?")
-- Parcial porque warning/error são minoria — índice compacto e eficiente.
CREATE INDEX IF NOT EXISTS idx_execucoes_status_problematico
    ON execucoes_pipeline (status, executado_em DESC)
    WHERE status IN ('warning', 'error');
