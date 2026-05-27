// @ts-nocheck
/**
 * types.ts — Módulo areas_prioritarias
 * Tipos TypeScript para o cruzamento PRODES × Prioridade.
 * Espelha o schema Supabase (008_areas_prioritarias.sql v2).
 */

// ── Tipos base ────────────────────────────────────────────────────────────────

/** Classe de prioridade AHP: 1 (mais urgente) a 16 (menos urgente) */
export type ClassePrioridade = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16

/** Bounding box para MapLibre GL fitBounds: [[minX,minY],[maxX,maxY]] */
export type BBox = [[number, number], [number, number]]

/** IDs das camadas MapLibre GL do módulo */
export const LAYER_IDS = {
  MUNICIPIOS_LINE:    'ap-municipios-line',
  MUNICIPIOS_FILL:    'ap-municipios-fill',
  PRIORIDADE_FILL:    'ap-prioridade-fill',
  FLORESTA_FILL:      'ap-floresta-fill',
  PRODES_FILL:        'ap-prodes-fill',
  BIOMASSA_HEAT:      'ap-biomassa-heat',
  SELECTED_FILL:      'ap-municipio-selected-fill',
} as const

export type LayerId = typeof LAYER_IDS[keyof typeof LAYER_IDS]

/** Camadas visíveis por padrão ao entrar no módulo */
export const DEFAULT_VISIBLE_LAYERS: LayerId[] = [
  LAYER_IDS.MUNICIPIOS_LINE,
  LAYER_IDS.PRIORIDADE_FILL,
]

/** Descrição de cada camada para o LayerTogglePanel */
export const LAYER_CONFIG: Record<LayerId, { label: string; color: string }> = {
  [LAYER_IDS.MUNICIPIOS_LINE]: { label: 'Limites municipais',      color: '#374151' },
  [LAYER_IDS.MUNICIPIOS_FILL]: { label: 'Municípios (fundo)',       color: '#f3f4f6' },
  [LAYER_IDS.PRIORIDADE_FILL]: { label: 'Classes de prioridade',    color: '#ef4444' },
  [LAYER_IDS.FLORESTA_FILL]:   { label: 'Máscara florestal 2025',   color: '#16a34a' },
  [LAYER_IDS.PRODES_FILL]:     { label: 'Desmatamento PRODES 2025', color: '#dc2626' },
  [LAYER_IDS.BIOMASSA_HEAT]:   { label: 'Biomassa AGB (tC/ha)',     color: '#d97706' },
  [LAYER_IDS.SELECTED_FILL]:   { label: 'Município selecionado',    color: '#2563eb' },
}

// ── Município selecionado ─────────────────────────────────────────────────────

export interface MunicipioSelecionado {
  cod:  string
  nome: string
  bbox: BBox
}

// ── Tabela ap_classes_municipio ───────────────────────────────────────────────

export interface ClasseMunicipio {
  municipio_cod:        string
  municipio_nome:       string
  uf:                   string
  classe_prioridade:    ClassePrioridade
  area_total_ha:        number
  area_floresta_ha:     number
  area_desmat_ha:       number
  area_nao_floresta_ha: number
  pct_floresta:         number
  pct_desmat:           number
  ha_deter_recente:     number | null
  agb_medio_tc_ha:      number | null
  biomassa_total_tc:    number | null
  ano_prodes:           number
}

// ── Tabela ap_municipios_resumo ───────────────────────────────────────────────

export interface MunicipioResumo {
  municipio_cod:          string
  municipio_nome:         string
  uf:                     string
  classe_max_prioridade:  ClassePrioridade | null
  area_total_ha:          number
  area_floresta_ha:       number
  area_desmat_ha:         number
  ha_deter_recente:       number | null
  pct_floresta_estado:    number
  biomassa_floresta_tc:   number | null
  bbox:                   BBox
  ano_prodes:             number
}

// ── Respostas das RPCs ────────────────────────────────────────────────────────

/** KPIs PRODES — desmatamento confirmado pelo INPE */
export interface KpisProdes {
  area_floresta_total_ha: number
  area_desmat_total_ha:   number
  pct_desmat_estado:      number
  total_municipios:       number
  biomassa_total_tc:      number | null
}

/** KPIs DETER — alertas provisórios do gap temporal pós-PRODES */
export interface KpisDeter {
  area_alertas_ha:          number
  n_municipios_com_alerta:  number
  disponivel:               boolean
}

/** @deprecated Use KpisProdes */
export type KpisEstado = KpisProdes

export interface ClasseResumo {
  classe_prioridade:   ClassePrioridade
  area_floresta_ha:    number
  area_desmat_ha:      number
  area_total_ha:       number
  pct_floresta_media:  number
  ha_deter_recente:    number
  n_municipios:        number
}

/** Resposta completa de get_ap_visao_geral() */
export interface VisaoGeralResponse {
  periodo_cobertura: PeriodCoverage | null
  kpis: {
    prodes: KpisProdes
    deter:  KpisDeter
  }
  por_classe: ClasseResumo[]
}

export interface MunicipioDetalheResponse {
  municipio: MunicipioResumo
  classes:   ClasseMunicipio[]
}

// GeoJSON feature properties — retornado por get_ap_geojson()
export interface MunicipioFeatureProps {
  cod:                  string
  nome:                 string
  classe_max:           ClassePrioridade | null
  area_floresta_ha:     number
  area_desmat_ha:       number
  ha_deter_recente:     number
  pct_floresta_estado:  number
  bbox:                 BBox
}

// ── Paleta de cores para as 5 classes ────────────────────────────────────────
// Dados reais têm apenas 5 classes. Classe 1 = baixa pressão (verde),
// classe 5 = alta pressão/mais desmat. (vermelho). Classes 6-16 mantidas
// como fallback caso o raster seja reprocessado com escala completa.

/** Verde (baixa pressão, baixo desmat.) → Vermelho (alta pressão, alto desmat.) */
export const CLASSE_COLORS: Record<ClassePrioridade, string> = {
  1:  '#1a9850',  // verde — baixa pressão (3 ha desmat., 152 ha DETER)
  2:  '#fee08b',  // amarelo — pressão leve (8 ha desmat., 2 k ha DETER)
  3:  '#fdae61',  // laranja — pressão moderada (74 ha desmat., 4,5 k ha DETER)
  4:  '#f46d43',  // laranja-vermelho — alta pressão (354 ha desmat., 4 k ha DETER)
  5:  '#d73027',  // vermelho — muito alta pressão (2.319 ha desmat., 23 k ha DETER)
  6:  '#a50026', 7:  '#7f0000', 8:  '#5c0011', 9:  '#3f000d', 10: '#260008',
  11: '#1a0005', 12: '#111111', 13: '#111111', 14: '#111111', 15: '#111111', 16: '#111111',
}

// ── Cobertura temporal (PeriodBadge) ─────────────────────────────────────────

/**
 * Período de cobertura temporal retornado por get_ap_periodo_cobertura().
 *
 * Distinção obrigatória (ESCOPO §1.2):
 *   PRODES = confirmado/institucional (image_date_min → image_date_max)
 *   DETER  = alerta/provisional cobrindo o gap (deter_gap_inicio → deter_gap_fim)
 */
export interface PeriodCoverage {
  ano_prodes:             number
  image_date_min:         string | null
  image_date_max:         string | null
  data_referencia_prodes: string | null
  deter_gap_inicio:       string | null
  deter_gap_fim:          string | null
  fonte_complementar:     'DETER' | null
}
