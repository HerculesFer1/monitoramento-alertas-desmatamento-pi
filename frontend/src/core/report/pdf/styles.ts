/**
 * styles.ts — Constantes de estilo para os PDFs gerados.
 *
 * Padrão visual alinhado ao Dashboard:
 *   - Inter para texto/títulos
 *   - JetBrains Mono para números (valores, tabelas, dados)
 *   - Paleta institucional CGEO/SEMARH-PI
 */

// Cores institucionais (mesmas dos modulos do dashboard)
export const COR = {
  texto:           '#171717',
  textoSec:        '#525252',
  textoSuave:      '#737373',
  fundoCabecalho:  '#F5F5F5',
  fundoSecao:      '#FAFAFA',
  separador:       '#E5E5E5',
  destaqueVerde:   '#10B981',
  destaqueVermelho:'#EF4444',
  destaqueAmbar:   '#F59E0B',
  destaqueLaranja: '#F97316',
  destaqueAzul:    '#6366F1',
  // Cores tematicas por modulo (espelha MODULE_TITLES do AppShell)
  modulo: {
    mapbiomas:          '#F59E0B',
    prodes:             '#10B981',
    matopiba:           '#D97706',
    areas_prioritarias: '#10B981',
    queimadas_bdq:      '#EF4444',
    dados:              '#94A3B8',
  } as const,
} as const

// Pagina A4 em pontos (jsPDF unit: 'pt')
export const A4 = {
  largura:  595.28,
  altura:   841.89,
  margem:   42,           // ~ 15 mm
  margemH:  42,
  margemFooter: 28,
} as const

// Tamanhos tipograficos (em pt)
export const FONTE = {
  // Inter — texto institucional
  capa_titulo:        28,
  capa_subtitulo:     14,
  pagina_titulo:      18,
  secao_titulo:       12,
  corpo:              10,
  corpo_pequeno:      9,
  // JetBrains Mono — numeros
  numero_grande:      24,
  numero_medio:       14,
  numero_tabela:      9,
  // Misc
  footer:             7,
  header_pequeno:     8,
} as const

// Nomes registrados no jsPDF apos addFont()
export const FONT = {
  inter:        'Inter',
  interBold:    'Inter-Bold',
  mono:         'JetBrainsMono',
  monoBold:     'JetBrainsMono-Bold',
} as const
