-- ============================================================
-- Migration 022: Baseline das migrations pré-2026-06-17
-- ============================================================
-- Aplicada em 2026-06-26 no projeto institucional ubcejvbnpuyouwpphryc.
--
-- Registra em supabase_migrations.schema_migrations as 9 migrations
-- que foram aplicadas via SQL Editor antes de 2026-06-17 (data em que
-- o projeto passou a ser gerenciado via apply_migration MCP).
--
-- Sem este registro, ferramentas que consultam schema_migrations
-- (supabase CLI, MCP) assumem que essas migrations estão faltando e
-- tentam re-aplicá-las, gerando erros "already exists".
--
-- Marcadores verificados em 2026-06-26 confirmaram que cada uma das
-- 9 entradas abaixo tem seu efeito presente no schema do banco:
--   001 → tabela alertas_classificados
--   002 → MV matopiba_municipios (posteriormente recriada em 020)
--   003 → execucoes_pipeline + storage deradsa
--   004 → função get_resumo_prodes com fix do n_total
--   005 → policies RLS para anon
--   006 → colunas modulos_ok/total/log_resumo em execucoes_pipeline
--   007 → índices em execucoes_pipeline
--   008 → tabelas ap_classes_municipio, ap_municipios_resumo, ap_execucoes
--   010 → prioridade_label, agb_medio_tc_ha, constraints 1..5
--
-- Migrations 013 e 014 do diretório NÃO estão neste baseline porque
-- seus efeitos não foram detectados no banco — devem ser aplicadas
-- futuramente como migrations novas via apply_migration:
--   013 → GRANT EXECUTE em 9 RPCs + índice composto (ano, codealerta)
--   014 → função simplification_tolerance_choropleth
--
-- ON CONFLICT DO NOTHING: idempotente, seguro re-executar.
-- ============================================================

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20260101000001', '001_schema_inicial',
   ARRAY['-- baseline: tabelas alertas_classificados, agregado_municipios, execucoes_pipeline já existentes em 2026-06-17']),
  ('20260101000002', '002_matopiba_view',
   ARRAY['-- baseline: MV matopiba_municipios (versão original, posteriormente recriada em 020)']),
  ('20260101000003', '003_deradsa_management',
   ARRAY['-- baseline: storage bucket deradsa + RPCs de gestão']),
  ('20260101000004', '004_prodes_rpc_fix',
   ARRAY['-- baseline: get_resumo_prodes com n_total corrigido']),
  ('20260101000005', '005_security_hardening',
   ARRAY['-- baseline: policies RLS para anon nas tabelas públicas']),
  ('20260101000006', '006_execucoes_pipeline_colunas',
   ARRAY['-- baseline: colunas modulos_ok / modulos_total / log_resumo em execucoes_pipeline']),
  ('20260101000007', '007_index_execucoes_pipeline',
   ARRAY['-- baseline: índices em execucoes_pipeline']),
  ('20260101000008', '008_areas_prioritarias',
   ARRAY['-- baseline: tabelas ap_classes_municipio, ap_municipios_resumo, ap_execucoes + 5 RPCs v1']),
  ('20260101000010', '010_areas_prioritarias_v3_upgrade',
   ARRAY['-- baseline: prioridade_label, agb_medio_tc_ha, constraints 1..5, 5 RPCs v3'])
ON CONFLICT (version) DO NOTHING;
