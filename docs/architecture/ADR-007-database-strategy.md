# ADR-007: Estratégia de Banco de Dados

**Status:** Aceito
**Data:** 2026-05-24
**Provedor:** Supabase — PostgreSQL 15 + PostGIS 3
**Projeto:** `ssqriwgrxievcmxauegv`

## Tabelas por Módulo Dono

| Tabela | Módulo dono | Descrição |
|--------|------------|-----------|
| `alertas_classificados` | `alertas_mapbiomas` | Fragmentos classificados (22 campos + geom) |
| `agregado_municipios` | `alertas_mapbiomas` | KPIs por município × ano |
| `execucoes_pipeline` | `platform` | Auditoria de cada execução |
| `prodes_concordancia` | `prodes_cerrado` | Resultados da validação PRODES-Cerrado |
| `matopiba_view` | `platform` | View: 26 municípios PI do MATOPIBA |

## Migrations — Estratégia

```
infra/supabase/migrations/       ← schema compartilhado da plataforma
    001_schema_inicial.sql
    002_matopiba_view.sql
    003_deradsa_management.sql
    004_prodes_rpc_fix.sql
    005_security_hardening.sql

modules/<nome>/migrations/       ← schema específico do módulo
    001_<nome>_schema.sql
    002_<nome>_indexes.sql
```

**Regra:** migrations de módulo só tocam tabelas listadas em `manifest["outputs"]`.
**Numeração:** global por data — `YYYYMMDD_descricao.sql`.
**Execução:** manual via Supabase Dashboard ou `supabase db push`.

## RPCs Disponíveis

| Função RPC | Módulo dono | Retorno |
|------------|-------------|---------|
| `get_alertas_geojson(p_ano, p_classificacao, ...)` | alertas_mapbiomas | FeatureCollection paginada |
| `get_resumo_anual()` | alertas_mapbiomas | KPIs anuais (n_alertas, ha_total, ipi) |
| `get_resumo_prodes()` | prodes_cerrado | Concordância PRODES por ciclo |
| `get_municipios_ranking(p_ano, p_limit)` | alertas_mapbiomas | Top municípios por área irregular |
| `get_matopiba_stats(p_ano)` | alertas_mapbiomas | Agregado MATOPIBA (26 municípios) |

## Row Level Security (RLS)

| Tabela | anon key | service_role |
|--------|:---:|:---:|
| `alertas_classificados` | SELECT | INSERT / UPDATE / DELETE |
| `agregado_municipios` | SELECT | INSERT / UPDATE / DELETE |
| `execucoes_pipeline` | SELECT | INSERT |

**Padrão para toda tabela nova de módulo:**
```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura_publica_<tabela>" ON <tabela> FOR SELECT USING (true);
-- Escrita apenas via service_role (pipeline) — sem policy de INSERT para anon
```

## Índices Essenciais

```sql
-- Filtros mais frequentes no dashboard
CREATE INDEX alertas_ano_idx       ON alertas_classificados (ano);
CREATE INDEX alertas_municipio_idx ON alertas_classificados (municipio);
CREATE INDEX alertas_classe_idx    ON alertas_classificados (classificacao);
CREATE INDEX alertas_geom_idx      ON alertas_classificados USING GIST(geom);
CREATE INDEX alertas_matopiba_idx  ON alertas_classificados (matopiba)
  WHERE matopiba = TRUE;
```

## Checklist para Migration de Novo Módulo

- [ ] Criar `modules/<nome>/migrations/001_schema.sql`
- [ ] Definir tabela com `ENABLE ROW LEVEL SECURITY`
- [ ] Criar policy de leitura pública (`FOR SELECT USING (true)`)
- [ ] Criar índices para os filtros esperados
- [ ] Listar tabela em `manifest["outputs"]`
- [ ] Executar migration no Supabase Dashboard **antes** do primeiro `run()`
- [ ] Verificar que `anon key` retorna dados (`SELECT * FROM <tabela> LIMIT 1`)
