/**
 * useReportData.ts — Coleta um snapshot dos dados do módulo ativo para o relatório.
 *
 * Cada módulo tem um builder próprio em pdf/modules/. Este hook delega.
 * Para MVP, apenas MapBiomas está implementado — outros módulos retornam null
 * e o botão mostra "Em construção".
 */
import { useResumoAnual } from '../lib/hooks'
import { useAppStore }    from '../store/useAppStore'
import { buildMapbiomasSnapshot } from './pdf/modules/mapbiomas'
import type { ReportSnapshot } from './types'

export interface UseReportDataResult {
  /** Snapshot pronto para gerar PDF — null se módulo ainda não tem template. */
  snapshot:    ReportSnapshot | null
  /** True enquanto qualquer fonte de dados ainda está carregando. */
  carregando:  boolean
  /** True se o módulo ativo já tem template implementado. */
  disponivel:  boolean
}

export function useReportData(): UseReportDataResult {
  const { activeModule, anoFiltro } = useAppStore()

  // Hooks dos dados ao vivo — só os necessarios para cada modulo
  const { data: resumoAnual, isLoading: loadAnual } = useResumoAnual()

  if (activeModule === 'mapbiomas') {
    return {
      snapshot: loadAnual
        ? null
        : buildMapbiomasSnapshot({ ano: anoFiltro, resumoAnual }),
      carregando: loadAnual,
      disponivel: true,
    }
  }

  // Outros módulos — placeholders ate Etapa 2 da implementacao
  return { snapshot: null, carregando: false, disponivel: false }
}
