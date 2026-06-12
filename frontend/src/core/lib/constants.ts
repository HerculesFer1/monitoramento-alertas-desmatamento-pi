/**
 * constants.ts — Constantes do frontend.
 *
 * Constantes COMPARTILHADAS (MATOPIBA_LIST, VP_PTBR, ANOS) vêm do JSON
 * gerado pelo pipeline Python. Execute `python -m pipeline.constants`
 * para regenerar após alterações em pipeline/constants.py.
 *
 * Este arquivo contém APENAS constantes exclusivas do frontend.
 */
import _pipeline from '@pipeline/constants.json'

// ── Re-exportações do contrato Python → TypeScript ────────────────────────
export const ANOS          = _pipeline.anos as number[]
export const ANOS_DERADSA  = _pipeline.anos_deradsa as number[]
export const MATOPIBA_LIST = _pipeline.matopiba_pi as string[]
export const VP_PTBR       = _pipeline.vp_ptbr as Record<string, string>
export const CLASSES        = _pipeline.classes as string[]
export const FLAGS_PRODES   = _pipeline.flags_prodes

// Alias para compatibilidade com componentes existentes
export const YEARS = ANOS

// Set pré-computado para O(1) lookup (vs O(n) MATOPIBA_LIST.some())
const _norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
export const MATOPIBA_SET: ReadonlySet<string> = new Set(MATOPIBA_LIST.map(_norm))
// Total de municípios PI no recorte MATOPIBA (Portaria MAPA 244/2015).
// Fonte única: deriva da lista para evitar hardcoded em N views.
export const MATOPIBA_N_MUNICIPIOS = MATOPIBA_LIST.length
// Total de municípios do PI conforme malha IBGE.
export const PI_N_MUNICIPIOS_TOTAL = 224

// ── Constantes exclusivas do frontend ────────────────────────────────────
export const AREA_TERESINA = 139_200 // ha — referência geográfica para KPIs

// ── Dados estáticos do último pipeline (alimentam gráficos históricos) ────
// ATENÇÃO: estes valores são outputs fixos do processamento mais recente.
// Quando o Supabase estiver conectado, as páginas devem consumir as RPCs
// (getResumoAnual, getAgregado) em vez destes objetos.
// Mantidos aqui como fallback e para a TemporalPage enquanto a migração
// não está completa.

export const alertYr: Record<number, { count: number; area: number; cerrado: number; caatinga: number }> = {
  2022: { count: 3062, area: 150350, cerrado: 136168, caatinga: 14182 },
  2023: { count: 4527, area: 138035, cerrado: 115473, caatinga: 22563 },
  2024: { count: 3034, area: 145146, cerrado: 109146, caatinga: 36001 },
  2025: { count: 2676, area: 152527, cerrado: 112089, caatinga: 40438 },
}

// ATENÇÃO: `autorizado` = ha_AUTORIZADO puro (cobertura ≥99% ASV, geometria integral).
// `autorizado_p` = ha_AUTORIZADO_PARCIALMENTE (cobertura parcial ASV).
// O frontend soma autorizado + autorizado_p para obter ha_autorizado_total.
// NÃO armazenar ha_autorizado_total aqui — causaria dupla-contagem no getAut().
export const classifYr: Record<number, { irregular: number; autorizado: number; autorizado_p: number; regularizado: number }> = {
  2022: { irregular: 123394, autorizado: 18653, autorizado_p: 8304,  regularizado: 0   },
  2023: { irregular: 97997,  autorizado: 7665,  autorizado_p: 32374, regularizado: 0   },
  2024: { irregular: 75228,  autorizado: 39681, autorizado_p: 29988, regularizado: 250 },
  2025: { irregular: 42376,  autorizado: 88168, autorizado_p: 21898, regularizado: 86  },
}

export const ipiYr: Record<number, number> = {
  2022: 82.1, 2023: 71.0, 2024: 51.8, 2025: 27.8,
}

// MATOPIBA: mat + rest = ha_irregular do ano (não ha_total alertado)
export const matopibaYr: Record<number, { mat: number; rest: number }> = {
  2022: { mat: 80259, rest: 43135 },
  2023: { mat: 54669, rest: 43328 },
  2024: { mat: 30338, rest: 44890 },
  2025: { mat: 14294, rest: 28082 },
}

