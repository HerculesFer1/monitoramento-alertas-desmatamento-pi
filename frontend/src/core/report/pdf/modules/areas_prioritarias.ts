/**
 * areas_prioritarias.ts — Snapshot do módulo Áreas Prioritárias REDD+ (AHP).
 */
import type { ReportSnapshot } from '../../types'
import type { VisaoGeralResponse } from '../../../../modules/areas_prioritarias/types'
import { METODOLOGIAS } from '../../../methodology/content'
import { fmtHectares, fmtPct, fmtNumero, citaFonte } from '../prose'

interface AreasInput {
  ano: number | 'all'
  visaoGeral: VisaoGeralResponse | undefined
}

const LABEL_CLASSE: Record<number, string> = {
  1: 'Muito Baixo', 2: 'Baixo', 3: 'Médio', 4: 'Alto', 5: 'Muito Alto',
}

export function buildAreasPrioritariasSnapshot(input: AreasInput): ReportSnapshot {
  const { ano, visaoGeral } = input

  const kpisProdes = visaoGeral?.kpis?.prodes
  const porClasse  = visaoGeral?.por_classe ?? []

  const haFloresta = kpisProdes?.area_floresta_total_ha ?? 0
  const haDesmat   = kpisProdes?.area_desmat_total_ha   ?? 0
  const pctDesmat  = kpisProdes?.pct_desmat_estado      ?? 0
  const totalMun   = kpisProdes?.total_municipios       ?? 0
  const nMunCl5    = kpisProdes?.n_municipios_classe_max ?? 0
  const biomassa   = kpisProdes?.biomassa_total_tc ?? 0

  // Distribuição da pressão de desmatamento por classe
  const cl5 = porClasse.find(c => c.classe_prioridade === 5)
  const cl1 = porClasse.find(c => c.classe_prioridade === 1)
  const razaoCl5_vs_Cl1 = cl1 && cl1.area_desmat_ha > 0 && cl5 ? cl5.area_desmat_ha / cl1.area_desmat_ha : null

  const kpis: ReportSnapshot['kpis'] = [
    {
      rotulo: 'Floresta remanescente',
      valor:  fmtHectares(haFloresta),
      contexto: `Soma das áreas prioritárias com cobertura florestal em ${totalMun} municípios`,
      cor: '#10B981',
    },
    {
      rotulo: 'Desmatamento PRODES',
      valor:  fmtHectares(haDesmat),
      contexto: `Acumulado no período PRODES ${ano === 'all' ? '2025' : ano}`,
      cor: '#EF4444',
    },
    {
      rotulo: '% desmatamento',
      valor:  fmtPct(pctDesmat, 2),
      contexto: 'Sobre área florestal total das classes prioritárias',
      cor: '#F59E0B',
    },
    {
      rotulo: 'Municípios em classe 5',
      valor:  fmtNumero(nMunCl5),
      contexto: 'Com floresta na classe de máxima prioridade (Muito Alto AHP)',
      cor: '#F97316',
    },
    {
      rotulo: 'Biomassa total',
      valor:  `${fmtNumero(biomassa, 0)} tC`,
      contexto: 'Estoque de carbono florestal estimado (AGB × área de floresta)',
      cor: '#6366F1',
    },
  ]

  const resumoExecutivo: string[] = [
    `Em ${ano === 'all' ? '2025' : ano}, o módulo REDD+ identificou ${fmtHectares(haFloresta)} de floresta remanescente dentro das áreas prioritárias do Programa Jurisdicional do Piauí — distribuídas entre ${totalMun} municípios.`,
    `O desmatamento PRODES acumulado no período totalizou ${fmtHectares(haDesmat)}, equivalente a ${fmtPct(pctDesmat, 2)} da floresta total. O estoque estimado de biomassa nessas áreas é de ${fmtNumero(biomassa, 0)} toneladas de carbono.`,
    `${fmtNumero(nMunCl5)} municípios apresentam pelo menos uma porção de floresta na classe 5 (Muito Alto) — categoria de máxima urgência de proteção segundo a metodologia AHP CGEO.`,
  ]

  const analise: string[] = [
    'A metodologia AHP utilizada particiona o território em 5 classes de prioridade combinando Índice de Pressão (83% do peso) e Valor de Biomassa (17%). As classes refletem urgência de proteção, não distribuição uniforme de risco.',
    razaoCl5_vs_Cl1 != null
      ? `A pressão de desmatamento na classe 5 (Muito Alto) é ${fmtNumero(razaoCl5_vs_Cl1, 0)}× a observada na classe 1 (Muito Baixo). Esse contraste valida a metodologia AHP — zonas marcadas como prioritárias efetivamente concentram a pressão antrópica.`
      : 'A distribuição de pressão entre as classes não pôde ser comparada por insuficiência de dados em uma das classes extremas.',
    cl5
      ? `A classe 5 (Muito Alto) representa ${fmtHectares(cl5.area_floresta_ha)} de floresta e acumulou ${fmtHectares(cl5.area_desmat_ha)} de desmatamento no período — ${fmtPct(cl5.area_floresta_ha > 0 ? (cl5.area_desmat_ha / cl5.area_floresta_ha) * 100 : 0, 2)} da floresta dessa classe foi perdida.`
      : 'Não há dados detalhados disponíveis para a classe 5.',
    'A camada DETER complementa o PRODES no período pós-publicação oficial (gap temporal de agosto a julho seguinte). Alertas DETER são provisórios e devem ser interpretados como sinal antecipado, não como dado consolidado.',
  ]

  let tabela: ReportSnapshot['tabela']
  if (porClasse.length > 0) {
    tabela = {
      titulo: `Distribuição por classe de prioridade · ${ano === 'all' ? '2025' : ano}`,
      cabecalho: ['Classe', 'Categoria AHP', 'Floresta', 'Desmatamento', 'Municípios'],
      linhas: porClasse.map(c => [
        String(c.classe_prioridade),
        c.prioridade_label ?? LABEL_CLASSE[c.classe_prioridade] ?? '—',
        fmtHectares(c.area_floresta_ha ?? 0),
        fmtHectares(c.area_desmat_ha ?? 0),
        fmtNumero(c.n_municipios ?? 0),
      ]),
    }
  }

  const meto = METODOLOGIAS.areas_prioritarias

  return {
    modulo:      'areas_prioritarias',
    nomeModulo:  'Análise de Áreas Prioritárias REDD+',
    moduloChave: 'REDD+',
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
      citaFonte('Classes de prioridade · CGEO/SEMARH-PI (metodologia AHP)'),
      citaFonte('PRODES-Cerrado · INPE / TerraBrasilis'),
      citaFonte('DETER-Cerrado · INPE (alertas provisórios)'),
      citaFonte('Máscara florestal FREL Piauí 2025'),
      citaFonte('Rasters de biomassa AGB (Sato, Tejada & Noronha, 2026)'),
      citaFonte('IBGE (malha municipal)'),
    ],
  }
}
