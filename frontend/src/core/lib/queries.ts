import { supabase, type AgregadoRow, type ResumoAnual, type ResumoProdes, type MatopibaResumo, type MatopibaMunicipio, type ExecucaoPipeline } from './supabase'
export type { AgregadoRow, ResumoAnual, ResumoProdes, MatopibaResumo, MatopibaMunicipio, ExecucaoPipeline } from './supabase'



// ── Resumo anual (KPIs + gráficos temporais) ─────────────────────────────
export async function getResumoAnual(): Promise<ResumoAnual[]> {
  const { data, error } = await supabase.rpc('get_resumo_anual')
  if (error) throw error
  return data as ResumoAnual[]
}

// ── Resumo PRODES (slide validação) ──────────────────────────────────────
export async function getResumoProdes(): Promise<ResumoProdes[]> {
  const { data, error } = await supabase.rpc('get_resumo_prodes')
  if (error) throw error
  return data as ResumoProdes[]
}

// ── Agregado municipal filtrado ───────────────────────────────────────────
export async function getAgregado(ano?: number): Promise<AgregadoRow[]> {
  let q = supabase.from('agregado_municipios').select('*').order('ha_total', { ascending: false })
  if (ano) q = q.eq('ano', ano)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AgregadoRow[]
}

// ── GeoJSON paginado para o mapa ──────────────────────────────────────────
export interface GeoJsonParams {
  ano?: number
  classificacao?: string
  municipio?: string
  bioma?: string
  matopiba?: boolean
  limit?: number
  offset?: number
}

export async function getAlertasGeoJson(params: GeoJsonParams = {}) {
  const { data, error } = await supabase.rpc('get_alertas_geojson', {
    p_ano:           params.ano           ?? null,
    p_classificacao: params.classificacao ?? null,
    p_municipio:     params.municipio     ?? null,
    p_bioma:         params.bioma         ?? null,
    p_matopiba:      params.matopiba      ?? null,
    p_limit:         params.limit         ?? 2000,
    p_offset:        params.offset        ?? 0,
  })
  if (error) throw error
  return data as GeoJSON.FeatureCollection
}

// ── MATOPIBA: KPIs por ano ────────────────────────────────────────────────
export async function getResumoMatopiba(): Promise<MatopibaResumo[]> {
  const { data, error } = await supabase.rpc('get_resumo_matopiba')
  if (error) throw error
  return data as MatopibaResumo[]
}

// ── Execuções do pipeline (auditoria) ────────────────────────────────────
export async function getExecucoes(): Promise<ExecucaoPipeline[]> {
  const { data, error } = await supabase
    .from('execucoes_pipeline')
    .select('*')
    .order('executado_em', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []) as ExecucaoPipeline[]
}

// ── MATOPIBA: ranking municipal (todos os anos ou um ano específico) ───────
export async function getMatopibaMunicipios(ano?: number): Promise<MatopibaMunicipio[]> {
  const { data, error } = await supabase.rpc('get_matopiba_municipios', {
    p_ano: ano ?? null,
  })
  if (error) throw error
  return data as MatopibaMunicipio[]
}