export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const

// ── Dados municipais (Top 20 por área total alertada, acumulado 2022-2025) ─
// Fallback estático — sobrescrito por resumo_estatico.json quando o pipeline tiver rodado.
export const top20: [string, number][] = [
  ['Uruçuí', 62334], ['Baixa Grande do Ribeiro', 58127], ['Sebastião Leal', 43208],
  ['Canto do Buriti', 37662], ['Santa Filomena', 34441], ['Palmeira do Piauí', 28904],
  ['Currais', 27183], ['Bom Jesus', 22617], ['Ribeiro Gonçalves', 19843],
  ['Riacho Frio', 18204], ['Cristino Castro', 15384], ['Corrente', 14827],
  ['Alvorada do Gurguéia', 13948], ['Parnaguá', 12613], ['Gilbués', 11834],
  ['Guadalupe', 10247], ['Floriano', 9823], ['Jerumenha', 8612],
  ['Redenção do Gurguéia', 7441], ['Piracuruca', 6813],
]

// Área irregular real por município (fallback estático — dados completos via Supabase getAgregado)
export const munIrrReal: Record<string, number> = {
  'Uruçuí': 37407, 'Baixa Grande do Ribeiro': 16143, 'Sebastião Leal': 17822,
  'Canto do Buriti': 18931, 'Santa Filomena': 23729, 'Palmeira do Piauí': 14805,
  'Currais': 13524, 'Bom Jesus': 10193, 'Ribeiro Gonçalves': 9841,
  'Riacho Frio': 9473,
}

export const MUN_BIOME: Record<string, string> = {
  'Uruçuí': 'Cerrado', 'Baixa Grande do Ribeiro': 'Cerrado',
  'Sebastião Leal': 'Cerrado', 'Canto do Buriti': 'Caatinga',
  'Santa Filomena': 'Cerrado', 'Palmeira do Piauí': 'Cerrado',
  'Currais': 'Cerrado', 'Bom Jesus': 'Cerrado',
  'Ribeiro Gonçalves': 'Cerrado', 'Riacho Frio': 'Cerrado',
  'Cristino Castro': 'Cerrado', 'Corrente': 'Cerrado',
  'Alvorada do Gurguéia': 'Cerrado', 'Parnaguá': 'Cerrado',
  'Gilbués': 'Cerrado', 'Guadalupe': 'Caatinga',
  'Floriano': 'Caatinga', 'Jerumenha': 'Caatinga',
  'Redenção do Gurguéia': 'Cerrado', 'Piracuruca': 'Caatinga',
}

export const REINCIDENT_MUNIS: readonly string[] = [
  'Uruçuí','Santa Filomena','Sebastião Leal','Baixa Grande do Ribeiro',
  'Palmeira do Piauí','Canto do Buriti','Currais','Bom Jesus',
  'Riacho Frio','Alvorada do Gurguéia','Parnaguá','Corrente',
  'Cristino Castro','Ribeiro Gonçalves','Cristalândia do Piauí',
  'Floriano','Gilbués','Guadalupe','Redenção do Gurguéia','Jerumenha',
]

// ── Dados PRODES ──────────────────────────────────────────────────────────
export const prodesData = {
  ciclos: {
    2022: { n: 619,  concordantes: 376,  discordantes: 243, pct: 60.7 },
    2023: { n: 2874, concordantes: 1996, discordantes: 878, pct: 69.5 },
    2024: { n: 1421, concordantes: 1061, discordantes: 360, pct: 74.7 },
    2025: { n: 1004, concordantes: 765,  discordantes: 239, pct: 76.2 },
  },
  totalValidados:    5918,
  totalConcordantes: 4198,
  totalDiscordantes: 1720,
  semProdes:         747,
}

