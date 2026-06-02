-- ============================================================
-- Migration 013 — Polimento de GRANTs e índice composto
-- Achados B1 e M3 da auditoria GIS 2026-06-02.
--
-- B1: As RPCs get_ap_* (Migration 008) e get_qb_* (Migration 009) funcionam
--     para o role `anon` porque herdam permissões padrão do PostgreSQL.
--     Mas o padrão da Migration 011 (e ADR-008) é GRANT EXECUTE explícito —
--     a mistura cria inconsistência arquitetural e dificulta auditoria de
--     permissões com `SELECT proname FROM pg_proc WHERE …`.
--
-- M3: get_resumo_anual e queries similares fazem COUNT(DISTINCT codealerta)
--     filtrando por ano. Sem índice composto (ano, codealerta), o planner
--     cai em Bitmap Index Scan ou full scan. Para 13.638 fragmentos, OK;
--     ao crescer, vira gargalo em ~100ms+.
--
-- Safe to re-run: GRANT é idempotente, CREATE INDEX usa IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- B1 — GRANT EXECUTE explícito nas RPCs areas_prioritarias (008)
-- ============================================================
GRANT EXECUTE ON FUNCTION get_ap_periodo_cobertura(SMALLINT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_ap_visao_geral(SMALLINT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_ap_municipio_detalhe(TEXT, SMALLINT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_ap_ranking(INTEGER, TEXT, SMALLINT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_ap_geojson(TEXT, SMALLINT)
    TO anon, authenticated;

-- ============================================================
-- B1 — GRANT EXECUTE explícito nas RPCs queimadas_bdq (009)
-- ============================================================
GRANT EXECUTE ON FUNCTION get_qb_visao_geral(INT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_qb_municipios(INT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_qb_temporal(INT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_qb_ranking(INT, INT)
    TO anon, authenticated;

-- ============================================================
-- M3 — Índice composto (ano, codealerta) em alertas_classificados
-- Acelera COUNT(DISTINCT codealerta) FILTER WHERE ano = ? usado em
-- get_resumo_anual e em qualquer relatório por ano.
-- ============================================================
CREATE INDEX IF NOT EXISTS alertas_ano_codealerta_idx
    ON alertas_classificados (ano, codealerta);

COMMENT ON INDEX alertas_ano_codealerta_idx IS
    'Composto para COUNT(DISTINCT codealerta) particionado por ano —
     get_resumo_anual e variantes. M3 da auditoria GIS 2026-06-02.';

-- ============================================================
-- Verificações
-- ============================================================
-- Confirmar GRANTs aplicados:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name LIKE 'get_ap_%' OR routine_name LIKE 'get_qb_%';
--
-- Confirmar índice criado:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'alertas_classificados'
--   AND indexname = 'alertas_ano_codealerta_idx';
