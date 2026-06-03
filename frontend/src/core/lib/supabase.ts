import { createClient } from '@supabase/supabase-js'

// ── Fallback institucional do projeto Supabase CGEO/SEMARH-PI ─────────────
//
// Estes valores sao PUBLICOS por design:
//   - URL e identificador do projeto (esta em qualquer requisicao do browser)
//   - anon key e desenhada para ir ao bundle (RLS no Postgres protege os
//     dados, nao o segredo da chave)
//
// Por que hardcoded como fallback:
//   1. import.meta.env.VITE_* e substituido em build-time pelo Vite.
//   2. Se o ambiente de build (GitHub Actions / Vercel) tiver o secret
//      vazio, errado ou apontando para outro projeto, todo o dashboard
//      cai (foi exatamente o que aconteceu em 2026-06-03 quando o
//      Vercel build pegou o secret antigo apontando para ubcejvbnpuyouwpphryc).
//   3. Com este fallback, o frontend SEMPRE aponta para o projeto correto
//      enquanto os secrets servem apenas para staging/preview eventual.
//   4. Migracao futura: trocar estas 2 constantes e fazer redeploy.
//
// Anon key abaixo expira em 2036-04-26 (exp: 2093076476).
const FALLBACK_SUPABASE_URL  = 'https://ssqriwgrxievcmxauegv.supabase.co'
const FALLBACK_SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcXJpd2dyeGlldmNteGF1ZWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDA0NzYsImV4cCI6MjA5MzA3NjQ3Nn0' +
  '.AqVdc_n9R_OfWNkl8fKMdA4IhUlaDhoz3YaElCuugaM'

const envUrl = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Aceita o secret apenas se ele apontar para o projeto correto.
// Qualquer outra coisa cai no fallback — protege contra secrets antigos.
const url = (envUrl && envUrl.includes('ssqriwgrxievcmxauegv')) ? envUrl : FALLBACK_SUPABASE_URL
const key = envKey || FALLBACK_SUPABASE_ANON

export const isSupabaseConfigured = Boolean(url && key)

if (envUrl && !envUrl.includes('ssqriwgrxievcmxauegv')) {
  console.warn(
    `[supabase] VITE_SUPABASE_URL aponta para projeto incorreto (${envUrl}). ` +
    `Usando fallback ${FALLBACK_SUPABASE_URL}.`,
  )
}

export const supabase = createClient(url, key)

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
