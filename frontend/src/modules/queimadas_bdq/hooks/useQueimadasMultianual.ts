/**
 * useQueimadasMultianual.ts — Hooks de queimadas em modo "Todos os anos".
 * Consomem as 3 RPCs da Migration 023: get_qb_visao_geral_multianual,
 * get_qb_municipios_multianual, get_qb_temporal_multianual.
 *
 * Janela de anos default = [ANO_MIN, ANO_DEFAULT] (toda a série).
 *
 * Convenção: por_mes representa a MÉDIA mensal entre os anos (sazonalidade
 * típica), não a soma — soma cresce com o número de anos e distorce o gráfico.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import { ANO_MIN, ANO_DEFAULT } from '../../../core/lib/constants'
import type {
  QueimadasMunicipio, QueimadasTemporalItem, QueimadasVisaoGeralResponse,
} from '../types'

const STALE = 5 * 60 * 1000

/** KPIs + por_classe + por_mes agregados na janela [anoIni, anoFim]. */
export function useQueimadasVisaoGeralMultianual(
  anoIni: number = ANO_MIN,
  anoFim: number = ANO_DEFAULT,
) {
  return useQuery<QueimadasVisaoGeralResponse>({
    queryKey: ['qb_visao_geral_multianual', anoIni, anoFim],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_visao_geral_multianual', {
        p_ano_ini: anoIni, p_ano_fim: anoFim,
      })
      if (error) throw error
      return data as QueimadasVisaoGeralResponse
    },
    staleTime: STALE,
    retry:     2,
  })
}

/** Ranking municipal com totais agregados na janela; campos extras
 *  n_anos_com_queima e ano_pico para storytelling multi-ano. */
export function useQueimadasMunicipiosMultianual(
  anoIni: number = ANO_MIN,
  anoFim: number = ANO_DEFAULT,
) {
  return useQuery<QueimadasMunicipio[]>({
    queryKey: ['qb_municipios_multianual', anoIni, anoFim],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_municipios_multianual', {
        p_ano_ini: anoIni, p_ano_fim: anoFim,
      })
      if (error) throw error
      return (data ?? []) as QueimadasMunicipio[]
    },
    staleTime: STALE,
    retry:     2,
  })
}

/** Sazonalidade média mensal entre os anos da janela. Sempre 12 entradas. */
export function useQueimadasTemporalMultianual(
  anoIni: number = ANO_MIN,
  anoFim: number = ANO_DEFAULT,
) {
  return useQuery<QueimadasTemporalItem[]>({
    queryKey: ['qb_temporal_multianual', anoIni, anoFim],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_qb_temporal_multianual', {
        p_ano_ini: anoIni, p_ano_fim: anoFim,
      })
      if (error) throw error
      return (data ?? []) as QueimadasTemporalItem[]
    },
    staleTime: STALE,
    retry:     2,
  })
}
