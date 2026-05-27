import { create } from 'zustand'

export type Module = 'mapbiomas' | 'prodes' | 'matopiba' | 'dados'
export type AnoFiltro = number | 'all'
export type Theme = 'dark' | 'light'

function loadTheme(): Theme {
  try { return (localStorage.getItem('cgeo-theme') as Theme) ?? 'dark' } catch { return 'dark' }
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

  theme: Theme
  toggleTheme: () => void

  // Deprecated — removidos da UI, mantidos como null para compatibilidade
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

  theme: loadTheme(),
  toggleTheme: () => set(s => {
    const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('cgeo-theme', next) } catch { /* noop */ }
    return { theme: next }
  }),

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
