import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured } from './supabase'
import {
  getResumoAnual, getAgregado,
  getAlertasGeoJson, getResumoProdes,
  getResumoMatopiba, getMatopibaMunicipios,
  getExecucoes,
  type GeoJsonParams,
} from './queries'

function guardedFn<T>(fn: () => Promise<T>): () => Promise<T> {
  return () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
    }
    return fn()
  }
}

export function useResumoAnual() {
  return useQuery({
    queryKey: ['resumo-anual'],
    queryFn: guardedFn(getResumoAnual),
    retry: 0,
  })
}

export function useAgregado(ano?: number) {
  return useQuery({
    queryKey: ['agregado', ano ?? 'all'],
    queryFn: guardedFn(() => getAgregado(ano)),
    retry: 0,
  })
}

export function useAlertasGeoJson(params: GeoJsonParams) {
  return useQuery({
    queryKey: ['alertas-geojson', params],
    queryFn: guardedFn(() => getAlertasGeoJson(params)),
    retry: 0,
  })
}

export function useResumoProdes() {
  return useQuery({
    queryKey: ['resumo-prodes'],
    queryFn: guardedFn(getResumoProdes),
    staleTime: 60 * 60 * 1000,
    retry: 0,
  })
}

export function useResumoMatopiba() {
  return useQuery({
    queryKey: ['resumo-matopiba'],
    queryFn: guardedFn(getResumoMatopiba),
    retry: 0,
  })
}

export function useMatopibaMunicipios(ano?: number) {
  return useQuery({
    queryKey: ['matopiba-municipios', ano ?? 'all'],
    queryFn: guardedFn(() => getMatopibaMunicipios(ano)),
    retry: 0,
  })
}

export function useExecucoes() {
  return useQuery({
    queryKey: ['execucoes-pipeline'],
    queryFn: guardedFn(getExecucoes),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })
}

// ── Dados mensais gerados pelo pipeline (arquivo estático) ─────────────────
export function useMonthlyAlertas() {
  return useQuery({
    queryKey: ['monthly-alertas'],
    queryFn: () =>
      fetch('/data/monthly_alertas.json').then(r => {
        if (!r.ok) throw new Error('monthly_alertas.json não encontrado — execute o pipeline')
        return r.json() as Promise<Record<string, number[]>>
      }),
    staleTime: Infinity,
    retry: false,
  })
}

// ── Resumo estático gerado pelo pipeline (substitui dados hardcoded) ────────
export interface ResumoEstatico {
  alertYr:    Record<number, { count: number; area: number; cerrado: number; caatinga: number }>
  classifYr:  Record<number, { irregular: number; autorizado: number; autorizado_p: number; regularizado: number }>
  ipiYr:      Record<number, number>
  matopibaYr: Record<number, { mat: number; rest: number }>
  top20:      [string, number][]
  munIrrReal: Record<string, number>
  munBiome:   Record<string, string>
  prodesSummary: {
    ciclos:            Record<number, { n: number; concordantes: number; discordantes: number; pct: number }>
    totalValidados:    number
    totalConcordantes: number
    totalDiscordantes: number
    semProdes:         number
  } | null
  prodesExtra: {
    irrAnual: { anos: number[]; confirmado: number[]; discordante: number[]; caatinga: number[]; semProdes: number[] }
    distCob:  { labels: string[]; n: number[]; ha: number[] }
    mediaCob: Record<number, number>
    topMun:   { mun: string; conc: number; total: number; pct: number }[]
    porVetor: { vp: string; n: number; conc: number; pct: number }[]
    haIrrConfirmado:          number
    /** % do total irregular PI (Cerrado + Caatinga) — denominador conservador */
    pctIrrConfirmado:         number
    /** % do Cerrado irregular com PRODES disponível (excl. Caatinga e SEM_PRODES) */
    pctIrrCerradoDisponivel?: number
  } | null
}

export function useResumoEstatico() {
  return useQuery({
    queryKey: ['resumo-estatico'],
    queryFn: () =>
      fetch('/data/resumo_estatico.json').then(r => {
        if (!r.ok) throw new Error('resumo_estatico.json não encontrado — execute o pipeline')
        return r.json().then((d: Record<string, unknown>) => {
          const toNumKeys = (o: Record<string, unknown>) =>
            Object.fromEntries(Object.entries(o).map(([k, v]) => [+k, v]))
          const ps = d.prodesSummary as Record<string, unknown> | null | undefined
        const pe = d.prodesExtra  as Record<string, unknown> | null | undefined
        return {
            alertYr:       toNumKeys(d.alertYr    as Record<string, unknown>),
            classifYr:     toNumKeys(d.classifYr  as Record<string, unknown>),
            ipiYr:         toNumKeys(d.ipiYr      as Record<string, unknown>),
            matopibaYr:    toNumKeys(d.matopibaYr as Record<string, unknown>),
            top20:         d.top20,
            munIrrReal:    d.munIrrReal,
            munBiome:      d.munBiome,
            prodesSummary: ps
              ? { ...ps, ciclos: toNumKeys(ps.ciclos as Record<string, unknown>) }
              : null,
            prodesExtra: pe
              ? { ...pe, mediaCob: toNumKeys(pe.mediaCob as Record<string, unknown>) }
              : null,
          } as ResumoEstatico
        })
      }),
    staleTime: Infinity,
    retry: false,
  })
}
