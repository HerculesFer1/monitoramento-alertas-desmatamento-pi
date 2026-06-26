import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_RECENTE_COMPLETO as ANO_DEFAULT } from '../../../core/lib/constants'
import type { QueimadasMunicipio } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasMunicipios(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<QueimadasMunicipio[]>({
    queryKey: ['qb_municipios', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_municipios', {
        p_ano: anoParam,
      })
      if (error) throw error
      return (data ?? []) as QueimadasMunicipio[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
