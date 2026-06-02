-- Smoke tests para Migration 009 — queimadas_bdq
-- Rodar via psql ou Supabase SQL Editor após dados estarem populados.
-- Pré-requisitos:
--   - Migration 009 aplicada
--   - qb_cicatrizes_classes e qb_municipios_resumo populadas para 2025

-- 1) Tabelas existem com schema correto
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name IN ('qb_cicatrizes_classes', 'qb_municipios_resumo', 'qb_execucoes')
    HAVING COUNT(*) = 3
) AS qb_3_tabelas_existem;

-- 2) PK composta em qb_cicatrizes_classes (mun, classe, mes, ano)
SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'qb_classes_pkey'
) AS pk_composta_classes;

-- 3) Constraint mes 1..12
SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'qb_chk_mes'
) AS constraint_mes_1_12;

-- 4) Constraint classe_prioridade 1..5
SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'qb_chk_classe'
) AS constraint_classe_1_5;

-- 5) Índice GiST em geom existe
SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'qb_municipios_resumo'
      AND indexname = 'idx_qb_resumo_geom'
) AS gist_qb_geom_indexado;

-- 6) get_qb_visao_geral retorna estrutura kpis + por_classe + por_mes
SELECT
    (get_qb_visao_geral(2025) -> 'kpis')        IS NOT NULL
    AND (get_qb_visao_geral(2025) -> 'por_classe') IS NOT NULL
    AND (get_qb_visao_geral(2025) -> 'por_mes')    IS NOT NULL
    AS visao_geral_estrutura;

-- 7) get_qb_temporal retorna array de 12 meses (ou subset se ano incompleto)
SELECT
    json_array_length(get_qb_temporal(2025)) <= 12
    AND json_array_length(get_qb_temporal(2025)) >= 0
    AS temporal_array_valido;

-- 8) get_qb_ranking respeita limit
SELECT
    json_array_length(get_qb_ranking(2025, 5)) <= 5
    AS ranking_respeita_limit;

-- 9) RLS habilitado nas 3 tabelas
SELECT
    bool_and(rowsecurity)
    AS rls_habilitado_em_todas
FROM pg_tables
WHERE tablename IN ('qb_cicatrizes_classes', 'qb_municipios_resumo', 'qb_execucoes');
