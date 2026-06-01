import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type { QueimadasRankingItem } from '../types'

const STALE       = 5 * 60 * 1000
const ANO_DEFAULT = 2025

export function useQueimadasRanking(
  ano:   number | 'all' = ANO_DEFAULT,
  limit: number         = 20,
) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<QueimadasRankingItem[]>({
    queryKey: ['qb_ranking', anoParam, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_ranking', {
        p_ano:   anoParam,
        p_limit: limit,
      })
      if (error) throw error
      return (data ?? []) as QueimadasRankingItem[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
