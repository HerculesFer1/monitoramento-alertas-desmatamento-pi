/**
 * useAreasData.ts — TanStack Query hooks para o módulo areas_prioritarias.
 * Consulta RPCs do Supabase. Padrão: staleTime 5min, retry 2.
 */
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type {
  VisaoGeralResponse,
  MunicipioDetalheResponse,
  MunicipioResumo,
} from '../types'

const STALE = 5 * 60 * 1000  // 5 minutos
const ANO_DEFAULT = 2025      // único ano com dados disponíveis

// ── Visão Geral ───────────────────────────────────────────────────────────────

export function useVisaoGeral(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<VisaoGeralResponse>({
    queryKey: ['ap_visao_geral', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_visao_geral', {
        p_ano: anoParam,
      })
      if (error) throw error
      return data as VisaoGeralResponse
    },
    staleTime: STALE,
    retry:     2,
  })
}

// ── Detalhe de município ──────────────────────────────────────────────────────

export function useMunicipioDetalhe(
  cod:  string | null,
  ano:  number | 'all' = ANO_DEFAULT,
) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<MunicipioDetalheResponse>({
    queryKey: ['ap_municipio_detalhe', cod, anoParam],
    enabled:  isSupabaseConfigured && !!cod,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_municipio_detalhe', {
        p_cod: cod,
        p_ano: anoParam,
      })
      if (error) throw error
      return data as MunicipioDetalheResponse
    },
    staleTime: STALE,
    retry:     2,
  })
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function useRanking(
  ano:     number | 'all' = ANO_DEFAULT,
  orderby: string = 'area_floresta_ha',
  limit:   number = 224,
) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<MunicipioResumo[]>({
    queryKey: ['ap_ranking', anoParam, orderby, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_ranking', {
        p_ano:     anoParam,
        p_orderby: orderby,
        p_limit:   limit,
      })
      if (error) throw error
      return data as MunicipioResumo[]
    },
    staleTime: STALE,
    retry:     2,
  })
}

// ── GeoJSON para mapa ─────────────────────────────────────────────────────────

export function useAreasGeoJson(
  ano: number | 'all' = ANO_DEFAULT,
  cod: string | null  = null,
) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<FeatureCollection>({
    queryKey: ['ap_geojson', anoParam, cod],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_geojson', {
        p_ano: anoParam,
        p_cod: cod,
      })
      if (error) throw error
      return data as FeatureCollection
    },
    staleTime: STALE,
    retry:     2,
  })
}
