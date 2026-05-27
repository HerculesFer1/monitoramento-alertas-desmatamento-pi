// @ts-nocheck
/**
 * PeriodBadge.tsx — Módulo areas_prioritarias
 *
 * Overlay que exibe no canto do mapa o período real de cobertura dos dados:
 *   - PRODES: dado confirmado pelo INPE (vermelho sólido)
 *   - DETER:  alertas provisórios cobrindo o gap temporal (laranja hachura)
 *
 * Distinção visual obrigatória conforme escopo (ESCOPO_AREAS_PRIORITARIAS.md §1.2):
 *   "PRODES = confirmado/institucional → vermelho sólido"
 *   "DETER  = alerta/provisional       → laranja hachura"
 *
 * O componente é informativo — graceful degradation se dados não disponíveis.
 *
 * @example
 * <PeriodBadge ano={2024} className="absolute bottom-4 right-4 z-10" />
 */
import React, { useState } from 'react'
import { usePeriodCoverage, formatPeriodLabel } from '../hooks/usePeriodCoverage'

interface Props {
  ano?:       number | 'all'
  className?: string
}

export function PeriodBadge({ ano = 2024, className = '' }: Props) {
  const [expanded, setExpanded]  = useState(false)
  const { data: coverage, isLoading } = usePeriodCoverage(ano)
  const { prodes, deter } = formatPeriodLabel(coverage ?? null)

  // Não renderiza se não houver dado de cobertura e não estiver carregando
  if (!isLoading && !prodes && !deter) return null

  return (
    <div
      className={`${className} select-none`}
      role="complementary"
      aria-label="Período de cobertura dos dados"
    >
      {/* Badge compacto (sempre visível) */}
      <button
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Ocultar período de cobertura' : 'Ver período de cobertura dos dados'}
        style={styles.badge}
      >
        {isLoading ? (
          <span style={styles.loadingDot} aria-label="Carregando..." />
        ) : (
          <>
            {/* Indicador PRODES */}
            {prodes && (
              <span style={styles.dotProdes} title="PRODES (confirmado)" />
            )}
            {/* Indicador DETER */}
            {deter && (
              <span style={styles.dotDeter} title="DETER (alertas)" />
            )}
            <span style={styles.badgeLabel}>
              {coverage?.ano_prodes ?? '—'}
            </span>
          </>
        )}
        <span style={styles.chevron}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Painel expandido */}
      {expanded && !isLoading && (
        <div style={styles.panel} role="tooltip">
          <div style={styles.panelTitle}>Cobertura temporal dos dados</div>

          {/* PRODES */}
          {prodes && (
            <div style={styles.row}>
              <span style={styles.legendProdes} aria-hidden="true" />
              <div>
                <div style={styles.sourceLabel}>PRODES {coverage?.ano_prodes}</div>
                <div style={styles.sourceDate}>{prodes}</div>
                <div style={styles.sourceNote}>Desmatamento confirmado — INPE</div>
              </div>
            </div>
          )}

          {/* Separador */}
          {prodes && deter && <div style={styles.divider} />}

          {/* DETER gap */}
          {deter && (
            <div style={styles.row}>
              <span style={styles.legendDeter} aria-hidden="true" />
              <div>
                <div style={styles.sourceLabel}>DETER (gap)</div>
                <div style={styles.sourceDate}>{deter}</div>
                <div style={styles.sourceNote}>Alertas provisórios — INPE/TerraBrasilis</div>
              </div>
            </div>
          )}

          {/* Nota metodológica */}
          <div style={styles.footnote}>
            PRODES e DETER são fontes distintas com interpretações diferentes.
            Não somar os valores.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Estilos inline ────────────────────────────────────────────────────────────
// Usamos inline styles para isolar o componente do CSS global do sistema
// e garantir que funcione mesmo em contextos de mapa (z-index stacking).

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display:        'flex',
    alignItems:     'center',
    gap:            '5px',
    background:     'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    border:         '1px solid rgba(0,0,0,0.12)',
    borderRadius:   '6px',
    padding:        '4px 8px',
    fontSize:       '11px',
    fontWeight:     500,
    color:          '#374151',
    cursor:         'pointer',
    boxShadow:      '0 1px 4px rgba(0,0,0,0.15)',
    whiteSpace:     'nowrap',
    fontFamily:     'system-ui, sans-serif',
  },

  badgeLabel: {
    color:      '#1f2937',
    fontWeight: 600,
  },

  chevron: {
    fontSize:   '8px',
    color:      '#9ca3af',
    marginLeft: '2px',
  },

  loadingDot: {
    display:      'inline-block',
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    background:   '#d1d5db',
    animation:    'pulse 1.5s infinite',
  },

  dotProdes: {
    display:         'inline-block',
    width:           '8px',
    height:          '8px',
    borderRadius:    '2px',
    background:      '#C0392B',
    flexShrink:      0,
  },

  dotDeter: {
    display:         'inline-block',
    width:           '8px',
    height:          '8px',
    borderRadius:    '2px',
    background:      'repeating-linear-gradient(45deg, #E67E22, #E67E22 2px, #f8c39e 2px, #f8c39e 5px)',
    border:          '1px solid #E67E22',
    flexShrink:      0,
  },

  panel: {
    marginTop:      '4px',
    background:     'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(6px)',
    border:         '1px solid rgba(0,0,0,0.12)',
    borderRadius:   '8px',
    padding:        '10px 12px',
    minWidth:       '230px',
    boxShadow:      '0 4px 16px rgba(0,0,0,0.15)',
    fontFamily:     'system-ui, sans-serif',
  },

  panelTitle: {
    fontSize:     '11px',
    fontWeight:   700,
    color:        '#111827',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  row: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '8px',
    marginBottom: '2px',
  },

  legendProdes: {
    display:      'inline-block',
    width:        '12px',
    height:       '12px',
    borderRadius: '2px',
    background:   '#C0392B',
    flexShrink:   0,
    marginTop:    '2px',
  },

  legendDeter: {
    display:      'inline-block',
    width:        '12px',
    height:       '12px',
    borderRadius: '2px',
    background:   'repeating-linear-gradient(45deg, #E67E22, #E67E22 2px, #f8c39e 2px, #f8c39e 5px)',
    border:       '1px solid #E67E22',
    flexShrink:   0,
    marginTop:    '2px',
  },

  sourceLabel: {
    fontSize:   '12px',
    fontWeight: 600,
    color:      '#1f2937',
  },

  sourceDate: {
    fontSize:   '11px',
    color:      '#374151',
    fontWeight: 500,
  },

  sourceNote: {
    fontSize:   '10px',
    color:      '#6b7280',
    marginTop:  '1px',
  },

  divider: {
    height:     '1px',
    background: '#e5e7eb',
    margin:     '8px 0',
  },

  footnote: {
    marginTop:  '8px',
    fontSize:   '10px',
    color:      '#9ca3af',
    lineHeight: '1.4',
    borderTop:  '1px dashed #e5e7eb',
    paddingTop: '6px',
  },
}
