/**
 * useMatopibaQueimadasClient.ts — Hooks de Queimadas MATOPIBA client-side.
 * Usa get_qb_municipios (RPC base que JÁ funciona) e filtra/agrega os 33
 * municípios localmente, sem depender de get_qb_*_matopiba.
 *
 * Limitação conhecida: não temos série mensal por município no RPC base,
 * então o gráfico de sazonalidade da view fica indisponível até o cache
 * do PostgREST destravar e get_qb_temporal_matopiba ficar acessível.
 */
import { useMemo } from 'react'
import { useQueimadasMunicipios } from '../../queimadas_bdq/hooks/useQueimadasMunicipios'
import { MATOPIBA_SET, MATOPIBA_N_MUNICIPIOS } from '../../../core/lib/constants'
import type {
  QueimadasMunicipio, QueimadasPorClasse, QueimadasRankingItem,
} from '../../queimadas_bdq/types'
import type { MatopibaQueimadasVisaoGeral } from '../types'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const isMatopiba = (m: QueimadasMunicipio) =>
  MATOPIBA_SET.has(norm(m.municipio_nome ?? ''))

const round = (n: number, dp = 2) => {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

/* ── Visão Geral MATOPIBA: KPIs + por_classe (sem por_mes) ───────────── */
export function useMatopibaQueimadasVisaoGeralClient(ano: number | 'all' = 2025) {
  const q = useQueimadasMunicipios(ano)

  const data = useMemo<MatopibaQueimadasVisaoGeral | null>(() => {
    if (!q.data?.length) return null
    const rows = q.data.filter(isMatopiba)
    const area_total       = rows.reduce((s, r) => s + (r.area_queimada_total_ha ?? 0), 0)
    const n_total          = rows.reduce((s, r) => s + (r.n_cicatrizes_total ?? 0), 0)
    const municipios_afet  = rows.filter(r => (r.area_queimada_total_ha ?? 0) > 0).length

    // Agrega area_ha_por_classe (JSONB {"1": x, "2": y, ...}) somando os 33
    const acumClasse: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    for (const r of rows) {
      const m = r.area_ha_por_classe ?? {}
      for (const k of Object.keys(acumClasse)) acumClasse[k] += Number(m[k] ?? 0)
    }
    const totalDist = Object.values(acumClasse).reduce((s, v) => s + v, 0)
    const por_classe: QueimadasPorClasse[] = ([1, 2, 3, 4, 5] as const).map(c => ({
      classe_prioridade: c,
      prioridade_label:  ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'][c - 1],
      area_queimada_ha:  round(acumClasse[String(c)] ?? 0, 4),
      n_cicatrizes:      0,
      pct_do_total:      totalDist > 0 ? round((acumClasse[String(c)] / totalDist) * 100, 2) : 0,
    }))
    const area_prioritaria_ha = (acumClasse['4'] ?? 0) + (acumClasse['5'] ?? 0)
    const pct_em_prioritarias = totalDist > 0 ? round((area_prioritaria_ha / totalDist) * 100, 2) : 0

    return {
      kpis: {
        area_queimada_total_ha: round(area_total, 4),
        n_cicatrizes_total:     n_total,
        municipios_afetados:    municipios_afet,
        area_prioritaria_ha:    round(area_prioritaria_ha, 4),
        pct_em_prioritarias,
        ano:                    typeof ano === 'number' ? ano : 2025,
        recorte:                'MATOPIBA-PI',
        n_municipios_recorte:   MATOPIBA_N_MUNICIPIOS,
      },
      por_classe,
      por_mes: null, // não derivável de get_qb_municipios
    }
  }, [q.data, ano])

  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

/* ── Ranking dos 33 MATOPIBA ─────────────────────────────────────────── */
export function useMatopibaQueimadasRankingClient(ano: number | 'all' = 2025, limit = 33) {
  const q = useQueimadasMunicipios(ano)
  const data = useMemo<QueimadasRankingItem[]>(() => {
    if (!q.data?.length) return []
    return q.data
      .filter(isMatopiba)
      .sort((a, b) => (b.area_queimada_total_ha ?? 0) - (a.area_queimada_total_ha ?? 0))
      .slice(0, limit)
      .map((r, i) => ({
        rank:                   i + 1,
        municipio_cod:          r.municipio_cod,
        municipio_nome:         r.municipio_nome,
        area_queimada_total_ha: r.area_queimada_total_ha,
        n_cicatrizes_total:     r.n_cicatrizes_total,
        classe_max_queimada:    r.classe_max_queimada,
        pct_area_prioritaria:   r.pct_area_prioritaria,
        mes_pico:               r.mes_pico,
      }))
  }, [q.data, limit])

  return { data, isLoading: q.isLoading }
}
