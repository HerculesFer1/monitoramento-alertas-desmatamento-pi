/**
 * useMatopibaAlertasClient.ts — Hooks de Alertas MATOPIBA totalmente
 * client-side, agregando a partir de useAgregado() (que carrega a tabela
 * agregado_municipios via PostgREST REST direto, não via RPC).
 *
 * Por que não usar get_resumo_matopiba / get_matopiba_municipios?
 * O cache do PostgREST está preso e não consegue ver as RPCs MATOPIBA
 * recém-criadas. Este hook contorna o problema usando apenas o endpoint
 * `from('agregado_municipios').select('*')`, que continua funcionando.
 *
 * Quando o suporte do Supabase destravar o cache, este hook continua
 * válido — só perde a otimização server-side (sem custo perceptível para
 * 33 municípios × 4 anos = 132 linhas).
 */
import { useMemo } from 'react'
import { useAgregado } from '../../../core/lib/hooks'
import { MATOPIBA_SET } from '../../../core/lib/constants'
import type {
  MatopibaResumo, MatopibaMunicipio, AgregadoRow,
} from '../../../core/lib/queries'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const isMatopiba = (row: AgregadoRow) => MATOPIBA_SET.has(norm(row.municipio ?? ''))

const round1 = (n: number) => Math.round(n * 10) / 10

/* ── Resumo MATOPIBA por ano ─────────────────────────────────────────── */
export function useResumoMatopibaClient() {
  const q = useAgregado()
  const data = useMemo<MatopibaResumo[]>(() => {
    if (!q.data?.length) return []
    const rows = q.data.filter(isMatopiba)
    const byAno = new Map<number, AgregadoRow[]>()
    for (const r of rows) {
      if (!byAno.has(r.ano)) byAno.set(r.ano, [])
      byAno.get(r.ano)!.push(r)
    }
    const result: MatopibaResumo[] = []
    const anosOrdenados = [...byAno.keys()].sort((a, b) => a - b)
    let prevIpi: number | null = null
    for (const ano of anosOrdenados) {
      const items = byAno.get(ano)!
      const ha_total            = items.reduce((s, r) => s + (r.ha_total ?? 0), 0)
      const ha_irregular        = items.reduce((s, r) => s + (r.ha_irregular ?? 0), 0)
      const ha_autorizado_total = items.reduce((s, r) => s + (r.ha_autorizado_total ?? 0), 0)
      const ha_regularizado     = items.reduce((s, r) => s + (r.ha_regularizado ?? 0), 0)
      const n_municipios        = items.length
      const n_reincidentes      = items.filter(r => r.reincidente).length
      const ipi                 = ha_total > 0 ? round1((ha_irregular / ha_total) * 100) : 0
      const delta_ipi_yoy       = prevIpi == null ? null : round1(ipi - prevIpi)
      result.push({
        ano, n_municipios, n_reincidentes,
        ha_total: round1(ha_total),
        ha_irregular: round1(ha_irregular),
        ha_autorizado_total: round1(ha_autorizado_total),
        ha_regularizado: round1(ha_regularizado),
        ipi, delta_ipi_yoy,
      })
      prevIpi = ipi
    }
    return result
  }, [q.data])

  return { ...q, data }
}

/* ── Ranking municipal MATOPIBA ──────────────────────────────────────── */
export function useMatopibaMunicipiosClient(ano?: number) {
  const q = useAgregado()
  const data = useMemo<MatopibaMunicipio[]>(() => {
    if (!q.data?.length) return []
    let rows = q.data.filter(isMatopiba)
    if (ano != null) rows = rows.filter(r => r.ano === ano)
    // Rank dentro de cada ano por ha_irregular desc
    const byAno = new Map<number, AgregadoRow[]>()
    for (const r of rows) {
      if (!byAno.has(r.ano)) byAno.set(r.ano, [])
      byAno.get(r.ano)!.push(r)
    }
    const out: MatopibaMunicipio[] = []
    for (const [anoKey, items] of byAno) {
      const sorted  = [...items].sort((a, b) => (b.ha_irregular ?? 0) - (a.ha_irregular ?? 0))
      const totIrr  = sorted.reduce((s, r) => s + (r.ha_irregular ?? 0), 0)
      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i]
        out.push({
          municipio:               r.municipio,
          ano:                     anoKey,
          bioma_predominante:      r.bioma_predominante,
          ha_irregular:            r.ha_irregular,
          ha_autorizado_total:     r.ha_autorizado_total,
          ha_total:                r.ha_total,
          pct_irregular:           r.pct_irregular,
          num_alertas:             r.num_alertas,
          reincidente:             r.reincidente,
          vpressao_dominante_ptbr: r.vpressao_dominante_ptbr,
          rank_irr_matopiba:       i + 1,
          pct_do_matopiba_irr:     totIrr > 0 ? round1((r.ha_irregular / totIrr) * 100) : 0,
          delta_ipi_yoy:           null,
        })
      }
    }
    return out
  }, [q.data, ano])

  return { ...q, data }
}