export const prodesExtra = {
  irrAnual: {
    anos:        [2022,  2023,  2024,  2025],
    confirmado:  [91588, 67494, 42855, 17357],
    discordante: [19653, 11953, 3918,  1250],
    caatinga:    [12153, 18550, 28530, 9222],
    semProdes:   [0,     0,     0,     14831],
  },
  // ATENÇÃO: distCob.n soma 6180 mas totalValidados=5918 (divergência de execução anterior).
  // CP4 usa percentuais calculados dinamicamente — viés visual mínimo.
  // Regenerar via python -m pipeline para sincronizar com resumo_estatico.json.
  distCob: {
    labels: ['0%','1–24%','25–49%','50–74%','75–89%','90–100%'],
    n:  [1730, 508, 642, 1077, 1060, 1163],
    ha: [38855, 66813, 24049, 53461, 58922, 217648],
  },
  porVetor: [
    { vp: 'Agricultura',       n: 5715, conc: 4075, pct: 71.3 },
    { vp: 'Expansão Urbana',   n: 141,  conc: 92,   pct: 65.2 },
    { vp: 'Abertura Estradas', n: 39,   conc: 14,   pct: 35.9 },
    { vp: 'Energia Renovável', n: 5,    conc: 4,    pct: 80.0 },
    { vp: 'Mineração',         n: 4,    conc: 3,    pct: 75.0 },
  ],
  mediaCob: { 2022: 66.6, 2023: 64.3, 2024: 69.4, 2025: 70.5 },
  topMun: [
    { mun: 'Uruçuí',                  conc: 34560, total: 37407, pct: 92 },
    { mun: 'Santa Filomena',          conc: 18710, total: 23729, pct: 79 },
    { mun: 'Sebastião Leal',          conc: 17375, total: 17822, pct: 97 },
    { mun: 'Baixa Grande do Ribeiro', conc: 14766, total: 16143, pct: 91 },
    { mun: 'Currais',                 conc: 11493, total: 13524, pct: 85 },
    { mun: 'Palmeira do Piauí',       conc: 10290, total: 14805, pct: 70 },
    { mun: 'Riacho Frio',             conc: 8150,  total: 9473,  pct: 86 },
    { mun: 'Bom Jesus',               conc: 6050,  total: 10193, pct: 59 },
    { mun: 'Cristino Castro',         conc: 5748,  total: 6242,  pct: 92 },
    { mun: 'Corrente',                conc: 5622,  total: 7183,  pct: 78 },
  ],
  haIrrConfirmado:       219294,
  // % do total irregular PI (Cerrado + Caatinga, 2022–2025) — denominador conservador
  pctIrrConfirmado:      64.7,
  // % do Cerrado irregular com PRODES disponível (excl. Caatinga e SEM_PRODES_NO_CICLO)
  // = 219294 / (219294 + 36774) = 219294 / 256068
  pctIrrCerradoDisponivel: 85.6,
}

// ── Utilitário de área autorizada (evita duplicação em getAut()) ──────────
/**
 * Soma ha_autorizado_pleno + ha_autorizado_parcialmente.
 * Use em vez de `e.autorizado + e.autorizado_p` inline para evitar
 * divergências quando novos campos forem adicionados ao schema.
 */
export function calcAutTotal(e: { autorizado: number; autorizado_p: number }): number {
  return e.autorizado + e.autorizado_p
}

// ── Cores semânticas para gráficos Recharts ───────────────────────────────
// Recharts não suporta CSS vars em fill props — centralizar hex aqui evita duplicação.
export const CHART_COLORS = {
  irr:      '#EF4444',
  aut:      '#10B981',
  autp:     '#34D399',
  reg:      '#F97316',
  mat:      '#F59E0B',
  cerrado:  '#FB8C00',
  caatinga: '#42A5F5',
  restPI:   '#334155',
} as const

// ── Utilitários de formatação ─────────────────────────────────────────────
const _fmt1 = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function fmtHa(v: number): string {
  if (v >= 1_000_000) return `${_fmt1(v / 1_000_000)}M ha`
  if (v >= 1_000)     return `${_fmt1(v / 1_000)}k ha`
  return `${Math.round(v).toLocaleString('pt-BR')} ha`
}

export function fmtNum(v: number): string {
  return Math.round(v).toLocaleString('pt-BR')
}
