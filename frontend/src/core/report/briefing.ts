/**
 * briefing.ts — Gerador de briefing markdown para análise externa por IA.
 *
 * Produz um documento markdown estruturado a partir do ReportSnapshot,
 * pronto para colar em ChatGPT/Gemini/Claude. O briefing inclui:
 *
 *  - Contexto institucional do dashboard
 *  - KPIs com valores e interpretação curta
 *  - Tabela detalhada (top municípios ou distribuição por classe)
 *  - Análise narrativa
 *  - Metodologia resumida
 *  - Limitações
 *  - Perguntas sugeridas (encoraja análise crítica)
 *
 * Tamanho típico: 3-8 KB. Cabe em uma colagem única no chat.
 */
import type { ReportSnapshot } from './types'
import { destaquesAutomaticos } from './conclusoes'

const ASSINATURA = (
  '> Dashboard CGEO/SEMARH-PI · Programa Jurisdicional REDD+ Piauí · ' +
  'Estimativa exploratória — não substitui autuação ambiental institucional.'
)

export function buildBriefingMarkdown(snapshot: ReportSnapshot): string {
  const linhas: string[] = []
  const periodo = snapshot.ano === 'all' ? 'série 2022-2025' : `ano ${snapshot.ano}`

  // Header
  linhas.push(`# Relatório — ${snapshot.nomeModulo}`)
  linhas.push('')
  linhas.push(`**Período:** ${periodo}  `)
  linhas.push(`**Emissão:** ${snapshot.dataEmissao.toLocaleString('pt-BR')}`)
  linhas.push('')
  linhas.push(ASSINATURA)
  linhas.push('')
  linhas.push('---')
  linhas.push('')

  // Resumo executivo
  if (snapshot.resumoExecutivo.length > 0) {
    linhas.push('## Resumo executivo')
    linhas.push('')
    for (const p of snapshot.resumoExecutivo) linhas.push(p)
    linhas.push('')
  }

  // KPIs em tabela markdown
  if (snapshot.kpis.length > 0) {
    linhas.push('## Indicadores principais')
    linhas.push('')
    linhas.push('| Indicador | Valor | Contexto |')
    linhas.push('|---|---|---|')
    for (const k of snapshot.kpis) {
      const ctx = (k.contexto ?? '').replace(/\|/g, '\\|')
      linhas.push(`| ${k.rotulo} | **${k.valor}** | ${ctx} |`)
    }
    linhas.push('')
  }

  // Destaques automáticos
  const destaques = destaquesAutomaticos(snapshot)
  if (destaques.length > 0) {
    linhas.push('## Destaques automáticos')
    linhas.push('')
    for (const d of destaques) linhas.push(`- ${d}`)
    linhas.push('')
  }

  // Tabela detalhada
  if (snapshot.tabela && snapshot.tabela.linhas.length > 0) {
    linhas.push(`## ${snapshot.tabela.titulo}`)
    linhas.push('')
    linhas.push('| ' + snapshot.tabela.cabecalho.join(' | ') + ' |')
    linhas.push('| ' + snapshot.tabela.cabecalho.map(() => '---').join(' | ') + ' |')
    // Limita a 15 linhas para caber em payload de IA
    const limite = Math.min(snapshot.tabela.linhas.length, 15)
    for (let i = 0; i < limite; i++) {
      const linha = snapshot.tabela.linhas[i]
      linhas.push('| ' + linha.map(c => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |')
    }
    if (snapshot.tabela.linhas.length > limite) {
      linhas.push('')
      linhas.push(`_(+ ${snapshot.tabela.linhas.length - limite} linhas omitidas no briefing)_`)
    }
    linhas.push('')
  }

  // Análise
  if (snapshot.analise.length > 0) {
    linhas.push('## Análise')
    linhas.push('')
    for (const p of snapshot.analise) linhas.push(`- ${p}`)
    linhas.push('')
  }

  // Metodologia
  if (snapshot.metodologia) {
    linhas.push('## Metodologia resumida')
    linhas.push('')
    linhas.push(`**Pergunta de pesquisa:** ${snapshot.metodologia.pergunta}`)
    linhas.push('')
    if (snapshot.metodologia.como_calcula.length > 0) {
      linhas.push('**Como o cálculo é feito:**')
      for (const p of snapshot.metodologia.como_calcula) linhas.push(`- ${p}`)
      linhas.push('')
    }
    if (snapshot.metodologia.simbologia.length > 0) {
      linhas.push('**Simbologia:**')
      for (const s of snapshot.metodologia.simbologia) linhas.push(`- ${s}`)
      linhas.push('')
    }
  }

  // Limitações
  if (snapshot.limitacoes.length > 0) {
    linhas.push('## Limitações conhecidas')
    linhas.push('')
    for (const l of snapshot.limitacoes) linhas.push(`- ${l}`)
    linhas.push('')
  }

  // Fontes
  if (snapshot.fontes.length > 0) {
    linhas.push('## Fontes')
    linhas.push('')
    for (const f of snapshot.fontes) linhas.push(`- ${f}`)
    linhas.push('')
  }

  // Perguntas sugeridas para a IA
  linhas.push('---')
  linhas.push('')
  linhas.push('## Perguntas para análise crítica')
  linhas.push('')
  linhas.push(
    'Com base no briefing acima, considere especialmente:',
  )
  linhas.push('')
  linhas.push('1. Os indicadores são consistentes entre si? Há contradições ou tensões?')
  linhas.push('2. Quais os principais riscos metodológicos para a tomada de decisão?')
  linhas.push('3. Que recortes adicionais (temporal, geográfico, classe) ajudariam a refinar o diagnóstico?')
  linhas.push('4. O resultado é compatível com a literatura científica sobre desmatamento no Cerrado/Caatinga?')
  linhas.push('5. Que pontos do briefing parecem incompletos ou exigem dados externos para validação?')
  linhas.push('')

  return linhas.join('\n')
}

/**
 * Prompt curto orientador para IA — vai como query string. Mantém embaixo
 * de ~600 caracteres para caber confortavelmente em URLs.
 */
export function buildPromptOrientador(snapshot: ReportSnapshot): string {
  return (
    `Olá! Vou colar um briefing do dashboard de monitoramento REDD+ Piauí (módulo ${snapshot.nomeModulo}). ` +
    `Por favor faça uma análise crítica: principais riscos, contradições nos indicadores, ` +
    `e recomendações para gestão ambiental. Responda em português, com bullets concisos. ` +
    `O briefing vem na próxima mensagem.`
  )
}
