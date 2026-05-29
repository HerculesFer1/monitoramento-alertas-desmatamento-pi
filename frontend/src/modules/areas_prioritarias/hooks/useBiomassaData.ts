// @ts-nocheck
/**
 * useBiomassaData.ts — Hook para a Tab Biomassa (areas_prioritarias).
 * Fornece dados para o mapa coroplético (municipal) e o heatmap (classe × município).
 *
 * Responde à Questão 3: "Onde está o maior estoque de carbono florestal intacto?"
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../core/lib/supabase'
import type { ClassePrioridade } from '../types'

const STALE    = 30 * 60 * 1000  // 30 min — dados mudam apenas com nova execução do pipeline
const ANO_DEFAULT = 2025

/** Uma linha do heatmap: município + AGB por classe */
export interface HeatmapRow {
  municipio_cod:   string
  municipio_nome:  string
  biomassa_total:  number | null
  agb_por_classe:  Record<ClassePrioridade, { agb: number | null; area_floresta: number }>
}

/**
 * Busca top-15 municípios por biomassa florestal total e AGB por classe.
 * Alimenta o heatmap da Tab Biomassa.
 */
export function useBiomassaHeatmap(ano: number | 'all' = ANO_DEFAULT) {
  const anoParam = ano === 'all' ? ANO_DEFAULT : ano

  return useQuery<HeatmapRow[]>({
    queryKey: ['ap_biomassa_heatmap', anoParam],
    queryFn:  async () => {
      // 1. Top 15 municípios por biomassa florestal
      const { data: top15, error: e1 } = await supabase
        .from('ap_municipios_resumo')
        .select('municipio_cod, municipio_nome, biomassa_floresta_tc, agb_medio_tc_ha')
        .eq('ano_prodes', anoParam)
        .not('biomassa_floresta_tc', 'is', null)
        .order('biomassa_floresta_tc', { ascending: false })
        .limit(15)

      if (e1) throw e1
      if (!top15?.length) return []

      const munCods = top15.map((r: any) => r.municipio_cod)

      // 2. AGB por classe para esses municípios
      const { data: classes, error: e2 } = await supabase
        .from('ap_classes_municipio')
        .select('municipio_cod, classe_prioridade, agb_medio_tc_ha, area_floresta_ha')
        .eq('ano_prodes', anoParam)
        .in('municipio_cod', munCods)

      if (e2) throw e2

      // 3. Montar matriz heatmap
      return (top15 as any[]).map((mun) => ({
        municipio_cod:  mun.municipio_cod,
        municipio_nome: mun.municipio_nome,
        biomassa_total: mun.biomassa_floresta_tc,
        agb_por_classe: ((classes ?? []) as any[])
          .filter((c) => c.municipio_cod === mun.municipio_cod)
          .reduce(
            (acc, c) => ({
              ...acc,
              [c.classe_prioridade]: {
                agb:           c.agb_medio_tc_ha,
                area_floresta: c.area_floresta_ha,
              },
            }),
            {} as Record<ClassePrioridade, { agb: number | null; area_floresta: number }>,
          ),
      }))
    },
    staleTime: STALE,
    retry:     2,
  })
}
