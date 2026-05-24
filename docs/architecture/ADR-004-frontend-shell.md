# ADR-004: Frontend Shell Modular

**Status:** Aceito
**Data:** 2026-05-24
**Depende de:** [ADR-001](ADR-001-visao-geral.md), [ADR-003](ADR-003-module-contract.md)

## Estrutura

```
frontend/src/
├── core/                    ← shell genérico (não toca ao adicionar módulo)
│   ├── layout/
│   │   ├── AppShell.tsx         ← layout raiz: sidebar + topbar + conteúdo
│   │   ├── Sidebar.tsx          ← gerada a partir de module-registry.json
│   │   └── TabRouter.tsx        ← lazy loading por módulo
│   ├── store/
│   │   └── useAppStore.ts       ← Zustand: filtros globais, módulo ativo
│   └── lib/
│       ├── supabase.ts
│       ├── queries.ts           ← React Query base
│       └── hooks.ts
│
├── modules/                     ← 1 pasta por módulo (lazy loaded)
│   ├── alertas_mapbiomas/
│   │   ├── index.tsx            ← entry point (export default + lazy boundary)
│   │   ├── ExecutivaView.tsx
│   │   ├── MunicipalView.tsx
│   │   ├── TemporalView.tsx
│   │   ├── MatopibaView.tsx
│   │   └── components/
│   ├── prodes_cerrado/
│   │   ├── index.tsx
│   │   └── ProdesView.tsx
│   └── _template/               ← copiar para novo módulo
│       ├── index.tsx
│       └── MainView.tsx
│
└── shared/                      ← componentes reutilizáveis entre módulos
    ├── components/
    │   ├── Map/BaseMap.tsx      ← MapLibre GL base
    │   ├── Charts/              ← BarChart, LineChart, PieChart (Recharts)
    │   ├── Filters/FilterPanel.tsx
    │   ├── DataTable.tsx
    │   ├── StatusBadge.tsx
    │   └── ErrorBoundary.tsx
    └── types/
        └── module.d.ts          ← ModuleManifest, ModuleEntry types
```

## Descoberta de Módulos

`core/registry.py` gera `module-registry.json` durante o build:

```json
[
  {
    "id": "alertas_mapbiomas",
    "name": "Alertas MapBiomas",
    "icon": "🌿",
    "frontend_module": "alertas_mapbiomas",
    "enabled": true
  }
]
```

`Sidebar.tsx` importa este JSON e renderiza um item de navegação por entrada.
`TabRouter.tsx` carrega `modules/<frontend_module>/index.tsx` via `React.lazy()`.

## Padrão de Lazy Loading

```tsx
// core/layout/TabRouter.tsx
const modules = import.meta.glob('../modules/*/index.tsx')

function loadModule(id: string) {
  return React.lazy(() => modules[`../modules/${id}/index.tsx`]())
}
```

Cada módulo carrega apenas quando o usuário navega até ele — bundle split automático.

## Origem dos Arquivos (migração)

| Arquivo novo | Origem |
|---|---|
| `core/store/useAppStore.ts` | `src/store/useAppStore.ts` |
| `core/lib/supabase.ts` | `src/lib/supabase.ts` |
| `core/lib/queries.ts` | `src/lib/queries.ts` |
| `core/lib/hooks.ts` | `src/lib/hooks.ts` |
| `modules/alertas_mapbiomas/` | `src/pages/Executiva*, Municipal*, Temporal*, Matopiba*` |
| `modules/prodes_cerrado/` | `src/pages/ProdesPage.tsx` |
| `shared/components/FilterPanel.tsx` | `src/components/Filters/FilterPanel.tsx` |

## Regras de Evolução

- Novo módulo → criar `frontend/src/modules/<id>/index.tsx` + manifest no backend
- Componente usado em >1 módulo → `shared/components/`
- Componente específico de módulo → `modules/<id>/components/`
- Estado global (filtros de ano, município) → `core/store/useAppStore.ts`
- Estado local de módulo → dentro do próprio módulo (não vazar para o shell)
