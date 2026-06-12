/**
 * matopiba.ts — Snapshot do módulo MATOPIBA (panorama territorial).
 */
import type { ReportSnapshot } from '../../types'
import type { MatopibaResumo, MatopibaMunicipio } from '../../../lib/queries'
import { METODOLOGIAS } from '../../../methodology/content'
import { fmtHectares, fmtPct, fmtNumero, citaFonte } from '../prose'
import { MATOPIBA_N_MUNICIPIOS, PI_N_MUNICIPIOS_TOTAL } from '../../../lib/constants'

interface MatopibaInput {
  ano: number | 'all'
  resumoMatopiba:  MatopibaResumo[]     | undefined
  matMunicipios:   MatopibaMunicipio[]  | undefined
}

export function buildMatopibaSnapshot(input: MatopibaInput): ReportSnapshot {
  const { ano, resumoMatopiba, matMunicipios } = input

  const anoRef: number = ano === 'all' ? 2025 : ano
  const linhaAtual = resumoMatopiba?.find(r => r.ano === anoRef)
  const linhaAnt   = resumoMatopiba?.find(r => r.ano === (anoRef - 1))

  const ipi      = linhaAtual?.ipi          ?? 0
  const haTotal  = linhaAtual?.ha_total     ?? 0
  const haIrr    = linhaAtual?.ha_irregular ?? 0
  const haAut    = linhaAtual?.ha_autorizado_total ?? 0
  const nMun     = linhaAtual?.n_municipios        ?? 0
  const nReinc   = linhaAtual?.n_reincidentes      ?? 0
  const deltaYoY = linhaAtual?.delta_ipi_yoy ?? (linhaAnt ? (ipi - linhaAnt.ipi) : null)

  const kpis: ReportSnapshot['kpis'] = [
    {
      rotulo: 'IPI no MATOPIBA-PI',
      valor:  fmtPct(ipi),
      contexto: deltaYoY != null
        ? `${deltaYoY >= 0 ? '+' : ''}${fmtNumero(deltaYoY, 1)} pp em relação a ${anoRef - 1}`
        : undefined,
      cor: ipi > 60 ? '#EF4444' : ipi > 30 ? '#F97316' : '#10B981',
    },
    {
      rotulo: 'Área total alertada',
      valor:  fmtHectares(haTotal),
      contexto: `Soma dos ${fmtNumero(nMun)} municípios MATOPIBA-PI com alerta no período`,
    },
    {
      rotulo: 'Área irregular',
      valor:  fmtHectares(haIrr),
      contexto: haTotal > 0 ? `${fmtPct((haIrr / haTotal) * 100)} do total alertado na região` : undefined,
      cor: '#EF4444',
    },
    {
      rotulo: 'Área autorizada (ASV)',
      valor:  fmtHectares(haAut),
      contexto: haTotal > 0 ? `${fmtPct((haAut / haTotal) * 100)} com ASV identificada` : undefined,
      cor: '#10B981',
    },
    {
      rotulo: 'Municípios reincidentes',
      valor:  fmtNumero(nReinc),
      contexto: nMun > 0 ? `${fmtPct((nReinc / MATOPIBA_N_MUNICIPIOS) * 100)} dos ${MATOPIBA_N_MUNICIPIOS} municípios MATOPIBA-PI` : undefined,
      cor: '#F59E0B',
    },
  ]

  // Top municipios do ano de referencia (max 10)
  const topMun = (matMunicipios ?? [])
    .filter(m => m.ano === anoRef)
    .sort((a, b) => (b.ha_irregular ?? 0) - (a.ha_irregular ?? 0))
    .slice(0, 10)

  const muniCritico = topMun[0]

  const resumoExecutivo: string[] = [
    `Este relatório consolida o Panorama MATOPIBA-PI: um recorte transversal dos quatro módulos do dashboard (Alertas MapBiomas, PRODES Cerrado, Queimadas BD-INPE e Áreas Prioritárias REDD+) limitado aos ${MATOPIBA_N_MUNICIPIOS} municípios piauienses definidos pela Portaria MAPA nº 244/2015, anexa ao Decreto Federal nº 8.447/2015.`,
    `Em ${anoRef}, esses ${MATOPIBA_N_MUNICIPIOS} municípios registraram área total alertada (MapBiomas) de ${fmtHectares(haTotal)}. Dessa área, ${fmtHectares(haIrr)} (${fmtPct(haTotal > 0 ? (haIrr / haTotal) * 100 : 0)}) foi classificada como IRREGULAR — o Índice de Pressão Irregular (IPI) da região atingiu ${fmtPct(ipi)}${deltaYoY != null
      ? `, variando ${deltaYoY >= 0 ? '+' : ''}${fmtNumero(deltaYoY, 1)} pp em relação a ${anoRef - 1}.`
      : '.'
    }`,
    `Foram identificados ${fmtNumero(nReinc)} municípios em estado de reincidência (IRREGULAR detectado em 3 ou mais anos consecutivos). As métricas de PRODES, Queimadas e Áreas Prioritárias para o mesmo recorte estão disponíveis nas abas correspondentes do dashboard (Panorama MATOPIBA › Visão Geral) e nas RPCs _matopiba do Supabase (migration 015).`,
  ]

  const analise: string[] = [
    `A região MATOPIBA-PI, instituída pelo Decreto Federal nº 8.447/2015 e delimitada pela Portaria MAPA nº 244/2015, concentra ${MATOPIBA_N_MUNICIPIOS} dos ${PI_N_MUNICIPIOS_TOTAL} municípios do Piauí. É uma fronteira agrícola estratégica para o país, com pressão antrópica consolidada sobre Cerrado, o que justifica seu tratamento como camada de análise (não filtro opcional) em todos os módulos do dashboard.`,
    muniCritico
      ? `O município com maior área IRREGULAR no período (recorte MapBiomas) foi ${muniCritico.municipio}, com ${fmtHectares(muniCritico.ha_irregular)} (${fmtPct(muniCritico.pct_irregular ?? 0)} do total alertado nesse município). Este valor representa uma referência operacional para priorização de fiscalização — não atestado de responsabilização institucional.`
      : 'Não há dados de municípios disponíveis para o período selecionado.',
    nReinc > 0
      ? `A presença de ${fmtNumero(nReinc)} municípios reincidentes (alerta IRREGULAR em pelo menos 3 anos consecutivos) sugere padrão estrutural de pressão — diferente de eventos pontuais. Recomenda-se cruzar este resultado com (i) o ranking PRODES Cerrado, (ii) a sazonalidade de queimadas e (iii) a classe de prioridade REDD+ desses mesmos municípios, todos disponíveis nas demais abas do panorama.`
      : 'Não há municípios em reincidência no período monitorado.',
    'A comparação com outros estados da região MATOPIBA (Maranhão, Tocantins, Bahia) não está implementada — o escopo institucional atual cobre apenas o Piauí. As tabelas detalhadas de PRODES, Queimadas e Áreas Prioritárias no recorte MATOPIBA não são reproduzidas neste PDF, sendo acessíveis exclusivamente pelas abas correspondentes no dashboard.',
  ]

  let tabela: ReportSnapshot['tabela']
  if (topMun.length > 0) {
    tabela = {
      titulo: `Top ${topMun.length} municípios MATOPIBA-PI · ${anoRef}`,
      cabecalho: ['Município', 'Área irregular', 'Área total', 'IPI', 'Alertas'],
      linhas: topMun.map(m => [
        m.municipio,
        fmtHectares(m.ha_irregular ?? 0),
        fmtHectares(m.ha_total ?? 0),
        fmtPct(m.pct_irregular ?? 0),
        fmtNumero(m.num_alertas ?? 0),
      ]),
    }
  }

  const meto = METODOLOGIAS.matopiba

  return {
    modulo:      'matopiba',
    nomeModulo:  'Panorama MATOPIBA — recorte transversal',
    moduloChave: 'MATOPIBA',
    corModulo:   '#D97706',
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
      citaFonte('PRODES Cerrado / INPE (TerraBrasilis WFS)'),
      citaFonte('Banco de Dados de Queimadas / INPE (AQ1km V6 Coleção 2)'),
      citaFonte('Áreas Prioritárias REDD+ (5 classes AHP × PRODES × biomassa)'),
      citaFonte('SINAFLOR+ / IBAMA (WFS ArcGIS)'),
      citaFonte('SEMARH-PI (DERADSAs 2024–2025)'),
      citaFonte('Decreto Federal nº 8.447/2015 (delimitação MATOPIBA)'),
      citaFonte('IBGE (malha municipal)'),
    ],
  }
}
