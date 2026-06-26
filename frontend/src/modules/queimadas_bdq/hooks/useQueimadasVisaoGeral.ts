import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_DEFAULT } from '../../../core/lib/constants'
import type { QueimadasVisaoGeralResponse } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasVisaoGeral(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<QueimadasVisaoGeralResponse>({
    queryKey: ['qb_visao_geral', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_visao_geral', {
        p_ano: anoParam,
      })
      if (error) throw error
      return data as QueimadasVisaoGeralResponse
    },
    staleTime: STALE,
    retry:     2,
  })
}
