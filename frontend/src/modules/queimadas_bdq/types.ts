/**
 * types.ts — Módulo queimadas_bdq
 * Espelha o schema Supabase (009_queimadas_bdq.sql).
 * Reutiliza ClassePrioridade, BBox e CLASSE_COLORS de areas_prioritarias.
 */

export type { ClassePrioridade, BBox } from '../areas_prioritarias/types'
export { CLASSE_COLORS, CLASSE_LABELS } from '../areas_prioritarias/types'

// ── View IDs ──────────────────────────────────────────────────────────────────

export type QueimadasViewId =
  | 'visao_geral'
  | 'classes'
  | 'municipal'
  | 'temporal'
  | 'serie_anual'
  | 'recorrencia'
  | 'metodologia'

// ── Série anual (multi-ano 2022–2025) ─────────────────────────────────────────

export interface QueimadasSerieAnualItem {
  ano:                  number
  area_ha:              number
  n_cicatrizes:         number
  municipios_afetados:  number
  area_prioritaria_ha:  number
  pct_prioritaria:      number
}

// ── Recorrência de fogo (IRF) ────────────────────────────────────────────────

export interface QueimadasRecorrenciaItem {
  municipio_cod:  string
  municipio_nome: string
  anos_com_fogo:  number
  irf:            number   // 0..1
  area_total_ha:  number
}

// ── Escala de cor choropleth (área queimada) ──────────────────────────────────

/** Escala logarítmica: 0 ha → neutro, >10.000 ha → crítico */
export const QUEIMADA_SCALE: [number, string][] = [
  [0,      '#F5F5F5'],
  [1,      '#FEE8C8'],
  [500,    '#FDBB84'],
  [2000,   '#FC8D59'],
  [5000,   '#E34A33'],
  [10000,  '#B30000'],
]

export const QUEIMADA_LAYER_IDS = {
  MUNICIPIOS_LINE:   'qb-municipios-line',
  QUEIMADAS_FILL:    'qb-queimadas-fill',
  PRIORITARIAS_LINE: 'qb-prioritarias-outline',
  SELECTED_FILL:     'qb-municipio-selected',
} as const

// ── KPIs e resposta de visão geral ────────────────────────────────────────────

export interface QueimadasKpis {
  area_queimada_total_ha: number
  n_cicatrizes_total:     number
  municipios_afetados:    number
  area_prioritaria_ha:    number   // classes 4 + 5
  pct_em_prioritarias:    number
  ano:                    number
}

export interface QueimadasPorClasse {
  classe_prioridade: 1 | 2 | 3 | 4 | 5
  prioridade_label:  string
  area_queimada_ha:  number
  n_cicatrizes:      number
  pct_do_total:      number
}

export interface QueimadasPorMes {
  mes:          number  // 1..12
  area_ha:      number
  n_cicatrizes: number
}

export interface QueimadasVisaoGeralResponse {
  kpis:       QueimadasKpis
  por_classe: QueimadasPorClasse[] | null
  por_mes:    QueimadasPorMes[]    | null
}

// ── Série temporal ────────────────────────────────────────────────────────────

export interface QueimadasTemporalItem {
  mes:          number
  area_ha:      number
  n_cicatrizes: number
  por_classe:   Record<string, number>  // {"1": 0, "2": 10.5, ...}
}

// ── Município (choropleth + card) ─────────────────────────────────────────────

export interface QueimadasMunicipio {
  municipio_cod:          string
  municipio_nome:         string
  area_queimada_total_ha: number
  n_cicatrizes_total:     number
  mes_pico:               number | null
  classe_max_queimada:    number | null
  pct_area_prioritaria:   number | null
  pct_queimada_estado:    number | null
  area_ha_por_classe:     Record<string, number> | null
  bbox:                   [[number, number], [number, number]] | null
  geom:                   object | null
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export interface QueimadasRankingItem {
  rank:                   number
  municipio_cod:          string
  municipio_nome:         string
  area_queimada_total_ha: number
  n_cicatrizes_total:     number
  classe_max_queimada:    number | null
  pct_area_prioritaria:   number | null
  mes_pico:               number | null
}

// ── Meses (helpers de UI) ─────────────────────────────────────────────────────

export const MESES_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr',
  5: 'Mai', 6: 'Jun', 7: 'Jul', 8: 'Ago',
  9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
