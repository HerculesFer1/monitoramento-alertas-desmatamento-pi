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

  // Perguntas sugeridas para a IA — específicas por módulo
  linhas.push('---')
  linhas.push('')
  linhas.push('## Perguntas para análise')
  linhas.push('')
  linhas.push('Responda objetivamente, citando os números do briefing acima:')
  linhas.push('')
  for (const p of perguntasPorModulo(snapshot.modulo)) linhas.push(p)
  linhas.push('')

  return linhas.join('\n')
}

/**
 * Conjunto de perguntas objetivas por módulo. Cada item força a IA a olhar
 * para um dado específico do briefing e produzir leitura interpretativa
 * (em vez de divagação metodológica genérica).
 */
function perguntasPorModulo(modulo: string): string[] {
  switch (modulo) {
    case 'mapbiomas':
      return [
        '1. Qual foi a variação absoluta e percentual do IPI entre 2022 e 2025? A tendência é de queda sustentada ou oscilatória?',
        '2. Qual a participação relativa de AUTORIZADO_PARCIALMENTE no total autorizado? Esse padrão sugere ASVs subdimensionadas ou alertas que extrapolam o polígono autorizado?',
        '3. Entre os municípios reincidentes listados, quais concentram o maior volume de área irregular acumulada (2022–2025)?',
        '4. O vetor de pressão dominante muda entre Cerrado e Caatinga? Como isso afeta a priorização de fiscalização?',
        '5. Qual a defasagem média entre detecção e publicação? Esse atraso compromete a janela útil para autuação preventiva?',
      ]
    case 'prodes':
      return [
        '1. A concordância PRODES × MapBiomas (atual no briefing) é compatível com a literatura para o Cerrado piauiense?',
        '2. A tendência de concordância está crescendo ou caindo ano a ano? O que isso sinaliza sobre maturidade das duas plataformas?',
        '3. Entre os vetores de pressão, qual tem MENOR concordância PRODES? Existe explicação plausível (resolução espacial, sazonalidade)?',
        '4. Os municípios com maior área irregular PRODES-confirmada coincidem com os reincidentes do MapBiomas? Lista os 3 principais.',
        '5. A coluna "SEM_PRODES_NO_CICLO" representa alertas pós-julho/2025. Esse vácuo institucional impacta a tomada de decisão de 2026?',
      ]
    case 'queimadas_bdq':
      return [
        '1. Em que mês ocorre o pico de área queimada? A sazonalidade observada confirma o padrão clássico do Cerrado piauiense (agosto–outubro)?',
        '2. Quais municípios concentram >50% da área queimada total no recorte? Eles coincidem com os de maior área irregular MapBiomas?',
        '3. Que fração da área queimada cai em classes de prioridade 4–5 (Alto e Muito Alto)? Isso indica fogo concentrado em áreas críticas para conservação?',
        '4. A relação cicatrizes × área média indica eventos pequenos e dispersos ou poucos focos grandes? Como isso muda a resposta operacional?',
        '5. Há municípios com classe_max_queimada=5 (Muito Alto) que ainda NÃO aparecem em outras camadas (alertas, PRODES)? Eles devem entrar em monitoramento preventivo?',
      ]
    case 'areas_prioritarias':
      return [
        '1. Qual a relação entre área florestal total e desmatamento PRODES no recorte? O percentual desmatado é compatível com a média do bioma?',
        '2. Em que classe de prioridade (1 a 5) está concentrada a maior biomassa AGB? Essa concentração reforça a urgência de proteção dessa classe?',
        '3. Quantos municípios têm classe máxima = 5 (Muito Alto)? Esses são alvos prioritários para créditos REDD+ ou para fiscalização?',
        '4. O DETER (alertas pós-PRODES) sinaliza desmatamento ativo em municípios que estavam estáveis? Lista os principais.',
        '5. A biomassa total (em tC) do recorte equivale aproximadamente a quantos MtCO₂eq se o desmatamento atual continuar? Use o fator 3,67.',
      ]
    case 'matopiba':
      return [
        '1. **Alertas MapBiomas**: o IPI MATOPIBA está acima ou abaixo do IPI estadual? A diferença sugere pressão concentrada ou distribuída?',
        '2. **PRODES**: qual a participação do MATOPIBA-PI no irregular PRODES total do estado? Esse percentual é proporcional à área territorial (~15% do PI)?',
        '3. **Queimadas**: quantos dos 33 municípios MATOPIBA estão afetados por fogo? A % em classe crítica (4+5) ultrapassa 50%?',
        '4. **Áreas Prioritárias**: quantos municípios MATOPIBA estão em classe 5 (Muito Alto)? Quanta biomassa total está nessa região (em MtC)?',
        '5. **Cruzamento**: existem municípios que aparecem como críticos em TODOS os quatro módulos? Eles seriam os candidatos a intervenção prioritária imediata.',
      ]
    default:
      return [
        '1. Os números apresentados são consistentes entre os indicadores? Identifique qualquer divergência aparente.',
        '2. Qual o KPI mais alarmante deste recorte e o que ele exige de resposta institucional?',
        '3. Que tendência temporal pode ser inferida dos dados (alta, queda, estabilidade)?',
        '4. Quais municípios listados na tabela demandam ação prioritária e por quê?',
        '5. Há informação faltante neste briefing que impediria uma decisão de gestão? Especifique.',
      ]
  }
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
