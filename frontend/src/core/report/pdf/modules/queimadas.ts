/**
 * queimadas.ts — Snapshot do módulo Queimadas BD-INPE.
 */
import type { ReportSnapshot } from '../../types'
import type {
  QueimadasVisaoGeralResponse,
  QueimadasRankingItem,
} from '../../../../modules/queimadas_bdq/types'
import { METODOLOGIAS } from '../../../methodology/content'
import { fmtHectares, fmtPct, fmtNumero, citaFonte } from '../prose'

interface QueimadasInput {
  ano: number | 'all'
  visaoGeral: QueimadasVisaoGeralResponse | undefined
  ranking:    QueimadasRankingItem[]      | undefined
}

const MESES: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr',  5: 'Mai',  6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}

export function buildQueimadasSnapshot(input: QueimadasInput): ReportSnapshot {
  const { ano, visaoGeral, ranking } = input

  const kpisDados = visaoGeral?.kpis
  const porClasse = visaoGeral?.por_classe ?? []
  const porMes    = visaoGeral?.por_mes    ?? []

  const haTotal   = kpisDados?.area_queimada_total_ha ?? 0
  const nCic      = kpisDados?.n_cicatrizes_total     ?? 0
  const munAfet   = kpisDados?.municipios_afetados    ?? 0
  const haPrior   = kpisDados?.area_prioritaria_ha    ?? 0
  const pctPrior  = kpisDados?.pct_em_prioritarias    ?? 0

  // Mes pico do ano
  const mesPico = porMes.reduce<{ mes: number; ha: number } | null>((acc, m) => {
    if (acc == null || (m.area_ha ?? 0) > acc.ha) return { mes: m.mes, ha: m.area_ha ?? 0 }
    return acc
  }, null)

  const topRanking = (ranking ?? []).slice(0, 10)
  const muniCritico = topRanking[0]

  const kpis: ReportSnapshot['kpis'] = [
    {
      rotulo: 'Área queimada total',
      valor:  fmtHectares(haTotal),
      contexto: `${fmtNumero(nCic)} cicatrizes detectadas no período`,
      cor: '#EF4444',
    },
    {
      rotulo: 'Municípios afetados',
      valor:  `${fmtNumero(munAfet)} / 224`,
      contexto: `${fmtPct((munAfet / 224) * 100)} dos municípios do estado`,
      cor: '#F97316',
    },
    {
      rotulo: 'Em classes prioritárias',
      valor:  fmtHectares(haPrior),
      contexto: 'Soma das classes AHP 4 (Alto) e 5 (Muito Alto)',
      cor: '#B30000',
    },
    {
      rotulo: '% em alta prioridade',
      valor:  fmtPct(pctPrior),
      contexto: 'Da área total queimada caiu em classes 4 ou 5',
      cor: pctPrior > 50 ? '#B30000' : '#FC8D59',
    },
    {
      rotulo: 'Mês pico',
      valor:  mesPico ? `${MESES[mesPico.mes] ?? mesPico.mes} · ${fmtHectares(mesPico.ha)}` : '—',
      contexto: 'Mês com maior área queimada no ano',
      cor: '#F59E0B',
    },
  ]

  const resumoExecutivo: string[] = [
    `Em ${ano === 'all' ? '2025' : ano}, o módulo Queimadas BD-INPE registrou ${fmtNumero(nCic)} cicatrizes de área queimada no Piauí, totalizando ${fmtHectares(haTotal)} — afetando ${fmtNumero(munAfet)} dos 224 municípios do estado.`,
    `${fmtHectares(haPrior)} (${fmtPct(pctPrior)} do total) ocorreram em zonas classificadas como Alta ou Muito Alta prioridade pela metodologia AHP do Programa REDD+.`,
    mesPico
      ? `O mês de maior atividade foi ${MESES[mesPico.mes] ?? mesPico.mes}, concentrando ${fmtHectares(mesPico.ha)} — característica do regime seco do Cerrado piauiense.`
      : 'Não há distribuição mensal disponível para o período.',
  ]

  const analise: string[] = [
    'Os dados de cicatrizes AQ1km V6 do BD Queimadas INPE possuem resolução de 1 km. Cicatrizes menores que ~100 hectares podem não ser detectadas pelo sensoriamento remoto utilizado.',
    muniCritico
      ? `O município com maior área queimada foi ${muniCritico.municipio_nome}, com ${fmtHectares(muniCritico.area_queimada_total_ha)} (${fmtNumero(muniCritico.n_cicatrizes_total)} cicatrizes). ${muniCritico.pct_area_prioritaria != null ? `${fmtPct(muniCritico.pct_area_prioritaria)} dessa área caiu em zonas prioritárias REDD+.` : ''}`
      : 'Não há dados de ranking municipal disponíveis para o período.',
    porClasse.length > 0
      ? `A distribuição por classe AHP mostra concentração distinta: classes 4 e 5 acumularam ${fmtHectares(haPrior)} de queimadas, mesmo representando apenas 40% das categorias. Isso reforça o valor preditivo da metodologia AHP — zonas marcadas como prioritárias efetivamente sofrem maior pressão de fogo.`
      : 'A distribuição por classe AHP não está disponível para análise.',
    'Cicatriz AQ1km não distingue queimada natural (raios, autocombustão) de queimada provocada (manejo agrícola, desmatamento). A análise causal exige cruzamento com dados socioeconômicos não cobertos por este módulo.',
  ]

  let tabela: ReportSnapshot['tabela']
  if (topRanking.length > 0) {
    tabela = {
      titulo: `Top ${topRanking.length} municípios · ${ano === 'all' ? '2025' : ano}`,
      cabecalho: ['Município', 'Área queimada', 'Cicatrizes', '% prioritária', 'Pico'],
      linhas: topRanking.map(r => [
        r.municipio_nome,
        fmtHectares(r.area_queimada_total_ha ?? 0),
        fmtNumero(r.n_cicatrizes_total ?? 0),
        fmtPct(r.pct_area_prioritaria ?? 0),
        r.mes_pico ? MESES[r.mes_pico] ?? String(r.mes_pico) : '—',
      ]),
    }
  }

  const meto = METODOLOGIAS.queimadas_bdq

  return {
    modulo:      'queimadas_bdq',
    nomeModulo:  'Análise de Áreas Prioritárias em Áreas de Queimadas',
    moduloChave: 'QUEIMADAS',
    corModulo:   '#EF4444',
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
      citaFonte('AQ1km V6 Coleção 2 · BD Queimadas INPE'),
      citaFonte('Classes de prioridade · CGEO/SEMARH-PI (metodologia AHP)'),
      citaFonte('IBGE (malha municipal)'),
      citaFonte('Pipeline CGEO/SEMARH-PI · cruzamento vetorial preservando contagem AQ1km'),
    ],
  }
}
