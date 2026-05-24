# UDR-001: Navegação por Abas Horizontais no Topo

**Status:** Accepted
**Data:** 2026-05-24
**Personas:** P1 (Analista), P2 (Gestor)

## Contexto

O sistema possui 6 visões principais correspondentes a 3 módulos de análise
(alertas_mapbiomas com 4 views, prodes_cerrado, dados). O usuário precisa transitar
rapidamente entre as visões durante sessões de análise ou apresentação.

## Decisão

Usar navegação por **abas horizontais persistentes no topo** (topbar), com:
- Ícone + label curto (máx. 20 chars)
- Destaque visual da aba ativa (borda + fundo elevado)
- Lazy-loading de cada view (`React.lazy` + `Suspense`)
- Estado da aba ativa no Zustand (sobrevive a re-renders, não persiste entre sessões)

## Alternativas consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Sidebar lateral | Mais abas sem overflow | Rouba espaço de mapa/gráficos |
| Dropdown menu | Compacto | 2 cliques para navegar — ruim para P2 em apresentações |
| Rotas URL (React Router) | Deep-link para estado | Complexidade sem ganho real (não há links externos) |
| Abas na topbar (escolhido) | 1 clique, sempre visível | Overflow em telas < 1024px |

## Consequências

- Em telas < 900px as abas colapsam — aceitável, uso mobile não é caso primário
- Adicionar novo módulo requer editar `AppShell.tsx` (TABS array) — na Fase 6 será via auto-discovery
- Sem histórico de navegação via botão "voltar" do browser — aceitável para dashboard interno
