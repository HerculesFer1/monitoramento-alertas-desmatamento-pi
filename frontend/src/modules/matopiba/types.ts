/**
 * types.ts — Módulo MATOPIBA
 * Panorama transversal: mesmo schema dos outros módulos, recortado nos
 * 33 municípios da Portaria MAPA 244/2015 · Decreto Federal 8.447/2015.
 *
 * Espelha as RPCs criadas em infra/supabase/migrations/015_matopiba_panorama.sql.
 */

import type {
  QueimadasKpis, QueimadasPorClasse, QueimadasPorMes, QueimadasRankingItem,
} from '../queimadas_bdq/types'
import type {
  ClasseResumo, KpisDeter, PeriodCoverage,
} from '../areas_prioritarias/types'

// ── View IDs (espelha MODULE_VIEWS[matopiba] em AppShell.tsx) ──────────────
export type MatopibaViewId =
  | 'visao_geral'
  | 'alertas'
  | 'prodes'
  | 'queimadas'
  | 'areas_prioritarias'

// ── Identidade visual ─────────────────────────────────────────────────────
export const MAT_COLOR    = '#F59E0B'
export const MAT_COLOR_2  = '#D97706'
export const MAT_BG       = 'rgba(245,158,11,.1)'
export const MAT_BG_HARD  = 'rgba(245,158,11,.25)'

// ── Queimadas: variantes _matopiba ────────────────────────────────────────
export interface MatopibaQueimadasKpis extends QueimadasKpis {
  recorte: 'MATOPIBA-PI'
  n_municipios_recorte: number
}

export interface MatopibaQueimadasVisaoGeral {
  kpis:       MatopibaQueimadasKpis
  por_classe: QueimadasPorClasse[] | null
  por_mes:    QueimadasPorMes[]    | null
}

export type MatopibaQueimadasTemporal = {
  mes:          number
  area_ha:      number
  n_cicatrizes: number
  por_classe:   Record<string, number>
}[]

export type MatopibaQueimadasRanking = QueimadasRankingItem[]

// ── Áreas Prioritárias: variantes _matopiba ───────────────────────────────
export interface MatopibaApKpisProdes {
  area_floresta_total_ha:  number
  area_desmat_total_ha:    number
  pct_desmat_recorte:      number
  total_municipios:        number
  biomassa_total_tc:       number | null
  n_municipios_classe_max: number
}

export interface MatopibaApRecorte {
  nome:         string
  base_legal:   string
  n_municipios: number
}

export interface MatopibaApVisaoGeral {
  periodo_cobertura: PeriodCoverage | null
  kpis: {
    prodes:  MatopibaApKpisProdes
    deter:   KpisDeter
    recorte: MatopibaApRecorte
  }
  por_classe: ClasseResumo[]
}

export interface MatopibaApRankingItem {
  municipio_cod:         string
  municipio_nome:        string
  classe_max_prioridade: 1 | 2 | 3 | 4 | 5 | null
  area_total_ha:         number
  area_floresta_ha:      number
  area_desmat_ha:        number
  ha_deter_recente:      number
  pct_floresta_estado:   number
  biomassa_floresta_tc:  number
  agb_medio_tc_ha:       number
}
