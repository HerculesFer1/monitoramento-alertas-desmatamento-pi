import { create } from 'zustand'

export type Module = 'mapbiomas' | 'prodes' | 'matopiba' | 'dados'
export type AnoFiltro = number | 'all'

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

  // resetFiltros mantido para compatibilidade
  resetFiltros: () => void

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

  // Filtros removidos — sempre null
  biomaFiltro:     null,
  municipioFiltro: null,
  vpressaoFiltro:  null,
  matopibaFiltro:  null,
}))

function defaultView(m: Module): string {
  switch (m) {
    case 'mapbiomas': return 'executiva'
    case 'prodes':    return 'concordancia'
    case 'matopiba':  return 'territorial'
    case 'dados':     return 'gestao'
  }
}
