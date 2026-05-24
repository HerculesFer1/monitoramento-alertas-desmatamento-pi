# Plano de Migração — v1 → v2 (Plataforma Modular)

Seis fases incrementais. Cada fase é commitável de forma independente.
Status: 🔲 Pendente | 🔄 Em andamento | ✅ Concluído

## Fase 0 — Documentação e Configuração
**Duração:** 1 dia

- ✅ Criar `docs/architecture/ADR-001` a `ADR-007`
- ✅ Criar `docs/modules/COMO-CRIAR-MODULO.md`
- ✅ Criar `docs/MIGRATION-PLAN.md`
- ✅ Criar `scripts/notificar_fase.ps1`
- ✅ Configurar hook Stop em `.claude/settings.local.json`
- ✅ Criar `modules/_template/` (manifest, downloader, processor, migrations, tests)
- 🔲 **Commit:** `feat: phase-0 — docs architecture + hooks + module template`

## Fase 1 — Núcleo da Plataforma
**Duração:** 2 dias | **Depende de:** Fase 0

- 🔲 Criar `platform/__init__.py`, `registry.py`, `orchestrator.py`
- 🔲 `git mv pipeline/utils.py platform/utils.py` + ajustar imports
- 🔲 `git mv pipeline/spatial.py platform/spatial_core.py` + ajustar imports
- 🔲 `git mv pipeline/_upload_supabase.py platform/uploader.py` + ajustar imports
- 🔲 `git mv pipeline/constants.py platform/constants.py`
- 🔲 Criar `tests/test_registry.py`
- 🔲 `pytest tests/` → verde
- 🔲 **Commit:** `feat: phase-1 — platform core`

## Fase 2 — Migrar Módulos Backend
**Duração:** 3 dias | **Depende de:** Fase 1

Ordem (menor dependência → maior):

- 🔲 `modules/asvs_sinaflor/` ← `_baixar_asvs.py` + parsers ASV
- 🔲 `modules/deradsa_semarh/` ← `_baixar_deradsa_storage.py`
- 🔲 `modules/prodes_cerrado/` ← `_baixar_prodes.py` + `validation.py`
- 🔲 `modules/municipios_ibge/` ← parte de `aggregate.py`
- 🔲 `modules/alertas_mapbiomas/` ← `_baixar_mapbiomas.py` + `classify.py` + `indicators.py`

Para cada módulo: criar `manifest.py`, mover arquivos, criar `migrations/`, mover testes.

Limpeza pós-migração:
- 🔲 `git rm pipeline/__main__.py`
- 🔲 `git rm pipeline/_baixar_*.py`
- 🔲 `pytest modules/` → verde
- 🔲 **Commit:** `feat: phase-2 — migrate all backend modules`

## Fase 3 — Frontend Modular Shell
**Duração:** 3 dias | **Depende de:** Fase 2

- 🔲 Criar `frontend/src/platform/layout/` (AppShell, Sidebar, TabRouter)
- 🔲 `git mv frontend/src/store → frontend/src/platform/store`
- 🔲 `git mv frontend/src/lib → frontend/src/platform/lib`
- 🔲 Criar `frontend/src/shared/components/` (BaseMap, Charts, Filters)
- 🔲 Criar `frontend/src/modules/alertas_mapbiomas/` (4 views)
- 🔲 Criar `frontend/src/modules/prodes_cerrado/`
- 🔲 `git rm frontend/src/pages/`
- 🔲 `npm run build && npm run test` → verde
- 🔲 **Commit:** `feat: phase-3 — modular frontend shell`

## Fase 4 — Design System
**Duração:** 1 dia | **Pode rodar em paralelo com Fase 5**

- 🔲 Criar `design/tokens/colors.json`, `typography.json`, `spacing.json`
- 🔲 Criar `design/ux/personas.md`
- 🔲 Criar `design/ux/decisions/UDR-001-navegacao-modular.md`
- 🔲 Criar `design/ux/flows/alerta-classification-flow.md`
- 🔲 **Commit:** `feat: phase-4 — design system tokens`

## Fase 5 — Limpeza de Infraestrutura
**Duração:** 1–2 dias | **Depende de:** Fases 1–3

- 🔲 `git mv "base de dados/" data/raw/`
- 🔲 `git mv Resultado/ data/output/`
- 🔲 `git mv rodar_*.ps1 _check_env.py _gerar_*.py scripts/`
- 🔲 `git mv Dockerfile docker-compose.yml infra/docker/`
- 🔲 `git mv CLAUDE.md.md docs/architecture/DECISIONS.md`
- 🔲 Atualizar `.github/workflows/ci.yml` (validação de manifests)
- 🔲 Criar `.github/workflows/release-module.yml`
- 🔲 Verificar: root só tem `.env.example`, `README.md`, `environment.yml`, `pyproject.toml`
- 🔲 `pytest && npm run build` → verde
- 🔲 **Commit:** `feat: phase-5 — infra cleanup + ci/cd update`

## Fase 6 — Validação Final
**Duração:** 1 dia | **Depende de:** Fases 0–5

- 🔲 Rodar `/verify` — app completo funcionando
- 🔲 Rodar `/code-review` no diff total
- 🔲 Atualizar `README.md` com nova estrutura
- 🔲 Criar `ONBOARDING.md` (dev produtivo em ≤ 15 min)
- 🔲 `git tag v2.0.0 -m "Platform modular architecture"`
- 🔲 **Commit:** `feat: phase-6 — validation + final docs`

## Tabela de Limpeza por Fase

| Fase | Remover | Substituído por |
|------|---------|-----------------|
| 1 | `pipeline/utils.py`, `pipeline/spatial.py` | `platform/` |
| 1 | `pipeline/_upload_supabase.py` | `platform/uploader.py` |
| 2 | `pipeline/__main__.py` | `platform/orchestrator.py` |
| 2 | `pipeline/_baixar_*.py` | `modules/*/downloader.py` |
| 3 | `frontend/src/pages/*.tsx` | `frontend/src/modules/` |
| 5 | `base de dados/`, `Resultado/` | `data/raw/`, `data/output/` |
| 5 | Scripts soltos no root | `scripts/` |
