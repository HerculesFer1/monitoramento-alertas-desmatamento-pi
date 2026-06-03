/**
 * useReportData.ts — Coleta um snapshot dos dados do módulo ativo para o relatório.
 *
 * Cada módulo de análise tem um builder próprio em pdf/modules/.
 * O hook respeita as regras dos hooks (chama todos os useQuery sempre,
 * mas usa `enabled` para evitar fetches desnecessários por módulo).
 *
 * Etapa 2 (commit atual): MapBiomas + PRODES + MATOPIBA + REDD+ + Queimadas.
 * O módulo "dados" não tem relatório próprio — é operacional.
 */
import { useResumoAnual, useResumoProdes, useResumoMatopiba, useMatopibaMunicipios } from '../lib/hooks'
import { useAppStore } from '../store/useAppStore'

import { useVisaoGeral }            from '../../modules/areas_prioritarias/hooks/useAreasData'
import { useQueimadasVisaoGeral }   from '../../modules/queimadas_bdq/hooks/useQueimadasVisaoGeral'
import { useQueimadasRanking }      from '../../modules/queimadas_bdq/hooks/useQueimadasRanking'

import { buildMapbiomasSnapshot }          from './pdf/modules/mapbiomas'
import { buildProdesSnapshot }             from './pdf/modules/prodes'
import { buildMatopibaSnapshot }           from './pdf/modules/matopiba'
import { buildAreasPrioritariasSnapshot }  from './pdf/modules/areas_prioritarias'
import { buildQueimadasSnapshot }          from './pdf/modules/queimadas'

import type { ReportSnapshot } from './types'

export interface UseReportDataResult {
  snapshot:    ReportSnapshot | null
  carregando:  boolean
  disponivel:  boolean
}

export function useReportData(): UseReportDataResult {
  const { activeModule, anoFiltro } = useAppStore()
  const anoNum = anoFiltro === 'all' ? 2025 : anoFiltro

  // Hooks ao vivo — sempre chamados (regra do React). Os builders só usam
  // o que precisam. Carregamento é checado por modulo.
  const { data: resumoAnual,     isLoading: loadAnual    } = useResumoAnual()
  const { data: resumoProdes,    isLoading: loadProdes   } = useResumoProdes()
  const { data: resumoMatopiba,  isLoading: loadMatRes   } = useResumoMatopiba()
  const { data: matMunicipios,   isLoading: loadMatMun   } = useMatopibaMunicipios()
  const { data: visaoAreas,      isLoading: loadAreas    } = useVisaoGeral(anoFiltro)
  const { data: visaoQueim,      isLoading: loadQueimVG  } = useQueimadasVisaoGeral(anoNum)
  const { data: rankingQueim,    isLoading: loadQueimRk  } = useQueimadasRanking(anoNum, 20)

  switch (activeModule) {
    case 'mapbiomas':
      return {
        snapshot:   loadAnual ? null : buildMapbiomasSnapshot({ ano: anoFiltro, resumoAnual }),
        carregando: loadAnual,
        disponivel: true,
      }

    case 'prodes':
      return {
        snapshot:   loadProdes ? null : buildProdesSnapshot({ ano: anoFiltro, resumoProdes }),
        carregando: loadProdes,
        disponivel: true,
      }

    case 'matopiba': {
      const carregando = loadMatRes || loadMatMun
      return {
        snapshot:   carregando ? null : buildMatopibaSnapshot({ ano: anoFiltro, resumoMatopiba, matMunicipios }),
        carregando,
        disponivel: true,
      }
    }

    case 'areas_prioritarias':
      return {
        snapshot:   loadAreas ? null : buildAreasPrioritariasSnapshot({ ano: anoFiltro, visaoGeral: visaoAreas }),
        carregando: loadAreas,
        disponivel: true,
      }

    case 'queimadas_bdq': {
      const carregando = loadQueimVG || loadQueimRk
      return {
        snapshot:   carregando ? null : buildQueimadasSnapshot({ ano: anoFiltro, visaoGeral: visaoQueim, ranking: rankingQueim }),
        carregando,
        disponivel: true,
      }
    }

    case 'dados':
    default:
      return { snapshot: null, carregando: false, disponivel: false }
  }
}
