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
  flagValidacao?: string   // 'CONCORDANTE' | 'DISCORDANTE' | 'SEM_PRODES_NO_CICLO' etc.
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

// ── GeoJSON bbox-aware (Migration 011 — RPC get_alertas_bbox) ───────────
// Preferir esta sobre getAlertasGeoJson: filtra por bbox no servidor e simplifica
// geometria por zoom (payload tipicamente 10-100× menor).
export interface BboxParams {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  zoom?: number
  ano?: number
  classificacao?: string
  limit?: number
}

export async function getAlertasBbox(params: BboxParams) {
  const { data, error } = await supabase.rpc('get_alertas_bbox', {
    p_xmin:          params.xmin,
    p_ymin:          params.ymin,
    p_xmax:          params.xmax,
    p_ymax:          params.ymax,
    p_zoom:          params.zoom          ?? 8,
    p_ano:           params.ano           ?? null,
    p_classificacao: params.classificacao ?? null,
    p_limit:         params.limit         ?? 5000,
  })
  if (error) throw error
  return data as GeoJSON.FeatureCollection
}

// ── Áreas prioritárias: GeoJSON bbox-aware (Migration 011) ───────────────
export interface ApBboxParams {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  zoom?: number
  ano?: number
}

/**
 * Normaliza properties.bbox de cada feature retornada por get_ap_geojson_bbox.
 *
 * PostgREST serializa colunas JSONB como string em alguns shapes (o servidor
 * faz json_build_object → JSONB; o cliente recebe string ao desserializar
 * payload misto). Sem essa normalização, callers (MunicipalView, BiomassaView)
 * faziam `JSON.parse` no hot path do click — custo desprezível mas tipo
 * mente: declarado `BBox`, chegava `string`. M4 da auditoria GIS 2026-06-02.
 *
 * Aceita: array tupla 2x2 (já pronto) | string JSON | undefined.
 */
function _normalizeFeatureBbox(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  if (!fc?.features) return fc
  for (const f of fc.features) {
    const props = f.properties as Record<string, unknown> | null
    if (!props) continue
    const raw = props.bbox
    if (typeof raw === 'string') {
      try {
        props.bbox = JSON.parse(raw)
      } catch {
        props.bbox = null
      }
    }
  }
  return fc
}

export async function getApGeojsonBbox(params: ApBboxParams) {
  const { data, error } = await supabase.rpc('get_ap_geojson_bbox', {
    p_xmin: params.xmin,
    p_ymin: params.ymin,
    p_xmax: params.xmax,
    p_ymax: params.ymax,
    p_zoom: params.zoom ?? 6,
    p_ano:  params.ano  ?? 2025,
  })
  if (error) throw error
  return _normalizeFeatureBbox(data as GeoJSON.FeatureCollection)
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

