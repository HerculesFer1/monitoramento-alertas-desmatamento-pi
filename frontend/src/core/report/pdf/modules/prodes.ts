/**
 * prodes.ts — Snapshot do módulo PRODES Cerrado (validação cruzada).
 */
import type { ReportSnapshot } from '../../types'
import type { ResumoProdes }   from '../../../lib/queries'
import { METODOLOGIAS } from '../../../methodology/content'
import { fmtNumero, fmtPct, citaFonte } from '../prose'

interface ProdesInput {
  ano: number | 'all'
  resumoProdes: ResumoProdes[] | undefined
}

export function buildProdesSnapshot(input: ProdesInput): ReportSnapshot {
  const { ano, resumoProdes } = input
  const ciclos = resumoProdes ?? []

  // Agregados — todos os ciclos
  const totalValidados   = ciclos.reduce((s, c) => s + (c.n_total ?? 0), 0)
  const totalConcord     = ciclos.reduce((s, c) => s + (c.n_concordantes ?? 0), 0)
  const totalDiscord     = ciclos.reduce((s, c) => s + (c.n_discordantes ?? 0), 0)
  const pctGlobal        = totalValidados > 0 ? (totalConcord / (totalConcord + totalDiscord)) * 100 : 0
  const semProdes        = ciclos.reduce((s, c) => s + (c.n_sem_prodes ?? 0), 0)
  const ultimoCiclo      = ciclos.find(c => c.ano_prodes_ref === 2025) ?? ciclos[ciclos.length - 1]
  const primeiroCiclo    = ciclos[0]

  const tendenciaPp = ultimoCiclo && primeiroCiclo && ultimoCiclo !== primeiroCiclo
    ? (ultimoCiclo.pct_concordancia ?? 0) - (primeiroCiclo.pct_concordancia ?? 0)
    : null

  const kpis: ReportSnapshot['kpis'] = [
    {
      rotulo: 'Concordância global',
      valor:  fmtPct(pctGlobal),
      contexto: `Considera ${fmtNumero(totalConcord + totalDiscord)} alertas com PRODES disponível`,
      cor: pctGlobal > 70 ? '#10B981' : pctGlobal > 50 ? '#F59E0B' : '#EF4444',
    },
    {
      rotulo: 'Alertas concordantes',
      valor:  fmtNumero(totalConcord),
      contexto: `${fmtPct(totalConcord + totalDiscord > 0 ? (totalConcord / (totalConcord + totalDiscord)) * 100 : 0)} dos validados`,
      cor: '#10B981',
    },
    {
      rotulo: 'Alertas discordantes',
      valor:  fmtNumero(totalDiscord),
      contexto: 'PRODES do ciclo não confirma o desmatamento',
      cor: '#EF4444',
    },
    {
      rotulo: 'Sem PRODES no ciclo',
      valor:  fmtNumero(semProdes),
      contexto: 'Ciclo INPE ainda não publicado (esperado em outubro)',
      cor: '#94A3B8',
    },
    {
      rotulo: 'Tendência de concordância',
      valor:  tendenciaPp != null
        ? `${tendenciaPp >= 0 ? '+' : ''}${fmtNumero(tendenciaPp, 1)} pp`
        : '—',
      contexto: tendenciaPp != null && primeiroCiclo && ultimoCiclo
        ? `Entre ciclo ${primeiroCiclo.ano_prodes_ref} (${fmtPct(primeiroCiclo.pct_concordancia ?? 0)}) e ciclo ${ultimoCiclo.ano_prodes_ref} (${fmtPct(ultimoCiclo.pct_concordancia ?? 0)})`
        : undefined,
      cor: tendenciaPp != null && tendenciaPp >= 0 ? '#10B981' : '#EF4444',
    },
  ]

  const resumoExecutivo: string[] = [
    `O módulo PRODES Cerrado realiza validação cruzada dos alertas MapBiomas com o produto oficial anual do INPE para o bioma Cerrado. Foram analisados ${fmtNumero(totalConcord + totalDiscord)} alertas com PRODES disponível, resultando em concordância de ${fmtPct(pctGlobal)}.`,
    `Dos alertas validados, ${fmtNumero(totalConcord)} (${fmtPct(totalConcord + totalDiscord > 0 ? (totalConcord / (totalConcord + totalDiscord)) * 100 : 0)}) foram classificados como CONCORDANTE — há sobreposição espacial com polígonos PRODES do mesmo ciclo. Os outros ${fmtNumero(totalDiscord)} foram classificados como DISCORDANTE.`,
    semProdes > 0
      ? `Adicionalmente, ${fmtNumero(semProdes)} alertas ainda não puderam ser validados por falta de publicação do ciclo PRODES correspondente. INPE publica anualmente, com referência cronológica de agosto a julho.`
      : 'Todos os alertas do período já possuem ciclo PRODES correspondente disponível.',
  ]

  const analise: string[] = [
    'A concordância PRODES é uma medida de robustez do MapBiomas Alerta para o bioma Cerrado. Valores superiores a 70% indicam alta confiabilidade dos alertas detectados como desmatamento.',
    tendenciaPp != null && tendenciaPp >= 0
      ? `A tendência crescente de concordância (${tendenciaPp >= 0 ? '+' : ''}${fmtNumero(tendenciaPp, 1)} pp entre o primeiro e o último ciclo) indica melhoria progressiva no alinhamento entre os dois sistemas. Esse padrão é compatível com aprimoramentos nos algoritmos de detecção do MapBiomas e ampliação da base do PRODES.`
      : tendenciaPp != null
      ? `Foi observada redução de ${fmtNumero(Math.abs(tendenciaPp), 1)} pp na concordância entre o primeiro e o último ciclo. Recomenda-se análise específica para identificar fatores como mudanças metodológicas ou variações sazonais.`
      : 'Histórico insuficiente para análise de tendência. Recomenda-se reavaliar após pelo menos três ciclos completos.',
    'A discordância não implica erro do MapBiomas — pode refletir diferença temporal (alerta posterior ao corte PRODES), diferença de classe (degradação vs. desmatamento) ou tolerância espacial. Recomenda-se interpretação institucional caso a caso.',
    'O bioma Caatinga não dispõe de produto INPE equivalente — alertas nessa região aparecem como NÃO DISPONÍVEL CAATINGA e ficam sem validação cruzada externa.',
  ]

  let tabela: ReportSnapshot['tabela']
  if (ciclos.length > 0) {
    tabela = {
      titulo: 'Concordância por ciclo PRODES',
      cabecalho: ['Ciclo', 'Validados', 'Concordantes', 'Discordantes', 'Concordância'],
      linhas: ciclos.map(c => [
        String(c.ano_prodes_ref),
        fmtNumero(c.n_total ?? 0),
        fmtNumero(c.n_concordantes ?? 0),
        fmtNumero(c.n_discordantes ?? 0),
        fmtPct(c.pct_concordancia ?? 0),
      ]),
    }
  }

  const meto = METODOLOGIAS.prodes

  return {
    modulo:      'prodes',
    nomeModulo:  'Monitoramento de Alertas PRODES',
    moduloChave: 'PRODES',
    corModulo:   '#10B981',
    ano,
    dataEmissao: new Date(),
    kpis,
    resumoExecutivo,
    analise,
    tabela,
    metodologia: {
      pergunta:     meto.pergunta.paragrafos.join(' '),
      como_calcula: meto.como_calcula.paragrafos,
      simbologia:   meto.simbologia.paragrafos,
    },
    limitacoes: meto.limitacoes.paragrafos,
    fontes: [
      citaFonte('PRODES-Cerrado · INPE / TerraBrasilis (WFS)'),
      citaFonte('MapBiomas Alerta (GraphQL API v2)'),
      citaFonte('Pipeline CGEO/SEMARH-PI · validação cruzada vetorial'),
    ],
  }
}
