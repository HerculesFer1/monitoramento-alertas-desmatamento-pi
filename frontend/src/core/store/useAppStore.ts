import { create } from 'zustand'

export type Module = 'mapbiomas' | 'prodes' | 'matopiba' | 'dados' | 'areas_prioritarias'
export type AnoFiltro = number | 'all'

export type AreasViewId =
  | 'visao_geral'
  | 'municipal'
  | 'prodes_prioridade'
  | 'ranking'
  | 'metodologia'

export interface MunicipioSelecionado {
  cod:  string
  nome: string
  bbox: [[number, number], [number, number]]
}

// Sub-views por módulo
export type MapBiomasView = 'executiva' | 'temporal' | 'municipal' | 'comparativa'
export type ProdesView    = 'concordancia'
export type MatopibaView  = 'territorial'
export type DadosView     = 'gestao'

// Backward-compat: Tab ainda exportado para componentes que ainda o referenciam
export type Tab = MapBiomasView | ProdesView | MatopibaView | DadosView

interface AppState {
  activeModule: Module
  setActiveModule: (m: Module) => void

  activeView: string
  setActiveView: (v: string) => void

  anoFiltro: AnoFiltro
  setAnoFiltro: (v: AnoFiltro) => void

  resetFiltros: () => void

  selectedMunicipio:    MunicipioSelecionado | null
  activeLayerIds:       string[]
  setSelectedMunicipio: (m: MunicipioSelecionado | null) => void
  setActiveLayerIds:    (ids: string[]) => void
  toggleLayer:          (id: string) => void

  // Deprecated — removidos da UI, mantidos como null para compatibilidade
  // durante migração gradual das views
  biomaFiltro:     null
  municipioFiltro: null
  vpressaoFiltro:  null
  matopibaFiltro:  null
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'mapbiomas',
  setActiveModule: (m) => set({ activeModule: m, activeView: defaultView(m) }),

  activeView: 'executiva',
  setActiveView: (v) => set({ activeView: v }),

  anoFiltro: 'all',
  setAnoFiltro: (v) => set({ anoFiltro: v }),

  resetFiltros: () => set({ anoFiltro: 'all' }),

  selectedMunicipio:    null,
  activeLayerIds:       [],
  setSelectedMunicipio: (m) => set({ selectedMunicipio: m }),
  setActiveLayerIds:    (ids) => set({ activeLayerIds: ids }),
  toggleLayer:          (id) => set((s) => ({
    activeLayerIds: s.activeLayerIds.includes(id)
      ? s.activeLayerIds.filter((l) => l !== id)
      : [...s.activeLayerIds, id],
  })),

  // Filtros removidos — sempre null
  biomaFiltro:     null,
  municipioFiltro: null,
  vpressaoFiltro:  null,
  matopibaFiltro:  null,
}))

function defaultView(m: Module): string {
  switch (m) {
    case 'mapbiomas':          return 'executiva'
    case 'prodes':             return 'concordancia'
    case 'matopiba':           return 'territorial'
    case 'dados':              return 'gestao'
    case 'areas_prioritarias': return 'visao_geral'
  }
}
