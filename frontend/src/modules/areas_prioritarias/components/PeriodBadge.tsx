/**
 * PeriodBadge.tsx — Módulo areas_prioritarias
 *
 * Overlay no canto do mapa com o período real de cobertura dos dados:
 *   - PRODES: dado confirmado INPE (vermelho sólido)
 *   - DETER:  alertas provisórios gap temporal (laranja hachura)
 *
 * Distinção visual obrigatória: PRODES ≠ DETER — não somar valores.
 * Componente usa inline styles para isolar do CSS global (z-index stacking).
 */
import React, { useState } from 'react'
import { usePeriodCoverage, formatPeriodLabel } from '../hooks/usePeriodCoverage'

interface Props {
  ano?:       number | 'all'
  className?: string
}

export function PeriodBadge({ ano = 2025, className = '' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { data: coverage, isLoading } = usePeriodCoverage(ano)
  const { prodes, deter } = formatPeriodLabel(coverage ?? null)

  if (!isLoading && !prodes && !deter) return null

  return (
    <div
      className={className}
      style={{ userSelect: 'none' }}
      role="complementary"
      aria-label="Período de cobertura dos dados"
    >
      {/* Badge compacto */}
      <button
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Ocultar cobertura' : 'Ver período de cobertura dos dados'}
        style={S.badge}
      >
        {isLoading ? (
          <span style={S.loadingDot} aria-label="Carregando..." />
        ) : (
          <>
            {prodes && <span style={S.dotProdes} title="PRODES (confirmado)" />}
            {deter  && <span style={S.dotDeter}  title="DETER (alertas)"    />}
            <span style={S.badgeLabel}>{coverage?.ano_prodes ?? '—'}</span>
          </>
        )}
        <span style={S.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Painel expandido */}
      {expanded && !isLoading && (
        <div style={S.panel} role="tooltip">
          <div style={S.panelTitle}>Cobertura temporal</div>

          {prodes && (
            <div style={S.row}>
              <span style={S.legendProdes} aria-hidden="true" />
              <div>
                <div style={S.sourceLabel}>PRODES {coverage?.ano_prodes}</div>
                <div style={S.sourceDate}>{prodes}</div>
                <div style={S.sourceNote}>Desmatamento confirmado — INPE</div>
              </div>
            </div>
          )}

          {prodes && deter && <div style={S.divider} />}

          {deter && (
            <div style={S.row}>
              <span style={S.legendDeter} aria-hidden="true" />
              <div>
                <div style={S.sourceLabel}>DETER (gap)</div>
                <div style={S.sourceDate}>{deter}</div>
                <div style={S.sourceNote}>Alertas provisórios — INPE/TerraBrasilis</div>
              </div>
            </div>
          )}

          <div style={S.footnote}>
            PRODES e DETER são fontes distintas. Não somar os valores.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Estilos inline — isolados do CSS global ──────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  badge: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'rgba(10,10,10,.82)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,.1)', borderRadius: 7,
    padding: '4px 9px', fontSize: 11, fontWeight: 600,
    color: 'rgba(242,242,242,.9)', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,.4)',
    whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif',
  },
  badgeLabel:  { color: 'rgba(242,242,242,.95)', fontWeight: 700 },
  chevron:     { fontSize: 8, color: 'rgba(255,255,255,.3)', marginLeft: 2 },
  loadingDot:  { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,.2)' },
  dotProdes: {
    display: 'inline-block', width: 8, height: 8,
    borderRadius: 2, background: '#C0392B', flexShrink: 0,
  },
  dotDeter: {
    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
    background: 'repeating-linear-gradient(45deg, #E67E22, #E67E22 2px, rgba(230,126,34,.2) 2px, rgba(230,126,34,.2) 5px)',
    border: '1px solid #E67E22', flexShrink: 0,
  },
  panel: {
    marginTop: 4,
    background: 'rgba(10,10,10,.94)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,.09)', borderRadius: 10,
    padding: '10px 12px', minWidth: 220,
    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
    fontFamily: 'system-ui, sans-serif',
  },
  panelTitle: {
    fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em',
  },
  row:          { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  legendProdes: { display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#C0392B', flexShrink: 0, marginTop: 2 },
  legendDeter:  {
    display: 'inline-block', width: 12, height: 12, borderRadius: 2,
    background: 'repeating-linear-gradient(45deg, #E67E22, #E67E22 2px, rgba(230,126,34,.2) 2px, rgba(230,126,34,.2) 5px)',
    border: '1px solid #E67E22', flexShrink: 0, marginTop: 2,
  },
  sourceLabel: { fontSize: 12, fontWeight: 700, color: 'rgba(242,242,242,.9)' },
  sourceDate:  { fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 500 },
  sourceNote:  { fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 1 },
  divider:     { height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0' },
  footnote: {
    marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,.25)', lineHeight: 1.5,
    borderTop: '1px dashed rgba(255,255,255,.07)', paddingTop: 6,
  },
}
