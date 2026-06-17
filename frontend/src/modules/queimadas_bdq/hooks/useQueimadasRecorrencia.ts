/**
 * useQueimadasRecorrencia.ts — queimadas_bdq
 * Consome RPC get_qb_recorrencia(p_ano_ini, p_ano_fim, p_limit) — migration 017.
 * Retorna municípios com IRF (índice de recorrência de fogo) >= 0.5.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type { QueimadasRecorrenciaItem } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasRecorrencia(anoInicio = 2022, anoFim = 2025, limit = 50) {
  return useQuery<QueimadasRecorrenciaItem[]>({
    queryKey: ['qb_recorrencia', anoInicio, anoFim, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_recorrencia', {
        p_ano_ini: anoInicio,
        p_ano_fim: anoFim,
        p_limit:   limit,
      })
      if (error) throw error
      return (data ?? []) as QueimadasRecorrenciaItem[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
