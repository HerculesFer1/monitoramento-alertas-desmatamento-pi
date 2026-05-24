# ADR-005: Design System

**Status:** Aceito
**Data:** 2026-05-24
**Depende de:** [ADR-004](ADR-004-frontend-shell.md)

## Estrutura

```
design/
├── tokens/
│   ├── colors.json      ← cores das 4 classes + paleta da plataforma
│   ├── typography.json  ← fontes, tamanhos, pesos
│   └── spacing.json     ← grid, espaçamentos, breakpoints
├── components/          ← stories/screenshots dos componentes shared
├── ux/
│   ├── personas.md      ← 3 personas principais
│   ├── decisions/       ← UX Decision Records (UDR-*.md)
│   └── flows/           ← fluxos de usuário por módulo
└── mockups/             ← wireframes (PNG ou links Figma)
```

## Tokens de Cor — Classes de Desmatamento

```json
{
  "class-colors": {
    "IRREGULAR":              { "bg": "#ef4444", "text": "#fff", "border": "#dc2626" },
    "AUTORIZADO":             { "bg": "#22c55e", "text": "#fff", "border": "#16a34a" },
    "AUTORIZADO_PARCIALMENTE":{ "bg": "#f59e0b", "text": "#fff", "border": "#d97706" },
    "REGULARIZADO":           { "bg": "#3b82f6", "text": "#fff", "border": "#2563eb" }
  },
  "platform": {
    "primary":   "#1e3a5f",
    "secondary": "#2d6a4f",
    "surface":   "#f8fafc",
    "border":    "#e2e8f0",
    "text":      "#0f172a",
    "muted":     "#64748b"
  }
}
```

## Tokens de Tipografia

```json
{
  "font-family": {
    "sans": ["Inter", "system-ui", "sans-serif"],
    "mono": ["JetBrains Mono", "monospace"]
  },
  "font-size": {
    "xs": "0.75rem",  "sm": "0.875rem", "base": "1rem",
    "lg": "1.125rem", "xl": "1.25rem",  "2xl": "1.5rem"
  },
  "font-weight": { "normal": 400, "medium": 500, "semibold": 600, "bold": 700 }
}
```

## Tokens de Espaçamento

```json
{
  "spacing": { "1": "0.25rem", "2": "0.5rem", "4": "1rem", "6": "1.5rem", "8": "2rem" },
  "breakpoints": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" },
  "border-radius": { "sm": "0.25rem", "md": "0.5rem", "lg": "0.75rem", "full": "9999px" }
}
```

## Componentes Shared — Contrato Visual

| Componente | Props obrigatórias | Notas |
|------------|-------------------|-------|
| `StatusBadge` | `classificacao: ClassType` | Usa tokens de cor das classes |
| `BaseMap` | `geojson?: GeoJSON` | MapLibre GL, estilo customizado |
| `BarChart` | `data: ChartEntry[]` | Recharts, cores das classes |
| `LineChart` | `data: TimeSeriesEntry[]` | Recharts, eixo temporal |
| `FilterPanel` | — | Lê/escreve no `useAppStore` |
| `DataTable` | `columns, rows` | Ordenação + paginação incluídas |
| `ErrorBoundary` | `children` | Isola falha por módulo na UI |

## Personas (detalhadas em `design/ux/personas.md`)

| Persona | Perfil | Prioridade |
|---------|--------|-----------|
| Analista GIS | Usa mapa e dados brutos; quer exportação e filtros avançados | Alta |
| Gestor Ambiental | Quer KPIs e tendências; não lida com dados técnicos | Alta |
| Técnico de Campo | Acessa via celular; precisa de dados rápidos e legíveis | Média |

## UX Decision Records

| Arquivo | Decisão registrada |
|---------|-------------------|
| `UDR-001-navegacao-modular.md` | Sidebar vertical vs. tabs horizontais |

## Regras de Evolução

- Novo token de cor → `design/tokens/colors.json` + atualizar Tailwind config
- Nova decisão de UX → criar `UDR-NNN-titulo.md` em `design/ux/decisions/`
- Novo componente shared com visual definido → criar story em `design/components/`
