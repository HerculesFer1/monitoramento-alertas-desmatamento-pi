/**
 * useQueimadasSerieAnual.ts — queimadas_bdq
 * Consome RPC get_qb_serie_anual(p_ano_ini, p_ano_fim) — migration 017.
 * Retorna área queimada / cicatrizes / municípios afetados / pct prioritária por ano.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_MIN, ANO_DEFAULT } from '../../../core/lib/constants'
import type { QueimadasSerieAnualItem } from '../types'

const STALE = 5 * 60 * 1000

export function useQueimadasSerieAnual(anoInicio = ANO_MIN, anoFim = ANO_DEFAULT) {
  return useQuery<QueimadasSerieAnualItem[]>({
    queryKey: ['qb_serie_anual', anoInicio, anoFim],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_serie_anual', {
        p_ano_ini: anoInicio,
        p_ano_fim: anoFim,
      })
      if (error) throw error
      return (data ?? []) as QueimadasSerieAnualItem[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
