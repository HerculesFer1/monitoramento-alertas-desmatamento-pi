/**
 * DataStatusBadge — Indicador de atualização dos dados no topbar.
 *
 * Lê a última execução de `execucoes_pipeline` e exibe:
 *   - data/hora da última atualização
 *   - semáforo de frescor: verde (< 35 dias), amarelo (35–50 dias), vermelho (> 50 dias)
 *   - status da execução: ok / warning / error
 *
 * Tooltip expande com: n_alertas, n_municipios, testes, duração.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured, type ExecucaoPipeline } from '../../core/lib/supabase'

async function getUltimaExecucao(): Promise<ExecucaoPipeline | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from('execucoes_pipeline')
    .select('*')
    .order('executado_em', { ascending: false })
    .limit(1)
    .single()
  if (error) return null
  return data as ExecucaoPipeline
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function formatarData(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza',
  })
}

type Frescor = 'atualizado' | 'atencao' | 'desatualizado' | 'desconhecido'

function calcFrescor(dias: number, status: string | null): Frescor {
  if (status === 'error') return 'desatualizado'
  if (dias > 50)  return 'desatualizado'
  if (dias > 35)  return 'atencao'
  return 'atualizado'
}

const COR: Record<Frescor, { dot: string; text: string; bg: string; border: string }> = {
  atualizado:    { dot: '#10b981', text: '#10b981', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.2)' },
  atencao:       { dot: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.2)' },
  desatualizado: { dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.2)'  },
  desconhecido:  { dot: '#6b7280', text: '#6b7280', bg: 'rgba(107,114,128,.08)', border: 'rgba(107,114,128,.2)' },
}

const ICONE_STATUS: Record<string, string> = {
  ok:      '✅',
  warning: '⚠️',
  error:   '🚨',
}

export function DataStatusBadge() {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const { data: exec, isLoading } = useQuery({
    queryKey:  ['ultima-execucao'],
    queryFn:   getUltimaExecucao,
    staleTime: 5 * 60 * 1000,   // revalida a cada 5 min
    retry:     false,
  })

  if (isLoading) {
    return (
      <div style={{ fontSize: 10, color: 'var(--t3)', opacity: 0.6 }}>
        carregando…
      </div>
    )
  }

  if (!exec) {
    return (
      <div style={{ fontSize: 10, color: 'var(--t3)' }}>
        Pipeline v2
      </div>
    )
  }

  const dias    = diasDesde(exec.executado_em)
  const frescor = calcFrescor(dias, exec.status ?? 'ok')
  const cor     = COR[frescor]
  const label   = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `${dias}d atrás`
  const icone   = ICONE_STATUS[exec.status ?? 'ok'] ?? '✅'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Badge principal */}
      <button
        onClick={() => setTooltipOpen(v => !v)}
        onBlur={() => setTimeout(() => setTooltipOpen(false), 150)}
        title="Ver detalhes da última atualização"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: cor.bg, border: `1px solid ${cor.border}`,
          borderRadius: 999, padding: '3px 9px',
          fontSize: 10, fontWeight: 600, color: cor.text,
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: cor.dot, display: 'inline-block',
          // pulso animado se desatualizado
          animation: frescor === 'desatualizado' ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }} />
        {icone} Dados: {label}
      </button>

      {/* Tooltip expandido */}
      {tooltipOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          background: 'var(--bg2)', border: '1px solid var(--sep)',
          borderRadius: 10, padding: '12px 14px', minWidth: 260,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 200,
          fontSize: 11, color: 'var(--t2)', lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--t1)', marginBottom: 8, fontSize: 12 }}>
            {icone} Última atualização
          </div>

          <Row label="Data" value={formatarData(exec.executado_em) + ' (BRT)'} />
          {exec.n_alertas    != null && <Row label="Fragmentos" value={exec.n_alertas.toLocaleString('pt-BR')} />}
          {exec.n_municipios != null && <Row label="Municípios" value={String(exec.n_municipios)} />}
          {exec.testes_ok    != null && (
            <Row
              label="Testes"
              value={`${exec.testes_ok}/${exec.testes_total ?? 9}`}
              ok={exec.testes_ok === (exec.testes_total ?? 9)}
            />
          )}
          {exec.duracao_s    != null && <Row label="Duração" value={formatDuracao(exec.duracao_s)} />}
          {exec.log_resumo   != null && (
            <div style={{
              marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--sep)',
              color: 'var(--t3)', fontSize: 10,
            }}>
              {exec.log_resumo}
            </div>
          )}

          {frescor !== 'atualizado' && (
            <div style={{
              marginTop: 8, padding: '6px 8px',
              background: frescor === 'desatualizado' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
              border: `1px solid ${frescor === 'desatualizado' ? 'rgba(239,68,68,.2)' : 'rgba(245,158,11,.2)'}`,
              borderRadius: 6, fontSize: 10,
              color: frescor === 'desatualizado' ? '#ef4444' : '#f59e0b',
            }}>
              {frescor === 'desatualizado'
                ? `⚠ Dados com ${dias} dias — atualização necessária`
                : `⚠ Dados com ${dias} dias — próxima atualização prevista`}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: ok === false ? '#ef4444' : 'var(--t1)' }}>
        {value}
      </span>
    </div>
  )
}

function formatDuracao(s: number): string {
  if (s < 60)  return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
