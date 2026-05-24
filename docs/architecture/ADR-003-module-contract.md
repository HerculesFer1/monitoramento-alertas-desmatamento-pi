# ADR-003: Contrato de Módulo (manifest.py)

**Status:** Aceito
**Data:** 2026-05-24
**Depende de:** [ADR-002](ADR-002-platform-core.md)

## O Contrato

Todo módulo em `modules/<nome>/` deve ter um `manifest.py` com `MODULE_MANIFEST` e `run()`:

```python
# modules/<nome>/manifest.py

MODULE_MANIFEST = {
    # Identidade
    "id":          "nome_unico_snake_case",   # obrigatório, imutável após deploy
    "name":        "Nome Legível",             # obrigatório
    "version":     "1.0.0",                   # semver
    "description": "Uma linha do que faz.",    # obrigatório

    # Metadados de UI
    "icon":            "🌿",
    "frontend_module": "nome_unico",           # pasta em frontend/src/modules/
    "tags":            ["desmatamento"],

    # Orquestração
    "schedule":  "0 3 1 * *",    # cron UTC; None = só manual
    "priority":  10,              # ordem de execução (menor = primeiro)
    "enabled":   True,            # False = ignorado pelo registry

    # Outputs
    "outputs": [                  # tabelas Supabase que este módulo escreve
        "alertas_classificados",
        "agregado_municipios",
    ],
}


def run(config: dict) -> dict:
    """
    Entry point chamado pelo core/orchestrator.py.

    Args:
        config: dict com chaves opcionais:
            dry_run (bool)  — processar sem fazer upload
            ano (int)       — restringir ao ano especificado
            verbose (bool)  — logging detalhado

    Returns:
        dict com:
            status  — "ok" | "error"
            records — int (registros processados)
            message — str (resumo legível)
    """
    ...
    return {"status": "ok", "records": n, "message": f"{n} registros processados"}
```

## Campos: Obrigatórios vs. Opcionais

| Campo | Obrig. | Tipo | Default |
|-------|:---:|------|---------|
| `id` | Sim | str | — |
| `name` | Sim | str | — |
| `version` | Sim | str | — |
| `description` | Sim | str | — |
| `enabled` | Sim | bool | — |
| `outputs` | Sim | list[str] | — |
| `run()` | Sim | callable | — |
| `icon` | Não | str | `"📊"` |
| `schedule` | Não | str\|None | `None` |
| `priority` | Não | int | `50` |
| `frontend_module` | Não | str | igual ao `id` |
| `tags` | Não | list[str] | `[]` |

## Invariantes (nunca violar)

1. `id` é imutável após ir para produção — chave em logs, DB e URLs
2. `run()` é **idempotente**: mesmos dados → mesmo resultado
3. `run()` usa `logging`, não `print()` direto
4. Módulo importa apenas de `core.*` — nunca de outro `modules.*`
5. `enabled: False` → módulo coexiste no repo sem afetar o runtime

## Estrutura de Pastas do Módulo

```
modules/<nome>/
├── __init__.py
├── manifest.py        ← contrato (este documento)
├── downloader.py      ← baixa dados brutos
├── processor.py       ← transforma + classifica
├── migrations/
│   └── 001_schema.sql
└── tests/
    ├── __init__.py
    └── test_processor.py
```

## Template

Copie `modules/_template/` para começar.
Guia passo a passo: [`docs/modules/COMO-CRIAR-MODULO.md`](../modules/COMO-CRIAR-MODULO.md).
