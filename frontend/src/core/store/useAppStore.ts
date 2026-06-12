import { create } from 'zustand'

export type Module = 'mapbiomas' | 'prodes' | 'matopiba' | 'dados' | 'areas_prioritarias' | 'queimadas_bdq'
export type AnoFiltro = number | 'all'
export type Theme = 'dark' | 'light'

function loadTheme(): Theme {
  try { return (localStorage.getItem('cgeo-theme') as Theme) ?? 'dark' } catch { return 'dark' }
}

// Sub-views por módulo
export type MapBiomasView = 'executiva' | 'temporal' | 'municipal' | 'comparativa'
export type ProdesView    = 'visao_geral' | 'temporal' | 'ranking' | 'concordancia'
export type MatopibaView  = 'territorial'
export type DadosView     = 'gestao'
export type AreasViewId      = 'visao_geral' | 'municipal' | 'prodes_prioridade' | 'ranking' | 'biomassa'
export type QueimadasViewId  = 'visao_geral' | 'classes' | 'municipal' | 'temporal' | 'metodologia'

/** Município selecionado — payload para fitBounds no MapLibre GL */
export interface MunicipioSelecionado {
  cod:  string
  nome: string
  bbox: [[number, number], [number, number]]  // [[minX,minY],[maxX,maxY]]
}

/** Período de cobertura temporal (PRODES/DETER) */
export interface PeriodCoverage {
  ano_prodes:             number
  image_date_min:         string | null
  image_date_max:         string | null
  data_referencia_prodes: string | null
  deter_gap_inicio:       string | null
  deter_gap_fim:          string | null
  fonte_complementar:     'DETER' | null
}

// Backward-compat: Tab ainda exportado para componentes que ainda o referenciam
export type Tab = MapBiomasView | ProdesView | MatopibaView | DadosView

interface AppState {
  activeModule: Module
  setActiveModule: (m: Module) => void

  activeView: string
  setActiveView: (v: string) => void

  selectedMunicipio: MunicipioSelecionado | null
  setSelectedMunicipio: (m: MunicipioSelecionado | null) => void

  activeLayerIds: string[]
  setActiveLayerIds: (ids: string[]) => void
  toggleLayer: (id: string) => void

  periodCoverage: PeriodCoverage | null
  setPeriodCoverage: (c: PeriodCoverage | null) => void

  // queimadas_bdq — filtros mensais e por classe
  selectedMes: number | null     // 1..12 | null = todos
  setSelectedMes: (mes: number | null) => void

  selectedClasse: number | null  // 1..5  | null = todas
  setSelectedClasse: (classe: number | null) => void

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

  selectedMunicipio: null,
  setSelectedMunicipio: (m) => set({ selectedMunicipio: m }),

  activeLayerIds: [],
  setActiveLayerIds: (ids) => set({ activeLayerIds: ids }),
  toggleLayer: (id) =>
    set((state) => ({
      activeLayerIds: state.activeLayerIds.includes(id)
        ? state.activeLayerIds.filter((l) => l !== id)
        : [...state.activeLayerIds, id],
    })),

  periodCoverage: null,
  setPeriodCoverage: (c) => set({ periodCoverage: c }),

  selectedMes: null,
  setSelectedMes: (mes) => set({ selectedMes: mes }),

  selectedClasse: null,
  setSelectedClasse: (classe) => set({ selectedClasse: classe }),

  anoFiltro: 'all',
  setAnoFiltro: (v) => set({ anoFiltro: v }),

  resetFiltros: () => set({ anoFiltro: 'all', selectedMes: null, selectedClasse: null }),

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
    case 'prodes':    return 'visao_geral'
    case 'matopiba':  return 'visao_geral'
    case 'dados':     return 'gestao'
    case 'areas_prioritarias': return 'visao_geral'
    case 'queimadas_bdq':      return 'visao_geral'
  }
}
