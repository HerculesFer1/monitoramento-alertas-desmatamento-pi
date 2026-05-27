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

// ── Paleta de cores para as 16 classes ───────────────────────────────────────

/** Verde escuro (alta floresta, baixa pressão) → vermelho (alta pressão) */
export const CLASSE_COLORS: Record<ClassePrioridade, string> = {
  1:  '#006837', 2:  '#1a9850', 3:  '#66bd63', 4:  '#a6d96a',
  5:  '#d9ef8b', 6:  '#ffffbf', 7:  '#fee08b', 8:  '#fdae61',
  9:  '#f46d43', 10: '#d73027', 11: '#a50026', 12: '#7f0000',
  13: '#5c0011', 14: '#3f000d', 15: '#260008', 16: '#1a0005',
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
