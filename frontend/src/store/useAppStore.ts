import { create } from 'zustand'

export type Tab = 'executiva' | 'municipal' | 'temporal' | 'prodes' | 'matopiba' | 'dados'
export type AnoFiltro = number | 'all'

interface AppState {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void

  // Filtro de ano único — 'all' = todos os anos; number = ano específico
  anoFiltro: AnoFiltro
  setAnoFiltro: (v: AnoFiltro) => void

  biomaFiltro: string | null
  setBioma: (v: string | null) => void

  municipioFiltro: string | null
  setMunicipio: (v: string | null) => void

  vpressaoFiltro: string | null
  setVpressao: (v: string | null) => void

  matopibaFiltro: boolean | null
  setMatopiba: (v: boolean | null) => void

  resetFiltros: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'executiva',
  setActiveTab: (tab) => set({ activeTab: tab }),

  anoFiltro: 'all',
  setAnoFiltro: (v) => set({ anoFiltro: v }),

  biomaFiltro: null,
  setBioma: (v) => set({ biomaFiltro: v }),

  municipioFiltro: null,
  setMunicipio: (v) => set({ municipioFiltro: v }),

  vpressaoFiltro: null,
  setVpressao: (v) => set({ vpressaoFiltro: v }),

  matopibaFiltro: null,
  setMatopiba: (v) => set({ matopibaFiltro: v }),

  resetFiltros: () => set({
    anoFiltro: 'all',
    biomaFiltro: null,
    municipioFiltro: null,
    vpressaoFiltro: null,
    matopibaFiltro: null,
  }),
}))
