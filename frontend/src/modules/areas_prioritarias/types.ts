/**
 * types.ts — Módulo areas_prioritarias
 * Tipos TypeScript para o cruzamento PRODES × Prioridade.
 * Espelha o schema Supabase (008_areas_prioritarias.sql).
 */

// ── Tipos base ────────────────────────────────────────────────────────────────

/** Classe de prioridade AHP: 1 (menor prioridade/pressão) a 5 (maior prioridade/pressão).
 *  O raster entregue (16_prioridade_classes_final.tif) codifica 5 grupos AHP (quintis). */
export type ClassePrioridade = 1|2|3|4|5

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
  [LAYER_IDS.MUNICIPIOS_LINE]: { label: 'Limites municipais', color: '#374151' },
  [LAYER_IDS.MUNICIPIOS_FILL]: { label: 'Municípios (fundo)',  color: '#f3f4f6' },
  [LAYER_IDS.PRIORIDADE_FILL]: { label: 'Classes de prioridade', color: '#ef4444' },
  [LAYER_IDS.FLORESTA_FILL]:   { label: 'Máscara florestal 2025', color: '#16a34a' },
  [LAYER_IDS.PRODES_FILL]:     { label: 'Desmatamento PRODES 2024', color: '#dc2626' },
  [LAYER_IDS.BIOMASSA_HEAT]:   { label: 'Biomassa AGB (tC/ha)', color: '#d97706' },
  [LAYER_IDS.SELECTED_FILL]:   { label: 'Município selecionado', color: '#2563eb' },
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
  pct_floresta_estado:    number
  biomassa_floresta_tc:   number | null
  bbox:                   BBox
  ano_prodes:             number
}

// ── Respostas das RPCs ────────────────────────────────────────────────────────

export interface KpisEstado {
  area_floresta_total_ha: number
  area_desmat_total_ha:   number
  pct_desmat_estado:      number
  total_municipios:       number
  biomassa_total_tc:      number | null
}

export interface ClasseResumo {
  classe_prioridade:   ClassePrioridade
  area_floresta_ha:    number
  area_desmat_ha:      number
  area_total_ha:       number
  pct_floresta_media:  number
  n_municipios:        number
}

/** KPIs DETER (alertas provisórios pós-PRODES) — bloco irmão de KpisEstado na RPC */
export interface KpisDeter {
  area_alertas_ha:         number
  n_municipios_com_alerta: number
  disponivel:              boolean
}

export interface VisaoGeralResponse {
  // A RPC get_ap_visao_geral separa os KPIs por fonte: prodes (confirmado) e deter (alertas).
  kpis:       { prodes: KpisEstado; deter: KpisDeter }
  por_classe: ClasseResumo[]
}

export interface MunicipioDetalheResponse {
  municipio: MunicipioResumo
  classes:   ClasseMunicipio[]
}

// GeoJSON feature properties (para PrioridadeMap)
export interface MunicipioFeatureProps {
  cod:                  string
  nome:                 string
  classe_max:           ClassePrioridade | null
  area_floresta_ha:     number
  area_desmat_ha:       number
  pct_floresta_estado:  number
  bbox:                 BBox
}

// ── Paleta de cores para as 16 classes ───────────────────────────────────────

/** 5 classes (quintis AHP): 1 = menor prioridade (verde) → 5 = maior prioridade (vermelho) */
export const CLASSE_COLORS: Record<ClassePrioridade, string> = {
  1: '#1a9850',   // menor prioridade / pressão
  2: '#a6d96a',
  3: '#fee08b',
  4: '#fdae61',
  5: '#d73027',   // maior prioridade / pressão
}
