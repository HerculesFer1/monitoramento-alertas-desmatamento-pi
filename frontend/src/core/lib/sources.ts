/**
 * sources.ts — Catálogo de fontes externas e seus cronogramas de atualização.
 *
 * Centraliza a verdade institucional sobre cada fonte ingerida pelo pipeline:
 *   - Nome e provedor
 *   - Frequência de atualização institucional (na origem)
 *   - Frequência da automação no nosso pipeline (cron GitHub Actions)
 *   - Última atualização efetiva (do banco) → calculada em runtime
 *   - Próxima atualização prevista → derivada do cron + data atual
 *
 * Quando uma nova fonte for adicionada (ou um cron alterado), atualize aqui
 * e em `.github/workflows/update-*.yml`. Esta camada é a fonte de verdade
 * de UI — `DadosView` consome este array.
 */

export type SourceStatus = 'ativo' | 'pendente' | 'manual' | 'indisponivel'

export interface FonteDados {
  id:             string
  nome:           string
  provedor:       string
  tipo:           string
  /** Frequência institucional na origem (não no pipeline). */
  frequenciaOrigem: string
  /** Cron expression do workflow que atualiza esta fonte (ou null se manual). */
  cron:           string | null
  /** Workflow GitHub Actions correspondente (para link). */
  workflow?:      string
  /** Método de ingestão (descritivo). */
  metodoIngestao: string
  /** Status atual da fonte. */
  status:         SourceStatus
  /** Observações institucionais (opcional). */
  obs?:           string
}

// ── Catálogo de fontes ────────────────────────────────────────────────────

export const FONTES: FonteDados[] = [
  {
    id:               'mapbiomas_alerta',
    nome:             'MapBiomas Alerta',
    provedor:         'MapBiomas / IPAM / IMAFLORA',
    tipo:             'GeoJSON (alertas)',
    frequenciaOrigem: 'Contínua (alertas semanais)',
    cron:             '0 3 5 * *',           // dia 5 de cada mês 03:00 UTC
    workflow:         'update-alertas.yml',
    metodoIngestao:   'GraphQL API v2 + filtro Piauí',
    status:           'ativo',
  },
  {
    id:               'asvs_sinaflor',
    nome:             'ASVs SINAFLOR+',
    provedor:         'IBAMA',
    tipo:             'GeoJSON (polígonos ASV)',
    frequenciaOrigem: 'Contínua (emissão sob demanda)',
    cron:             '0 3 * * 1',           // segunda 03:00 UTC
    workflow:         'update-asvs.yml',
    metodoIngestao:   'WFS ArcGIS IBAMA + filtro PI',
    status:           'ativo',
    obs:              'WFS IBAMA pode estar instável — workflow é resiliente: continua usando cache.',
  },
  {
    id:               'prodes_cerrado',
    nome:             'PRODES-Cerrado',
    provedor:         'INPE / TerraBrasilis',
    tipo:             'GeoJSON (WFS TerraBrasilis)',
    frequenciaOrigem: 'Anual (outubro)',
    cron:             '0 3 1 10 *',          // 1 de outubro 03:00 UTC
    workflow:         'update-prodes.yml',
    metodoIngestao:   'WFS GetFeature + bbox PI',
    status:           'ativo',
  },
  {
    id:               'deradsa_semarh',
    nome:             'DERADSAs SEMARH-PI',
    provedor:         'CGEO / SEMARH-PI',
    tipo:             'GeoJSON (polígonos)',
    frequenciaOrigem: 'Sob demanda institucional',
    cron:             null,                  // ingestão manual via Supabase Storage
    metodoIngestao:   'Ingestão manual pelo CGEO via Supabase Storage',
    status:           'manual',
    obs:              'Cobertura geoespacial: apenas 2024-2025 (Série B). 2022-2023 = ausência de dado, não metodologia.',
  },
  {
    id:               'aq1km_queimadas',
    nome:             'AQ1km V6 (Cicatrizes)',
    provedor:         'INPE / BD Queimadas',
    tipo:             'Shapefile (mensal)',
    frequenciaOrigem: 'Mensal (início do mês seguinte)',
    cron:             '0 4 5 * *',           // dia 5 de cada mês 04:00 UTC
    workflow:         'update-queimadas.yml',
    metodoIngestao:   'Download HTTP BD Queimadas + overlay vetorial',
    status:           'ativo',
    obs:              'Roda apos o update-areas-prioritarias para herdar o GPKG de classes AHP.',
  },
  {
    id:               'ibge_municipios',
    nome:             'Malha Municipal',
    provedor:         'IBGE',
    tipo:             'GeoJSON',
    frequenciaOrigem: 'Anual (publicação IBGE)',
    cron:             null,                  // cache local + download sob demanda
    metodoIngestao:   'API IBGE · sob demanda (cache em data/raw/)',
    status:           'ativo',
  },
  {
    id:               'areas_prioritarias_ahp',
    nome:             'Áreas Prioritárias REDD+ (AHP)',
    provedor:         'CGEO / SEMARH-PI',
    tipo:             'GeoPackage (5 classes AHP)',
    frequenciaOrigem: 'Revisão metodológica institucional',
    cron:             null,
    metodoIngestao:   'Produto científico CGEO (raster AHP vetorizado)',
    status:           'ativo',
    obs:              'AHP: 83% Pressão + 17% AGB (Sato, Tejada & Noronha — 2026-04-20).',
  },
]

