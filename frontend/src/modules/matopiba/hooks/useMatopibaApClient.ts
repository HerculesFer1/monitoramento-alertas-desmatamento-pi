/**
 * useMatopibaApClient.ts — Hooks de Áreas Prioritárias MATOPIBA client-side.
 * Usa useRanking (get_ap_ranking, RPC base que funciona) e filtra/agrega
 * os 33 municípios localmente.
 *
 * Limitação: por_classe agregado por classe de prioridade depende de
 * ap_classes_municipio, que não tem RPC pública. Calculamos o por_classe
 * a partir das classe_max_prioridade dos municípios (aproximação — soma
 * a área florestal de cada município na sua classe máxima).
 */
import { useMemo } from 'react'
import { useRanking } from '../../areas_prioritarias/hooks/useAreasData'
import { MATOPIBA_SET, MATOPIBA_N_MUNICIPIOS } from '../../../core/lib/constants'
import type { MunicipioResumo, ClassePrioridade } from '../../areas_prioritarias/types'
import { CLASSE_LABELS } from '../../areas_prioritarias/types'
import type { MatopibaApVisaoGeral, MatopibaApRankingItem } from '../types'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const isMatopiba = (r: MunicipioResumo) =>
  MATOPIBA_SET.has(norm(r.municipio_nome ?? ''))

const round = (n: number, dp = 2) => {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

/* ── Visão Geral MATOPIBA: KPIs PRODES/DETER + por_classe ────────────── */
export function useMatopibaApVisaoGeralClient(ano: number | 'all' = 2025) {
  const q = useRanking(ano, 'area_floresta_ha', 250)

  const data = useMemo<MatopibaApVisaoGeral | null>(() => {
    if (!q.data?.length) return null
    const rows = q.data.filter(isMatopiba)

    const sum = (k: keyof MunicipioResumo) =>
      rows.reduce((s, r) => s + (Number(r[k] ?? 0)), 0)

    const area_floresta_total_ha = sum('area_floresta_ha')
    const area_desmat_total_ha   = sum('area_desmat_ha')
    const area_total_recorte     = sum('area_total_ha')
    const biomassa_total_tc      = sum('biomassa_floresta_tc')
    const ha_deter_total         = sum('ha_deter_recente')
    const n_municipios           = rows.length
    const n_municipios_classe5   = rows.filter(r => r.classe_max_prioridade === 5).length
    const n_munic_deter          = rows.filter(r => (r.ha_deter_recente ?? 0) > 0).length

    // por_classe aproximado: agrupa municípios pela classe_max e soma floresta
    const byClasse = new Map<ClassePrioridade, MunicipioResumo[]>()
    for (const r of rows) {
      const c = r.classe_max_prioridade
      if (c == null) continue
      if (!byClasse.has(c)) byClasse.set(c, [])
      byClasse.get(c)!.push(r)
    }
    const por_classe = ([1, 2, 3, 4, 5] as ClassePrioridade[]).map(c => {
      const items = byClasse.get(c) ?? []
      const area_floresta_ha = items.reduce((s, r) => s + (r.area_floresta_ha ?? 0), 0)
      const area_desmat_ha   = items.reduce((s, r) => s + (r.area_desmat_ha ?? 0), 0)
      const area_total_ha    = items.reduce((s, r) => s + (r.area_total_ha ?? 0), 0)
      const ha_deter_recente = items.reduce((s, r) => s + (r.ha_deter_recente ?? 0), 0)
      const pct_floresta_media = items.length > 0
        ? items.reduce((s, r) => s + (r.pct_floresta_estado ?? 0), 0) / items.length
        : 0
      return {
        classe_prioridade: c,
        prioridade_label:  CLASSE_LABELS[c],
        area_floresta_ha:  round(area_floresta_ha),
        area_desmat_ha:    round(area_desmat_ha),
        area_total_ha:     round(area_total_ha),
        pct_floresta_media: round(pct_floresta_media),
        ha_deter_recente:  round(ha_deter_recente),
        n_municipios:      items.length,
      }
    })

    return {
      periodo_cobertura: null,
      kpis: {
        prodes: {
          area_floresta_total_ha:  round(area_floresta_total_ha),
          area_desmat_total_ha:    round(area_desmat_total_ha),
          pct_desmat_recorte:      area_total_recorte > 0
            ? round((area_desmat_total_ha / area_total_recorte) * 100)
            : 0,
          total_municipios:        n_municipios,
          biomassa_total_tc:       round(biomassa_total_tc, 0),
          n_municipios_classe_max: n_municipios_classe5,
        },
        deter: {
          area_alertas_ha:         round(ha_deter_total),
          n_municipios_com_alerta: n_munic_deter,
          disponivel:              ha_deter_total > 0,
        },
        recorte: {
          nome:         'MATOPIBA-PI',
          base_legal:   'Portaria MAPA 244/2015',
          n_municipios: MATOPIBA_N_MUNICIPIOS,
        },
      },
      por_classe,
    }
  }, [q.data])

  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

/* ── Ranking MATOPIBA AP ─────────────────────────────────────────────── */
export function useMatopibaApRankingClient(
  ano: number | 'all' = 2025,
  orderby = 'area_desmat_ha',
  limit = 33,
) {
  const q = useRanking(ano, orderby, 250)
  const data = useMemo<MatopibaApRankingItem[]>(() => {
    if (!q.data?.length) return []
    return q.data
      .filter(isMatopiba)
      .slice(0, limit)
      .map(r => ({
        municipio_cod:         r.municipio_cod,
        municipio_nome:        r.municipio_nome,
        classe_max_prioridade: r.classe_max_prioridade,
        area_total_ha:         r.area_total_ha,
        area_floresta_ha:      r.area_floresta_ha,
        area_desmat_ha:        r.area_desmat_ha,
        ha_deter_recente:      r.ha_deter_recente ?? 0,
        pct_floresta_estado:   r.pct_floresta_estado,
        biomassa_floresta_tc:  r.biomassa_floresta_tc ?? 0,
        agb_medio_tc_ha:       r.agb_medio_tc_ha ?? 0,
      }))
  }, [q.data, limit])

  return { data, isLoading: q.isLoading }
}
