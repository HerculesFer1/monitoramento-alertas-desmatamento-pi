/**
 * useMatopibaQueimadas.ts — Hooks de Queimadas com recorte MATOPIBA-PI.
 * Espelha modules/queimadas_bdq/hooks/* chamando as RPCs _matopiba.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type {
  MatopibaQueimadasVisaoGeral,
  MatopibaQueimadasTemporal,
  MatopibaQueimadasRanking,
} from '../types'

const STALE       = 5 * 60 * 1000
const ANO_DEFAULT = 2025

export function useMatopibaQueimadasVisaoGeral(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano
  return useQuery<MatopibaQueimadasVisaoGeral>({
    queryKey: ['matopiba_qb_visao_geral', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_visao_geral_matopiba', { p_ano: anoParam })
      if (error) throw error
      return data as MatopibaQueimadasVisaoGeral
    },
    staleTime: STALE,
    retry:     2,
  })
}

export function useMatopibaQueimadasTemporal(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano
  return useQuery<MatopibaQueimadasTemporal>({
    queryKey: ['matopiba_qb_temporal', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_temporal_matopiba', { p_ano: anoParam })
      if (error) throw error
      return (data ?? []) as MatopibaQueimadasTemporal
    },
    staleTime: STALE,
    retry:     1,
  })
}

export function useMatopibaQueimadasRanking(ano: number | 'all' = ANO_DEFAULT, limit = 26) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano
  return useQuery<MatopibaQueimadasRanking>({
    queryKey: ['matopiba_qb_ranking', anoParam, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_ranking_matopiba', {
        p_ano: anoParam, p_limit: limit,
      })
      if (error) throw error
      return (data ?? []) as MatopibaQueimadasRanking
    },
    staleTime: STALE,
    retry:     1,
  })
}
