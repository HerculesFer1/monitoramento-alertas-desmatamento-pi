/**
 * useQueimadasMunicipiosMes — dados mensais de queimadas por município.
 * Usa get_qb_municipios_mes(p_ano, p_mes) criado na Migration 012.
 *
 * Quando p_mes é null, delega para get_qb_municipios (dados anuais).
 * Quando p_mes está definido, retorna área queimada naquele mês específico.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_RECENTE_COMPLETO as ANO_DEFAULT } from '../../../core/lib/constants'
import type { QueimadasMunicipio } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasMunicipiosMes(
  ano: number | 'all' = ANO_DEFAULT,
  mes: number | null  = null,
) {
  const anoParam = (ano === 'all' ? ANO_DEFAULT : ano) as number

  return useQuery<QueimadasMunicipio[]>({
    queryKey: ['qb_municipios_mes', anoParam, mes ?? 'all'],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_municipios_mes', {
        p_ano: anoParam,
        p_mes: mes ?? null,
      })
      if (error) throw error
      return (data ?? []) as QueimadasMunicipio[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
