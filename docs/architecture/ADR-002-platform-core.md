# ADR-002: Núcleo da Plataforma (platform/)

**Status:** Aceito
**Data:** 2026-05-24
**Depende de:** [ADR-001](ADR-001-visao-geral.md)

## Responsabilidade

`platform/` é o único código que roda independente de qualquer módulo de análise.
**Regra absoluta:** nenhum arquivo em `platform/` importa de `modules/`.

## Estrutura

```
platform/
├── __init__.py
├── registry.py        ← descobre e carrega módulos via manifest.py
├── orchestrator.py    ← itera sobre módulos registrados e chama run()
├── uploader.py        ← upsert para Supabase (centraliza toda conexão DB)
├── spatial_core.py    ← funções geoespaciais reutilizáveis
├── quality_core.py    ← framework T1–T9 reutilizável entre módulos
├── constants.py       ← constantes globais → gera constants.json (bridge TS)
├── constants.json     ← gerado automaticamente; importado pelo Vite
└── utils.py           ← helpers (elapsed, logging, formatters)
```

## registry.py — Interface Pública

```python
from platform.registry import ModuleRegistry

registry = ModuleRegistry(modules_dir="modules/")
registry.discover()                         # lê manifest.py de cada subpasta
registry.list()                             # → [{"id": "alertas_mapbiomas", ...}]
registry.get("alertas_mapbiomas")           # → módulo carregado
registry.export_json("module-registry.json")# → lido pelo frontend
```

**Regras de descoberta:**
1. Varrer `modules/*/manifest.py`
2. Importar `MODULE_MANIFEST` de cada arquivo
3. Ignorar módulos com `"enabled": False`
4. Ignorar pastas que começam com `_` (ex: `_template`)

## orchestrator.py — Interface Pública

```python
from platform.orchestrator import run_all, run_one

# Roda todos os módulos habilitados em ordem de prioridade
result = run_all(config={"dry_run": False})

# Roda apenas um módulo pelo ID
result = run_one("alertas_mapbiomas", config={})
```

Ordem de execução: campo `manifest["priority"]` (inteiro, menor = primeiro).
Módulos com mesma prioridade rodam sequencialmente (sem paralelismo por padrão).

## uploader.py — Interface Pública

```python
from platform.uploader import upload_geodataframe, upload_json

upload_geodataframe(gdf, table="alertas_classificados", if_exists="upsert")
upload_json(data, table="agregado_municipios", if_exists="upsert")
```

Encapsula toda lógica de conexão Supabase, retry e logging.
Módulos **não** importam `supabase` diretamente — usam esta interface.

## spatial_core.py — Funções Disponíveis

```python
from platform.spatial_core import fix_geometry, reproject, area_ha, clip_to_state

gdf = fix_geometry(gdf)                    # corrige geometrias inválidas
gdf = reproject(gdf, to_crs="EPSG:5880")  # projeção equivalente para área
ha  = area_ha(gdf)                         # calcula área em hectares
gdf = clip_to_state(gdf, uf="PI")          # recorta ao estado do Piauí
```

## Origem de Cada Arquivo (migração)

| Arquivo novo | Origem |
|---|---|
| `platform/utils.py` | `pipeline/utils.py` |
| `platform/spatial_core.py` | `pipeline/spatial.py` |
| `platform/uploader.py` | `pipeline/_upload_supabase.py` |
| `platform/constants.py` | `pipeline/constants.py` |
| `platform/quality_core.py` | `pipeline/quality.py` (parte reutilizável) |

## Regras de Evolução

- Nova função geoespacial genérica → `spatial_core.py`
- Nova constante usada em mais de um módulo → `constants.py`
- Nova lógica de upload/retry → `uploader.py`
- Lógica específica de um módulo → **nunca** em `platform/`
