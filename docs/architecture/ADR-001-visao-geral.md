# ADR-001: Plataforma Modular de Análise Geoespacial

**Status:** Aceito
**Data:** 2026-05-24
**Decisores:** CGEO / SEMARH-PI
**Versão alvo:** v2.0.0

## Contexto

O pipeline de monitoramento de desmatamento do Piauí evoluiu de um script único para
um sistema de produção com 17 módulos Python e 6 dashboards React. A estrutura atual
(monolito centrado em `pipeline/__main__.py`, ~2.890 LOC) funciona, mas trava a
escalabilidade:

- Adicionar novo dataset exige editar `__main__.py` diretamente
- Bug em um módulo pode travar todos os demais
- Frontend cresce por acréscimo de páginas sem contrato com o backend
- Não há local explícito para decisões de Design / UX

## Decisão

Adotar o padrão **Vertical Slice + Plugin Registry**:

> Cada módulo de análise vive em seu próprio slice (`modules/<nome>/`) com backend,
> migrations, testes e manifesto. O core da plataforma (`core/`) orquestra os
> módulos descobertos dinamicamente, sem conhecer seus detalhes internos.

## Padrão Escolhido vs. Alternativas

| Critério | Microserviços | Monolito atual | Vertical Slice ✅ |
|----------|:---:|:---:|:---:|
| Isolamento de falhas | Total | Nenhum | Por módulo |
| Overhead operacional | Alto | Zero | Zero |
| Compatibilidade com Supabase | Baixa | Total | Total |
| Viável para equipe 2–4 pessoas | Não | Sim | Sim |
| Adicionar módulo sem tocar core | Não | Não | **Sim** |

## Estrutura Resultante

```
core/              ← núcleo (orchestrator, registry, uploader, spatial)
modules/           ← um slice por módulo de análise (plugin)
frontend/src/
  platform/        ← shell genérico (AppShell, routing dinâmico)
  modules/         ← UI de cada módulo (lazy loaded)
  shared/          ← componentes reutilizáveis entre módulos
design/            ← tokens de design, UX decisions, personas
infra/             ← Prefect, Docker, migrations da plataforma
docs/              ← este documento + ADRs por domínio
```

## ADRs por Domínio

| ADR | Domínio | Arquivo |
|-----|---------|---------|
| 002 | Núcleo da plataforma | [ADR-002-platform-core.md](ADR-002-platform-core.md) |
| 003 | Contrato de módulo | [ADR-003-module-contract.md](ADR-003-module-contract.md) |
| 004 | Frontend shell | [ADR-004-frontend-shell.md](ADR-004-frontend-shell.md) |
| 005 | Design system | [ADR-005-design-system.md](ADR-005-design-system.md) |
| 006 | Infra e CI/CD | [ADR-006-infra-cicd.md](ADR-006-infra-cicd.md) |
| 007 | Estratégia de banco | [ADR-007-database-strategy.md](ADR-007-database-strategy.md) |

## Consequências

**Fica mais fácil:**
- Adicionar módulo: criar pasta + preencher `manifest.py` — zero impacto no core
- Isolar falha: módulo com erro não interrompe os demais
- Onboarding: guia em [`docs/modules/COMO-CRIAR-MODULO.md`](../modules/COMO-CRIAR-MODULO.md)
- Deploys independentes por módulo via `release-module.yml`

**Fica mais difícil:**
- Dependência cruzada entre módulos deve passar pelo `core/` (disciplina de equipe)
- PRs devem respeitar a fronteira dos slices — revisor precisa verificar vazamento

**Revisitar quando:**
- Houver 10+ módulos: avaliar se `module-registry.json` migra para tabela no Supabase
- Volume de GeoJSONs crescer: avaliar PMTiles/GeoArrow em vez de GeoJSON flat

## Plano de Migração

Seis fases incrementais detalhadas em [`docs/MIGRATION-PLAN.md`](../MIGRATION-PLAN.md).
Cada fase é independente, testável e commitável sem impacto na produção.
