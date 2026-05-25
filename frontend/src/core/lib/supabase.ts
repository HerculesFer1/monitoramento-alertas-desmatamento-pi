import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured) {
  console.warn('[supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes — dados ao vivo indisponíveis.')
}

export const supabase = isSupabaseConfigured
  ? createClient(url!, key!)
  : (null as unknown as ReturnType<typeof createClient>)

// ── Tipos derivados do schema Supabase ────────────────────────────────────
export interface AgregadoRow {
  municipio: string
  ano: number
  bioma_predominante: string
  matopiba: boolean
  serie_b: boolean
  ha_irregular: number
  ha_autorizado: number
  ha_autorizado_parcialmente: number
  ha_autorizado_total: number
  ha_regularizado: number
  ha_total: number
  pct_irregular: number
  pct_autorizado_total: number
  num_alertas: number
  reincidente: boolean
  vpressao_dominante_ptbr: string | null
  defasagem_media_dias: number | null
}

export interface ResumoAnual {
  ano: number
  n_alertas: number
  ha_total: number
  ha_irregular: number
  ha_autorizado_total: number
  ha_regularizado: number
  ipi: number
}

export interface ResumoProdes {
  ano_prodes_ref: number
  /** CONCORDANTE + DISCORDANTE (excl. SEM_PRODES_NO_CICLO). Correto após Migration 004. */
  n_total: number
  n_concordantes: number
  n_discordantes: number
  /** Presente após Migration 004 — alertas sem PRODES disponível (ciclo 2026 etc.) */
  n_sem_prodes?: number
  pct_concordancia: number
  media_cobertura_pct: number
}

export interface MatopibaResumo {
  ano: number
  n_municipios: number
  n_reincidentes: number
  ha_total: number
  ha_irregular: number
  ha_autorizado_total: number
  ha_regularizado: number
  ipi: number
  delta_ipi_yoy: number | null
}

export interface ExecucaoPipeline {
  id: number
  executado_em: string
  versao: string
  status: 'ok' | 'warning' | 'error' | null
  testes_ok: number | null
  testes_total: number | null
  n_alertas: number | null
  n_municipios: number | null
  ha_irregular: number | null
  ha_total: number | null
  duracao_s: number | null
  modulos_ok: number | null
  modulos_total: number | null
  log_resumo: string | null
}

export interface MatopibaMunicipio {
  municipio: string
  ano: number
  bioma_predominante: string
  ha_irregular: number
  ha_autorizado_total: number
  ha_total: number
  pct_irregular: number
  num_alertas: number
  reincidente: boolean
  vpressao_dominante_ptbr: string | null
  rank_irr_matopiba: number
  pct_do_matopiba_irr: number | null
  delta_ipi_yoy: number | null
}
