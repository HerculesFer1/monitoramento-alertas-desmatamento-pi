import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_DEFAULT } from '../../../core/lib/constants'
import type { QueimadasTemporalItem } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasTemporal(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<QueimadasTemporalItem[]>({
    queryKey: ['qb_temporal', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_temporal', {
        p_ano: anoParam,
      })
      if (error) throw error
      return (data ?? []) as QueimadasTemporalItem[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
