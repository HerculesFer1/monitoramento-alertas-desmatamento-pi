# ADR-006: Infraestrutura e CI/CD

**Status:** Aceito
**Data:** 2026-05-24
**Depende de:** [ADR-001](ADR-001-visao-geral.md)

## Estrutura de Infra

```
infra/
├── prefect/
│   ├── platform_flow.py   ← flow genérico: itera módulos do registry
│   └── prefect.yaml       ← 3 deployments: mensal, prodes-anual, dry-run
├── supabase/
│   └── migrations/        ← schema compartilhado da plataforma
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

## Prefect Cloud v3 — Deployments

| Deployment | Cron (UTC) | Módulos executados |
|------------|-----------|-------------------|
| `mensal` | `0 3 1 * *` | Todos com `schedule != null` |
| `prodes-anual` | `0 3 1 10 *` | Somente `prodes_cerrado` |
| `dry-run` | Manual | Todos com `config.dry_run=True` |

`platform_flow.py` usa `platform.registry` para descobrir módulos dinamicamente.
Adicionar novo módulo com schedule → aparece no fluxo mensal automaticamente.

## Docker — Services

```yaml
# infra/docker/docker-compose.yml
services:
  pipeline:  # roda orchestrator sem upload (validação local)
  upload:    # só o uploader (reprocessar sem re-executar o pipeline)
  full:      # pipeline + upload completo
```

## GitHub Actions — Workflows

| Arquivo | Trigger | O que valida |
|---------|---------|--------------|
| `ci.yml` | push / PR | tsc build + ruff + pytest + sql lint + manifest validation |
| `deploy-frontend.yml` | push main / PR | Vercel production / preview |
| `update-data.yml` | schedule + manual | dispatcher genérico por módulo |
| `release-module.yml` | PR com `modules/**` | manifest.py válido antes do merge |

## Validação de Manifest — Step no ci.yml

```yaml
- name: Validate module manifests
  run: |
    python -c "
    from platform.registry import ModuleRegistry
    r = ModuleRegistry('modules/')
    r.discover()
    print(f'OK: {len(r.list())} módulos válidos')
    "
```

## Variáveis de Ambiente

| Variável | Local | Uso |
|----------|-------|-----|
| `SUPABASE_URL` | `.env` + GitHub Secrets | uploader + frontend |
| `SUPABASE_SERVICE_KEY` | `.env` + GitHub Secrets | uploader (escrita) |
| `SUPABASE_ANON_KEY` | `.env` + Vercel env vars | frontend (leitura pública) |
| `PREFECT_API_KEY` | GitHub Secrets | Prefect Cloud auth |
| `MAPBIOMAS_TOKEN` | `.env` | módulo alertas_mapbiomas |

**Invariante:** `SUPABASE_SERVICE_KEY` nunca no frontend — upload sempre via `platform/uploader.py`.

## Deployment de Novo Módulo (fluxo completo)

```
1. Criar modules/<nome>/ + manifest.py (enabled: True)
       ↓
2. Abrir PR → release-module.yml valida manifest e imports
       ↓
3. Merge → ci.yml roda testes de integração
       ↓
4. Próxima execução Prefect descobre módulo automaticamente
       ↓
5. Frontend Vercel rebuild → sidebar atualizada com novo módulo
```

## Arquivos a Mover (Fase 5 da migração)

| Origem | Destino |
|--------|---------|
| `Dockerfile` | `infra/docker/Dockerfile` |
| `docker-compose.yml` | `infra/docker/docker-compose.yml` |
| `infra/prefect/pipeline_flow.py` | `infra/prefect/platform_flow.py` |
