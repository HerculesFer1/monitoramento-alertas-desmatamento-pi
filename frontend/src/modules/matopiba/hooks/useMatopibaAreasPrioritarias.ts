/**
 * useMatopibaAreasPrioritarias.ts — Hooks de Áreas Prioritárias com recorte
 * MATOPIBA-PI. Espelha modules/areas_prioritarias/hooks/useAreasData.ts
 * chamando as RPCs _matopiba.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type { MatopibaApVisaoGeral, MatopibaApRankingItem } from '../types'

const STALE       = 5 * 60 * 1000
const ANO_DEFAULT = 2025

export function useMatopibaApVisaoGeral(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano
  return useQuery<MatopibaApVisaoGeral>({
    queryKey: ['matopiba_ap_visao_geral', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_visao_geral_matopiba', { p_ano: anoParam })
      if (error) throw error
      return data as MatopibaApVisaoGeral
    },
    staleTime: STALE,
    retry:     2,
  })
}

export function useMatopibaApRanking(
  ano: number | 'all' = ANO_DEFAULT,
  orderby = 'area_desmat_ha',
  limit = 26,
) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano
  return useQuery<MatopibaApRankingItem[]>({
    queryKey: ['matopiba_ap_ranking', anoParam, orderby, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_ranking_matopiba', {
        p_ano: anoParam, p_orderby: orderby, p_limit: limit,
      })
      if (error) throw error
      return (data ?? []) as MatopibaApRankingItem[]
    },
    staleTime: STALE,
    retry:     1,
  })
}
