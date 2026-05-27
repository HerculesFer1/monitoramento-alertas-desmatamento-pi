// @ts-nocheck
/**
 * usePeriodCoverage.ts — Módulo areas_prioritarias
 * Query para get_ap_periodo_cobertura(): retorna o período real coberto
 * pelo PRODES e o gap coberto pelo DETER.
 *
 * Alimenta o componente PeriodBadge (overlay no canto do mapa).
 * Sincroniza o resultado no Zustand store (setPeriodCoverage).
 */
import { useEffect } from 'react'
import { useQuery }  from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { useAppStore }  from '../../../core/store/useAppStore'
import type { PeriodCoverage } from '../types'

// Reutiliza instância do projeto se disponível via env
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const STALE = 10 * 60 * 1000  // 10 minutos — dado raramente muda durante sessão

/**
 * Busca o período de cobertura de dados do banco e sincroniza no store.
 *
 * @param ano  Ano PRODES a consultar (default: 2024)
 * @returns    Objeto com dados do período e estado da query
 *
 * @example
 * const { data, isLoading } = usePeriodCoverage(2024)
 * // data.image_date_min  → '2024-08-01'
 * // data.deter_gap_fim   → '2026-05-27' (data de hoje, se gap ativo)
 */
export function usePeriodCoverage(ano: number | 'all' = 2024) {
  const anoParam       = ano === 'all' ? 2024 : ano
  const setPeriodCoverage = useAppStore((s) => s.setPeriodCoverage)

  const query = useQuery<PeriodCoverage | null>({
    queryKey: ['ap_periodo_cobertura', anoParam],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_ap_periodo_cobertura', {
        p_ano: anoParam,
      })

      if (error) {
        // Log mas não propaga — PeriodBadge é informativo, não crítico
        console.warn('[usePeriodCoverage] RPC error:', error.message)
        return null
      }

      return data as PeriodCoverage | null
    },
    staleTime: STALE,
    retry:     1,   // menos agressivo — dado informativo
  })

  // Sincronizar no store sempre que os dados mudarem
  useEffect(() => {
    if (query.data !== undefined) {
      setPeriodCoverage(query.data)
    }
  }, [query.data, setPeriodCoverage])

  return query
}

/**
 * Formata um período de cobertura para exibição legível.
 *
 * @example
 * formatPeriodLabel({
 *   image_date_min: '2024-08-01',
 *   image_date_max: '2025-07-31',
 *   deter_gap_inicio: '2025-08-01',
 *   deter_gap_fim: '2026-05-27',
 *   fonte_complementar: 'DETER',
 * })
 * // → { prodes: 'ago/2024 – jul/2025', deter: 'ago/2025 – maio/2026' }
 */
export function formatPeriodLabel(coverage: PeriodCoverage | null): {
  prodes: string | null
  deter:  string | null
} {
  if (!coverage) return { prodes: null, deter: null }

  const fmt = (iso: string | null): string | null => {
    if (!iso) return null
    const d = new Date(iso + 'T00:00:00Z')
    return d.toLocaleDateString('pt-BR', {
      month: 'short',
      year:  'numeric',
      timeZone: 'UTC',
    })
  }

  const prodes =
    coverage.image_date_min && coverage.image_date_max
      ? `${fmt(coverage.image_date_min)} – ${fmt(coverage.image_date_max)}`
      : null

  const deter =
    coverage.fonte_complementar === 'DETER' &&
    coverage.deter_gap_inicio &&
    coverage.deter_gap_fim
      ? `${fmt(coverage.deter_gap_inicio)} – ${fmt(coverage.deter_gap_fim)}`
      : null

  return { prodes, deter }
}
