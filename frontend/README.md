# Frontend — Dashboard de Desmatamento PI

React 18 + TypeScript + Vite | MapLibre GL JS + Recharts + Tailwind CSS + Zustand

---

## Desenvolvimento local

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de produção em dist/
npm run preview   # preview do build
npm run lint      # eslint
npm test          # vitest (testes unitários)
```

## Variáveis de ambiente

Copiar `frontend/.env.example` para `frontend/.env`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...    # chave pública (anon) — seguro no bundle
```

> **NUNCA** usar `SUPABASE_SERVICE_KEY` no frontend.

## Abas do dashboard

| Aba | Arquivo | Conteúdo |
|-----|---------|----------|
| Visão Executiva | `ExecutivaPage.tsx` | KPIs globais, IPI por ano, mapa geral |
| Panorama Municipal | `MunicipalPage.tsx` | Ranking municípios, gráficos por classificação |
| Evolução Temporal | `TemporalPage.tsx` | Tendências mensais, comparativos anuais |
| Validação PRODES | `ProdesPage.tsx` | Concordância MapBiomas × PRODES-Cerrado/INPE |
| MATOPIBA | `MatopibaPage.tsx` | Recorte dos 26 municípios (Dec. 8.447/2015) |
| Gestão de Dados | `DadosPage.tsx` | Status pipeline, fontes, histórico de execuções |

## Estratégia de dados (3 níveis de fallback)

```
1. Supabase live       → TanStack Query, staleTime configurado por endpoint
2. /public/data/*.json → fallback estático (gerado pelo pipeline)
3. constants.ts        → constantes TypeScript hardcoded (última linha de defesa)
```

## Estrutura

```
src/
├── pages/          # 6 abas (ver tabela acima)
├── components/
│   ├── Map/        # MapView.tsx — MapLibre GL JS
│   ├── Filters/    # FilterPanel.tsx — Zustand store
│   ├── ErrorBoundary.tsx
│   └── StatusBadge.tsx
├── lib/
│   ├── supabase.ts # cliente Supabase + interfaces TypeScript
│   ├── queries.ts  # funções de query (getAlertas, getAgregado, etc.)
│   ├── hooks.ts    # hooks TanStack Query (useAlertas, useAgregado, etc.)
│   └── constants.ts # fallback nível 3 + helpers (calcAutTotal)
└── store/
    └── useAppStore.ts # Zustand — filtros globais, aba ativa
```

## Deploy

Deploy automático via GitHub Actions (`deploy-frontend.yml`):
- Push para `main` com mudanças em `frontend/` → deploy de produção Vercel
- Pull Requests → preview deployment automático

Secrets necessários no GitHub:
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
