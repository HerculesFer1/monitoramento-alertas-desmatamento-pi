/**
 * breaks.ts — Quebras de classe estatisticamente significativas (Natural Breaks).
 *
 * Achado M5 da auditoria GIS 2026-06-02.
 *
 * BREAKS_BIOMASSA original usava thresholds [500k, 2M, 8M, 20M] tirados
 * de inspeção visual — relação 1:4:4:2.5 assimétrica produzia choropleth
 * "verde monocromático" em 80% dos municípios.
 *
 * Esta camada implementa Jenks Natural Breaks via ckmeans (Wang & Song 2011 —
 * 1D k-means com programação dinâmica). Sem dependência externa para manter
 * o bundle leve.
 *
 * Uso:
 *   const breaks = computeBreaks(values, 5)            // 5 classes
 *   const breaks = computeBreaks(values, 5, fallback)  // com fallback estático
 */

/**
 * ckmeans — 1D k-means ótimo via programação dinâmica.
 * Returna `k` clusters ordenados crescentemente.
 *
 * Referência: Wang & Song (2011) "Ckmeans.1d.dp: Optimal k-means
 * Clustering in One Dimension by Dynamic Programming"
 */
export function ckmeans(values: readonly number[], k: number): number[][] {
  if (k <= 0) throw new Error('k deve ser >= 1')
  const sorted = [...values].filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return Array.from({ length: k }, () => [])
  if (k >= n) return sorted.map(v => [v])

  // matriz D[i][j] = custo (soma de variâncias) do agrupamento ótimo de
  // sorted[0..j] em i+1 clusters; matriz B[i][j] = índice do início do
  // último cluster nesse agrupamento.
  const D: number[][] = Array.from({ length: k }, () => new Array(n).fill(0))
  const B: number[][] = Array.from({ length: k }, () => new Array(n).fill(0))

  // Custo do segmento sorted[i..j] como soma quadrática centrada.
  const segCost = (i: number, j: number): number => {
    let sum = 0
    let sumSq = 0
    for (let m = i; m <= j; m++) {
      sum += sorted[m]
      sumSq += sorted[m] * sorted[m]
    }
    const len = j - i + 1
    return sumSq - (sum * sum) / len
  }

  for (let j = 0; j < n; j++) D[0][j] = segCost(0, j)

  for (let i = 1; i < k; i++) {
    for (let j = i; j < n; j++) {
      let best = Infinity
      let bestStart = i
      for (let p = i; p <= j; p++) {
        const cost = D[i - 1][p - 1] + segCost(p, j)
        if (cost < best) {
          best = cost
          bestStart = p
        }
      }
      D[i][j] = best
      B[i][j] = bestStart
    }
  }

  // Backtrack para extrair clusters
  const clusters: number[][] = []
  let end = n - 1
  for (let i = k - 1; i >= 0; i--) {
    const start = i === 0 ? 0 : B[i][end]
    clusters.unshift(sorted.slice(start, end + 1))
    end = start - 1
    if (end < 0) break
  }
  while (clusters.length < k) clusters.unshift([])
  return clusters
}

export interface BreaksResult {
  /** Limiares (n-1 valores entre n classes — sempre crescente) */
  thresholds: number[]
  /** Limites de cada classe [min, max] (n pares para n classes) */
  ranges: Array<[number, number]>
  /** Quantidade de elementos em cada classe (n) */
  counts: number[]
  /** Indica se quebras foram computadas (true) ou se usou fallback (false) */
  computed: boolean
}

/**
 * Calcula Natural Breaks (Jenks) para `k` classes sobre `values`.
 *
 * Filtra valores não-finitos e <= 0 (não-floresta / sem dado). Se restarem
 * menos pontos que classes, retorna o fallback (ou throw se ausente).
 */
export function computeBreaks(
  values: readonly number[],
  k: number,
  fallback?: BreaksResult,
): BreaksResult {
  const positives = values.filter(v => Number.isFinite(v) && v > 0)
  if (positives.length < k) {
    if (fallback) return { ...fallback, computed: false }
    throw new Error(`Insuficiente: ${positives.length} valores positivos para ${k} classes`)
  }

  const clusters = ckmeans(positives, k)
  const thresholds: number[] = []
  const ranges: Array<[number, number]> = []
  const counts: number[] = []

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]
    if (c.length === 0) continue
    const min = c[0]
    const max = c[c.length - 1]
    ranges.push([min, max])
    counts.push(c.length)
    // threshold é o limite superior do cluster atual (= limite inferior do próximo)
    if (i < clusters.length - 1) thresholds.push(max)
  }

  return { thresholds, ranges, counts, computed: true }
}

/**
 * Formata um número para uma legenda de quebra. Use unidades curtas (k, M, B).
 */
export function fmtBreak(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} B`
  if (abs >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)} M`
  if (abs >= 1_000)         return `${(v / 1_000).toFixed(0)} mil`
  return v.toFixed(0)
}

/**
 * Constrói rótulos textuais por classe ("< X", "X – Y", "> Z").
 */
export function buildLabels(thresholds: number[], unit = ''): string[] {
  const u = unit ? ` ${unit}` : ''
  const labels: string[] = []
  for (let i = 0; i <= thresholds.length; i++) {
    if (i === 0) {
      labels.push(`< ${fmtBreak(thresholds[0])}${u}`)
    } else if (i === thresholds.length) {
      labels.push(`> ${fmtBreak(thresholds[i - 1])}${u}`)
    } else {
      labels.push(`${fmtBreak(thresholds[i - 1])} – ${fmtBreak(thresholds[i])}${u}`)
    }
  }
  return labels
}

/**
 * Constrói uma expressão MapLibre `interpolate` (linear) a partir das
 * thresholds e cores. Útil para `paint['fill-color']`.
 *
 * @param prop nome da property MapLibre (ex: 'biomassa_total_tc')
 * @param thresholds sequência crescente de limiares (n-1 para n classes)
 * @param colors paleta de tamanho n (mesma ordem dos clusters)
 */
export function buildInterpolateExpression(
  prop: string,
  thresholds: readonly number[],
  colors: readonly string[],
): unknown[] {
  const stops: unknown[] = []
  // Primeiro stop: 0 → primeira cor (incluindo valores <=0)
  stops.push(0, colors[0])
  for (let i = 0; i < thresholds.length; i++) {
    stops.push(thresholds[i], colors[i + 1] ?? colors[colors.length - 1])
  }
  return [
    'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
    ...stops,
  ]
}