// ── Parser de cron simplificado (suporta os crons usados pelo projeto) ──

interface CronParsed {
  minute: number | '*'
  hour:   number | '*'
  dayOfMonth: number | '*'
  month:  number | '*'
  dayOfWeek: number | '*'
}

function parseCron(expr: string): CronParsed | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const p = (s: string): number | '*' => s === '*' ? '*' : parseInt(s, 10)
  return {
    minute:     p(parts[0]),
    hour:       p(parts[1]),
    dayOfMonth: p(parts[2]),
    month:      p(parts[3]),
    dayOfWeek:  p(parts[4]),
  }
}

/**
 * Próxima data de execução prevista para um cron (em UTC).
 * Implementação minimalista — cobre apenas os 3 padrões em uso pelo projeto:
 *   - "0 3 5 * *"   → mensal, dia 5
 *   - "0 3 * * 1"   → semanal, segunda
 *   - "0 3 1 10 *"  → anual, 1 de outubro
 *
 * Para crons mais complexos no futuro, considere `cron-parser` (npm).
 */
export function proximaExecucao(cron: string | null, from: Date = new Date()): Date | null {
  if (!cron) return null
  const c = parseCron(cron)
  if (!c) return null

  const out = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    typeof c.hour === 'number' ? c.hour : 0,
    typeof c.minute === 'number' ? c.minute : 0,
  ))

  // Caso 1: mensal por dia do mês (ex: "0 3 5 * *")
  if (typeof c.dayOfMonth === 'number' && c.dayOfWeek === '*' && c.month === '*') {
    out.setUTCDate(c.dayOfMonth)
    if (out.getTime() <= from.getTime()) {
      out.setUTCMonth(out.getUTCMonth() + 1)
    }
    return out
  }

  // Caso 2: semanal por dia da semana (ex: "0 3 * * 1" — segunda)
  if (typeof c.dayOfWeek === 'number' && c.dayOfMonth === '*' && c.month === '*') {
    const target = c.dayOfWeek            // 0=Dom, 1=Seg, ..., 6=Sab
    const today  = out.getUTCDay()
    let delta = (target - today + 7) % 7
    if (delta === 0 && out.getTime() <= from.getTime()) delta = 7
    out.setUTCDate(out.getUTCDate() + delta)
    return out
  }

  // Caso 3: anual (ex: "0 3 1 10 *" — 1 outubro)
  if (typeof c.dayOfMonth === 'number' && typeof c.month === 'number') {
    out.setUTCMonth(c.month - 1, c.dayOfMonth)
    if (out.getTime() <= from.getTime()) {
      out.setUTCFullYear(out.getUTCFullYear() + 1)
    }
    return out
  }

  return null
}

/** Rótulo legível da frequência derivada do cron. */
export function frequenciaPipeline(cron: string | null): string {
  if (!cron) return 'Manual'
  const c = parseCron(cron)
  if (!c) return cron
  if (typeof c.dayOfMonth === 'number' && c.dayOfWeek === '*' && c.month === '*') return 'Mensal'
  if (typeof c.dayOfWeek === 'number' && c.dayOfMonth === '*' && c.month === '*') return 'Semanal'
  if (typeof c.dayOfMonth === 'number' && typeof c.month === 'number')            return 'Anual'
  return cron
}

/** Formata data como "dd/mm/aaaa" com horário UTC simplificado. */
export function fmtDataPrevisao(d: Date | null): string {
  if (!d) return '—'
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

/** Tempo relativo em pt-BR ("em 3 dias", "hoje", "amanhã"). */
export function relativoEm(d: Date | null, from: Date = new Date()): string {
  if (!d) return ''
  const diffMs = d.getTime() - from.getTime()
  const dias = Math.round(diffMs / 86_400_000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias < 0)   return `há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''}`
  if (dias < 30)  return `em ${dias} dias`
  const meses = Math.round(dias / 30)
  if (meses < 12) return `em ~${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.round(meses / 12)
  return `em ~${anos} ano${anos > 1 ? 's' : ''}`
}
