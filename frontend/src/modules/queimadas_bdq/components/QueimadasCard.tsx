/**
 * QueimadasCard.tsx
 * Painel lateral com stats do município selecionado.
 */
import { MESES_LABELS, CLASSE_COLORS } from '../types'
import type { QueimadasMunicipio } from '../types'
import { PrioridadeBadge } from './PrioridadeBadge'

interface Props {
  municipio: QueimadasMunicipio
  onClose?:  () => void
}

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function QueimadasCard({ municipio, onClose }: Props) {
  const {
    municipio_nome,
    area_queimada_total_ha,
    n_cicatrizes_total,
    mes_pico,
    classe_max_queimada,
    pct_area_prioritaria,
    pct_queimada_estado,
    area_ha_por_classe,
  } = municipio

  return (
    <div style={{
      background:    'var(--bg2)',
      border:        '1px solid rgba(255,255,255,.08)',
      borderRadius:  10,
      padding:       '14px 16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           12,
      minWidth:      220,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3 }}>
            {municipio_nome}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>Piauí — 2025</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >✕</button>
        )}
      </div>

      {/* KPIs principais */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KpiBox label="Área queimada" value={`${fmt(area_queimada_total_ha)} ha`} accent="#FC8D59" />
        <KpiBox label="Cicatrizes"    value={fmt(n_cicatrizes_total)}              accent="#FDBB84" />
        <KpiBox
          label="Mês pico"
          value={mes_pico ? (MESES_LABELS[mes_pico] ?? `Mês ${mes_pico}`) : '—'}
          accent="#F5F5F5"
        />
        <KpiBox
          label="% em prio. alta"
          value={pct_area_prioritaria != null ? `${fmt(pct_area_prioritaria, 1)}%` : '—'}
          accent={pct_area_prioritaria != null && pct_area_prioritaria > 50 ? '#B30000' : '#FC8D59'}
        />
      </div>

      {/* Classe max */}
      {classe_max_queimada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--t3)' }}>
          <span>Classe concentração:</span>
          <PrioridadeBadge classe={classe_max_queimada} size="sm" />
        </div>
      )}

      {/* % do estado */}
      {pct_queimada_estado != null && pct_queimada_estado > 0 && (
        <div style={{ fontSize: 10, color: 'var(--t3)' }}>
          <span style={{ color: '#FC8D59', fontWeight: 600 }}>{fmt(pct_queimada_estado, 2)}%</span>
          {' '}do total queimado no Piauí
        </div>
      )}

      {/* Distribuição por classe */}
      {area_ha_por_classe && Object.keys(area_ha_por_classe).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Por classe
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([1,2,3,4,5] as const).map(cls => {
              const ha  = area_ha_por_classe[String(cls)] ?? 0
              const max = Math.max(...Object.values(area_ha_por_classe).map(Number))
              const pct = max > 0 ? (ha / max) * 100 : 0
              return (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: CLASSE_COLORS[cls], width: 10, textAlign: 'right', flexShrink: 0 }}>
                    {cls}
                  </span>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,.04)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CLASSE_COLORS[cls], borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--t3)', width: 60, textAlign: 'right', flexShrink: 0 }}>
                    {ha > 0 ? `${fmt(ha)} ha` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background:    'rgba(255,255,255,.03)',
      border:        '1px solid rgba(255,255,255,.06)',
      borderRadius:  6,
      padding:       '7px 9px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>{value}</div>
    </div>
  )
}
