/**
 * mapbiomas.ts — Constrói o ReportSnapshot do módulo MapBiomas Alertas
 * a partir dos dados ao vivo carregados pelos hooks.
 *
 * Linguagem imparcial. Comparações sempre com referência declarada.
 */
import type { ReportSnapshot } from '../../types'
import type { ResumoAnual } from '../../../lib/queries'
import { METODOLOGIAS } from '../../../methodology/content'
import { fmtHectares, fmtPct, fmtNumero, citaFonte } from '../prose'

interface MapbiomasInput {
  ano:         number | 'all'
  resumoAnual: ResumoAnual[] | undefined
}

export function buildMapbiomasSnapshot(input: MapbiomasInput): ReportSnapshot {
  const { ano, resumoAnual } = input

  // Determina ano de referencia para os KPIs
  const anoRef: number = ano === 'all' ? 2025 : ano
  const linhaAtual = resumoAnual?.find(r => r.ano === anoRef)
  const linhaAnt   = resumoAnual?.find(r => r.ano === (anoRef - 1))

  // KPIs principais
  const ipi      = linhaAtual?.ipi               ?? 0
  const haTotal  = linhaAtual?.ha_total          ?? 0
  const haIrr    = linhaAtual?.ha_irregular      ?? 0
  const haAut    = linhaAtual?.ha_autorizado_total ?? 0
  const haReg    = linhaAtual?.ha_regularizado   ?? 0
  const nAlertas = linhaAtual?.n_alertas         ?? 0

  // Variacao IPI vs ano anterior
  const ipiAnt   = linhaAnt?.ipi
  const deltaIPI = ipiAnt != null ? (ipi - ipiAnt) : null

  const kpis: ReportSnapshot['kpis'] = [
    {
      rotulo: 'Índice de Pressão Irregular',
      valor:  fmtPct(ipi),
      contexto: deltaIPI != null
        ? `${deltaIPI >= 0 ? '+' : ''}${fmtNumero(deltaIPI, 1)} pp em relação a ${anoRef - 1}`
        : undefined,
      cor: ipi > 60 ? '#EF4444' : ipi > 30 ? '#F97316' : '#10B981',
    },
    {
      rotulo: 'Área total alertada',
      valor:  fmtHectares(haTotal),
      contexto: `${fmtNumero(nAlertas)} alertas detectados`,
    },
    {
      rotulo: 'Área irregular',
      valor:  fmtHectares(haIrr),
      contexto: haTotal > 0
        ? `${fmtPct((haIrr / haTotal) * 100)} do total alertado`
        : undefined,
      cor: '#EF4444',
    },
    {
      rotulo: 'Área autorizada (ASV)',
      valor:  fmtHectares(haAut),
      contexto: haTotal > 0
        ? `${fmtPct((haAut / haTotal) * 100)} do total alertado`
        : undefined,
      cor: '#10B981',
    },
    {
      rotulo: 'Área regularizada (DERADSA)',
      valor:  fmtHectares(haReg),
      contexto: haReg > 0 ? 'Disponível somente para 2024–2025 (Série B)' : 'Sem registros no período',
      cor: '#F97316',
    },
  ]

  // Resumo executivo — linguagem imparcial
  const resumoExecutivo: string[] = [
    `Em ${anoRef}, o módulo MapBiomas Alertas registrou ${fmtNumero(nAlertas)} alertas de desmatamento no Piauí, cobrindo uma área total de ${fmtHectares(haTotal)}.`,
    `Desses, ${fmtHectares(haIrr)} (${fmtPct(haTotal > 0 ? (haIrr / haTotal) * 100 : 0)} da área total) ficaram classificados como IRREGULAR — sem autorização (ASV) nem regularização (DERADSA) identificada no momento do alerta.`,
    `O Índice de Pressão Irregular (IPI) — proporção da área alertada que não possui instrumento legal identificado — foi de ${fmtPct(ipi)}.${deltaIPI != null
      ? ` Esse valor representa uma variação de ${deltaIPI >= 0 ? '+' : ''}${fmtNumero(deltaIPI, 1)} pp em relação ao ano de ${anoRef - 1} (${fmtPct(ipiAnt!)}).`
      : ''
    }`,
  ]

  // Análise dos resultados
  const analise: string[] = [
    'A classificação dos alertas em quatro categorias (Autorizado, Autorizado Parcialmente, Regularizado, Irregular) segue a precedência institucional ASV > DERADSA. A precedência significa que, antes de avaliar a regularização posterior, verifica-se se havia autorização prévia da supressão.',
    `Da área total alertada, ${fmtPct(haTotal > 0 ? (haAut / haTotal) * 100 : 0)} foi classificada como AUTORIZADO ou AUTORIZADO PARCIALMENTE — indicando coincidência espacial e temporal com ASVs emitidas pelo IBAMA via SINAFLOR.`,
    haReg > 0
      ? `A categoria REGULARIZADO totalizou ${fmtHectares(haReg)}, contemplando declarações DERADSA emitidas pela SEMARH-PI no período. Disponível como dado geoespacial apenas a partir de 2024.`
      : `Não foram identificadas áreas REGULARIZADO no período analisado. Antes de 2024, a categoria não é avaliável por ausência de registro geoespacial.`,
    `Os alertas IRREGULAR totalizaram ${fmtHectares(haIrr)} e representam áreas em que, no momento do alerta, nenhum instrumento legal foi identificado. Este valor é uma estimativa exploratória e demanda verificação institucional antes de qualquer ação fiscalizadora.`,
  ]

  // Tabela: distribuição por ano (se disponível)
  let tabela: ReportSnapshot['tabela']
  if (resumoAnual && resumoAnual.length > 0) {
    tabela = {
      titulo: 'Distribuição anual (2022–2025)',
      cabecalho: ['Ano', 'Alertas', 'Área total', 'Área irregular', 'Área autorizada', 'IPI'],
      linhas: resumoAnual.map(r => [
        String(r.ano),
        fmtNumero(r.n_alertas),
        fmtHectares(r.ha_total),
        fmtHectares(r.ha_irregular),
        fmtHectares(r.ha_autorizado_total),
        fmtPct(r.ipi),
      ]),
    }
  }

  const meto = METODOLOGIAS.mapbiomas

  return {
    modulo:      'mapbiomas',
    nomeModulo:  'Monitoramento de Alertas MAPBIOMAS',
    moduloChave: 'MAPBIOMAS',
    corModulo:   '#F59E0B',
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
      citaFonte('MapBiomas Alerta (GraphQL API v2)'),
      citaFonte('SINAFLOR+ / IBAMA (WFS ArcGIS)'),
      citaFonte('SEMARH-PI (DERADSAs 2024–2025)'),
      citaFonte('IBGE (malha municipal)'),
    ],
  }
}
