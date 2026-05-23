-- ============================================================
-- Migration 005: Security hardening das funções SECURITY DEFINER
-- CGEO/SEMARH-PI — Pipeline v2
--
-- Problema 1: upsert_deradsa_lote era executável por anon (qualquer
--   usuário sem autenticação podia inserir DERADSAs via supabase.rpc).
--
-- Problema 2: Funções SECURITY DEFINER sem SET search_path — vulnerabilidade
--   de search_path injection (boas práticas PostgreSQL / CWE-427).
--
-- Problema 3: UNIQUE inline em deradsa(id_deradsa, ano) ignorava NULLs
--   (NULL ≠ NULL no PostgreSQL), permitindo duplicatas silenciosas.
--
-- Aplicar via: Supabase Dashboard → SQL Editor → New Query → Run
-- Executar APÓS migrations 001–004.
-- ============================================================

-- ── Fix 1: Restringir execução de upsert_deradsa_lote ────────────────────
-- service_role (pipeline CI) tem EXECUTE implicitamente no Supabase.
-- anon não deve conseguir inserir DERADSAs sem autenticação.
REVOKE EXECUTE ON FUNCTION upsert_deradsa_lote(SMALLINT, TEXT, TEXT, JSON) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION upsert_deradsa_lote(SMALLINT, TEXT, TEXT, JSON) TO authenticated;

-- ── Fix 2: SET search_path nas funções SECURITY DEFINER ──────────────────
-- Previne que um atacante com CREATE SCHEMA consiga redirecionar
-- chamadas de funções internas para objetos em outro schema.
ALTER FUNCTION refresh_matopiba()
  SET search_path = public, pg_catalog;

ALTER FUNCTION upsert_deradsa_lote(SMALLINT, TEXT, TEXT, JSON)
  SET search_path = public, pg_catalog;

-- ── Fix 3: Substituir UNIQUE inline por índice parcial em deradsa ─────────
-- UNIQUE inline quebra quando id_deradsa é NULL (NULL ≠ NULL no PG).
-- Índice parcial deduplicata apenas registros com id_deradsa preenchido.
ALTER TABLE deradsa DROP CONSTRAINT IF EXISTS deradsa_id_deradsa_ano_key;

CREATE UNIQUE INDEX IF NOT EXISTS deradsa_id_deradsa_ano_uniq
  ON deradsa (id_deradsa, ano)
  WHERE id_deradsa IS NOT NULL;

-- ── Verificação ───────────────────────────────────────────────────────────
-- Confirmar que anon não tem mais EXECUTE em upsert_deradsa_lote:
-- SELECT has_function_privilege('anon', 'upsert_deradsa_lote(smallint,text,text,json)', 'EXECUTE');
-- Deve retornar: false
--
-- Confirmar search_path das funções:
-- SELECT proname, proconfig FROM pg_proc
-- WHERE proname IN ('refresh_matopiba', 'upsert_deradsa_lote');
-- Deve mostrar: {search_path=public,pg_catalog}
