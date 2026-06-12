/**
 * useMatopibaProdes.ts — Filtra os hooks PRODES Cerrado pelo NOME do
 * município contra MATOPIBA_SET (source-of-truth do constants.json).
 *
 * Por que não usar `r.matopiba === true`?
 * O campo booleano `matopiba` em prodes_top_municipios é populado pelo
 * pipeline com a lista vigente no momento da carga. Quando a lista
 * oficial muda (26 → 33), os 7 novos municípios entram com matopiba=false
 * até o pipeline ser re-executado. Filtrar por nome elimina essa
 * dependência temporal — independe de re-upload.
 *
 * Limite ampliado para 250 (PI tem 224 municípios) para garantir que
 * todos os 33 MATOPIBA estejam no ranking, mesmo os de menor área.
 */
import { useMemo } from 'react'
import {
  useProdesTemporal,
  useProdesTopMunicipios,
  useProdesVisaoGeral,
} from '../../prodes_cerrado/hooks/useProdesData'
import type {
  ProdesTopMunicipio, ProdesTemporalItem, ProdesKpis,
} from '../../prodes_cerrado/hooks/useProdesData'
import { MATOPIBA_SET } from '../../../core/lib/constants'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export interface MatopibaProdesKpis {
  ano:                 number
  n_municipios:        number
  ha_irregular_total:  number
  ha_autorizado_total: number
  ha_total:            number
  pct_irregular:       number
  pct_do_estado_irr:   number   // participação MATOPIBA no irregular do PI
  n_reincidentes:      number
}

export interface MatopibaProdesResult {
  loading:        boolean
  isError:        boolean
  kpis:           MatopibaProdesKpis | null
  topMunicipios:  ProdesTopMunicipio[]
  serieAnual:     ProdesTemporalItem[]
  estado:         ProdesKpis | undefined
}

export function useMatopibaProdes(ano: number | 'all' = 2025): MatopibaProdesResult {
  const estado    = useProdesVisaoGeral(ano)
  const temporal  = useProdesTemporal()
  const ranking   = useProdesTopMunicipios(ano, 250)

  const loading = estado.isLoading || temporal.isLoading || ranking.isLoading
  const isError = estado.isError   || temporal.isError   || ranking.isError

  // Filtro por NOME contra MATOPIBA_SET — robusto a lista desatualizada
  // no backend (campo r.matopiba ignorado de propósito).
  const matopibaList = useMemo(
    () => (ranking.data ?? []).filter(r => MATOPIBA_SET.has(norm(r.municipio ?? ''))),
    [ranking.data],
  )

  const kpis: MatopibaProdesKpis | null = useMemo(() => {
    if (!matopibaList.length) return null
    const ha_irregular_total  = matopibaList.reduce((s, r) => s + (r.ha_irregular ?? 0), 0)
    const ha_total            = matopibaList.reduce((s, r) => s + (r.ha_total     ?? 0), 0)
    const n_reincidentes      = matopibaList.filter(r => r.reincidente).length
    const pct_irregular       = ha_total > 0 ? (ha_irregular_total / ha_total) * 100 : 0
    const irrEstado           = estado.data?.ha_irregular_total ?? 0
    const pct_do_estado_irr   = irrEstado > 0 ? (ha_irregular_total / irrEstado) * 100 : 0
    const ha_autorizado_total = Math.max(ha_total - ha_irregular_total, 0)

    return {
      ano:                 typeof ano === 'number' ? ano : 2025,
      n_municipios:        matopibaList.length,
      ha_irregular_total,
      ha_autorizado_total,
      ha_total,
      pct_irregular:       Math.round(pct_irregular * 10) / 10,
      pct_do_estado_irr:   Math.round(pct_do_estado_irr * 10) / 10,
      n_reincidentes,
    }
  }, [matopibaList, estado.data, ano])

  return {
    loading,
    isError,
    kpis,
    topMunicipios: matopibaList,
    serieAnual:    temporal.data ?? [],
    estado:        estado.data,
  }
}
