/**
 * conclusoes.ts — Destaques automáticos a partir do ReportSnapshot.
 *
 * Regras determinísticas (não-LLM) — auditáveis e reprodutíveis. A função
 * `destaquesAutomaticos` inspeciona os KPIs e a tabela do snapshot e produz
 * 2-4 bullets curtos para a seção "Destaques" do relatório web.
 *
 * Heurísticas:
 *   - Conta KPIs em estado crítico (cor === --irr)
 *   - Conta KPIs em estado positivo (cor === --aut)
 *   - Identifica número-líder em KPI (maior valor)
 *   - Identifica primeiro/último item da tabela quando disponível
 */
import type { ReportSnapshot } from './types'

const COR_IRR = ['#EF4444', '#B91C1C']    // dark + light
const COR_AUT = ['#10B981', '#047857']
const COR_REG = ['#F97316', '#C2410C']

function ehCor(c: string | undefined, set: string[]): boolean {
  if (!c) return false
  return set.some(x => c.toUpperCase().includes(x.toUpperCase()))
}

export function destaquesAutomaticos(snapshot: ReportSnapshot): string[] {
  const out: string[] = []

  const kpis    = snapshot.kpis ?? []
  const tabela  = snapshot.tabela

  // 1. Estado geral via cores dos KPIs
  const nCriticos  = kpis.filter(k => ehCor(k.cor, COR_IRR)).length
  const nPositivos = kpis.filter(k => ehCor(k.cor, COR_AUT)).length
  const nNeutros   = kpis.filter(k => ehCor(k.cor, COR_REG)).length

  if (nCriticos > 0 && nCriticos >= kpis.length / 2) {
    out.push(
      `Cenário com ${nCriticos} de ${kpis.length} indicadores em estado crítico — atenção requerida.`,
    )
  } else if (nPositivos > 0 && nPositivos >= kpis.length / 2) {
    out.push(
      `Cenário com ${nPositivos} de ${kpis.length} indicadores em estado positivo no período avaliado.`,
    )
  } else if (nCriticos > 0 || nNeutros > 0) {
    out.push(
      `Indicadores mistos: ${nPositivos} positivo${nPositivos === 1 ? '' : 's'}, ${nNeutros} em atenção, ${nCriticos} crítico${nCriticos === 1 ? '' : 's'}.`,
    )
  }

  // 2. Líder de tabela (primeira linha — normalmente top)
  if (tabela && tabela.linhas.length > 0) {
    const primeiraLinha = tabela.linhas[0]
    const nomeColuna = tabela.cabecalho[0] ?? 'item'
    const valor      = primeiraLinha[0]
    if (valor != null) {
      out.push(
        `${capitalizar(String(nomeColuna))} líder no recorte: ${String(valor)} (${tabela.titulo.toLowerCase()}).`,
      )
    }
  }

  // 3. Quantidade de bullets de análise/resumo — indicador de completude.
  const nAnalise = (snapshot.analise ?? []).length
  if (nAnalise >= 3) {
    out.push(
      `Análise detalhada com ${nAnalise} observações — ver seção "Análise" abaixo.`,
    )
  }

  // 4. Período avaliado
  const periodo = snapshot.ano === 'all' ? 'série completa 2022-2025' : `ano ${snapshot.ano}`
  out.push(`Período avaliado: ${periodo}. Snapshot emitido em ${formatarData(snapshot.dataEmissao)}.`)

  return out
}

function capitalizar(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatarData(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
