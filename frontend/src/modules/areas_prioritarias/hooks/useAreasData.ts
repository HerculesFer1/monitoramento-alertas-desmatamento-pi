/**
 * useAreasData.ts — TanStack Query hooks para o módulo areas_prioritarias.
 * Consulta RPCs do Supabase. Padrão: staleTime 5min, retry 2.
 */
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import type {
  VisaoGeralResponse,
  MunicipioDetalheResponse,
  MunicipioResumo,
} from '../types'

// Cliente Supabase (reutilizar instância do projeto se existir)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const STALE = 5 * 60 * 1000  // 5 minutos

// ── Visão Geral ───────────────────────────────────────────────────────────────

export function useVisaoGeral(ano: number | 'all' = 2025) {
  const anoParam = ano === 'all' ? 2025 : ano

  return useQuery<VisaoGeralResponse>({
    queryKey: ['ap_visao_geral', anoParam],
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
  ano:  number | 'all' = 2025,
) {
  const anoParam = ano === 'all' ? 2025 : ano

  return useQuery<MunicipioDetalheResponse>({
    queryKey: ['ap_municipio_detalhe', cod, anoParam],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_municipio_detalhe', {
        p_cod: cod,
        p_ano: anoParam,
      })
      if (error) throw error
      return data as MunicipioDetalheResponse
    },
    enabled:   !!cod,   // só executa quando um município estiver selecionado
    staleTime: STALE,
    retry:     2,
  })
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function useRanking(
  ano:     number | 'all' = 2025,
  orderby: string = 'area_floresta_ha',
  limit:   number = 224,
) {
  const anoParam = ano === 'all' ? 2025 : ano

  return useQuery<MunicipioResumo[]>({
    queryKey: ['ap_ranking', anoParam, orderby, limit],
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
  ano: number | 'all' = 2025,
  cod: string | null  = null,
) {
  const anoParam = ano === 'all' ? 2025 : ano

  return useQuery({
    queryKey: ['ap_geojson', anoParam, cod],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_geojson', {
        p_ano: anoParam,
        p_cod: cod,
      })
      if (error) throw error
      return data
    },
    staleTime: STALE,
    retry:     2,
  })
}
