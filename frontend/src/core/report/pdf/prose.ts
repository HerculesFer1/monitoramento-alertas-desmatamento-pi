/**
 * prose.ts — Helpers de redação imparcial para o relatório.
 *
 * Padrão CGEO: número + contexto, nunca número + adjetivo de opinião.
 * Toda comparação tem referência explícita.
 */

/** Formata número grande com separador pt-BR. */
export function fmtNumero(n: number, dec = 0): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** Formata hectares com sufixo "ha". */
export function fmtHectares(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M ha`
  if (n >= 1000)      return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil ha`
  return `${fmtNumero(n, 0)} ha`
}

/** Formata percentual com 1 casa decimal. */
export function fmtPct(n: number, dec = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`
}

/** Adiciona contexto de comparação a um valor (ex: "6,8× a média"). */
export function comContexto(valor: number, referencia: number, descRef: string): string {
  if (!Number.isFinite(valor) || !Number.isFinite(referencia) || referencia === 0) return ''
  const mult = valor / referencia
  if (mult >= 2)   return ` (${fmtNumero(mult, 1)}× ${descRef})`
  if (mult >= 1.1) return ` (${fmtNumero((mult - 1) * 100, 0)}% acima ${descRef})`
  if (mult <= 0.9) return ` (${fmtNumero((1 - mult) * 100, 0)}% abaixo ${descRef})`
  return ` (próximo ${descRef})`
}

/** Variação em pontos percentuais entre dois valores. */
export function fmtVariacaoPP(atual: number, anterior: number): string {
  const delta = atual - anterior
  const sinal = delta > 0 ? '+' : ''
  return `${sinal}${fmtNumero(delta, 1)} pp`
}

/** Cita uma fonte com data de acesso. */
export function citaFonte(provedor: string, dataISO: string = new Date().toISOString().slice(0, 10)): string {
  const [a, m, d] = dataISO.split('-')
  return `Fonte: ${provedor} · acesso em ${d}/${m}/${a}`
}

/** Quebra um texto longo em paragrafos imparciais. Tras um array de strings. */
export function paragrafosImparciais(...textos: string[]): string[] {
  return textos.filter(t => t && t.trim().length > 0).map(t => t.trim())
}
