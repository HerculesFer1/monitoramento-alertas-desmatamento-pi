/**
 * useProdesData.ts — Hooks do módulo PRODES Cerrado.
 *
 * RPCs Supabase:
 *  - get_prodes_visao_geral(p_ano)         → KPIs anuais
 *  - get_prodes_temporal()                 → série anual
 *  - get_prodes_top_municipios(p_ano, n)   → top N municípios por irregular
 *  - get_prodes_municipios_geojson(p_ano)  → FeatureCollection para choropleth
 */
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../../../core/lib/supabase'
import type { FeatureCollection } from 'geojson'

const STALE       = 5 * 60 * 1000
const ANO_DEFAULT = 2025

export interface ProdesKpis {
  ano:                          number
  n_municipios_com_irregular:   number
  n_municipios_total:           number
  ha_irregular_total:           number
  ha_autorizado_total:          number
  ha_regularizado_total:        number
  ha_total:                     number
  n_poligonos:                  number
  n_reincidentes:               number
  n_matopiba:                   number
  pct_irregular_estado:         number
}

export interface ProdesTemporalItem {
  ano:                 number
  ha_irregular:        number
  ha_autorizado_total: number
  ha_regularizado:     number
  ha_total:            number
  n_municipios:        number
  n_poligonos:         number
  pct_irregular:       number
}

export interface ProdesTopMunicipio {
  rank:                number
  municipio:           string
  ha_irregular:        number
  ha_total:            number
  pct_irregular:       number
  n_poligonos:         number
  matopiba:            boolean
  reincidente:         boolean
  anos_com_irregular:  number[]
}

const resolveAno = (ano: number | 'all') => (ano === 'all' ? ANO_DEFAULT : ano)

export function useProdesVisaoGeral(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = resolveAno(ano)
  return useQuery<ProdesKpis>({
    queryKey: ['prodes_visao_geral', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_prodes_visao_geral', { p_ano: anoParam })
      if (error) throw error
      return data as ProdesKpis
    },
    staleTime: STALE,
  })
}

export function useProdesTemporal() {
  return useQuery<ProdesTemporalItem[]>({
    queryKey: ['prodes_temporal'],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_prodes_temporal')
      if (error) throw error
      return (data ?? []) as ProdesTemporalItem[]
    },
    staleTime: STALE,
  })
}

export function useProdesTopMunicipios(ano: number | 'all' = ANO_DEFAULT, limit = 20) {
  const anoParam = resolveAno(ano)
  return useQuery<ProdesTopMunicipio[]>({
    queryKey: ['prodes_top', anoParam, limit],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_prodes_top_municipios', {
        p_ano: anoParam, p_limit: limit,
      })
      if (error) throw error
      return (data ?? []) as ProdesTopMunicipio[]
    },
    staleTime: STALE,
  })
}

export function useProdesGeoJson(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = resolveAno(ano)
  return useQuery<FeatureCollection>({
    queryKey: ['prodes_geojson', anoParam],
    enabled:  isSupabaseConfigured,
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_prodes_municipios_geojson', { p_ano: anoParam })
      if (error) throw error
      return data as FeatureCollection
    },
    staleTime: STALE,
  })
}
