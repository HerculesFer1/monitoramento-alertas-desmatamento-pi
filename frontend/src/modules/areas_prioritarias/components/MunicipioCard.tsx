/**
 * MunicipioCard.tsx
 * Stats do município selecionado: circular progress + barras por classe.
 * Design premium: SVG ring, dual-bar, hierarquia de dados (Tufte).
 */
import type { ClasseMunicipio, MunicipioResumo, ClassePrioridade } from '../types'
import { CLASSE_COLORS, CLASSE_LABELS } from '../types'
import { fmtHa } from '../../../core/lib/constants'

interface Props {
  nome:      string
  classes:   ClasseMunicipio[]
  resumo:    MunicipioResumo | null
  isLoading: boolean
}

export function MunicipioCard({ nome, classes, resumo, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="skeleton" style={{ height: 14, width: '80%' }} />
        <div className="skeleton" style={{ height: 10, width: '55%' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ height: 52, flex: 1 }} />
          <div className="skeleton" style={{ height: 52, flex: 1 }} />
        </div>
        <div className="skeleton" style={{ height: 8, width: '40%', marginTop: 4 }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 26 }} />
        ))}
      </div>
    )
  }

  const pctFlor = resumo?.pct_floresta_estado ?? 0
  const flor    = resumo?.area_floresta_ha ?? 0
  const des     = resumo?.area_desmat_ha   ?? 0
  const total   = flor + des
  const pctFlorTotal = total > 0 ? (flor / total) * 100 : 0

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>

      {/* Header com ring */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--sep)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nome}
          </div>
          {resumo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t2)', flexWrap: 'wrap' }}>
              {resumo.classe_max_prioridade != null && (
                <ClasseBadge cls={resumo.classe_max_prioridade} />
              )}
              <span style={{ color: 'var(--t3)' }}>·</span>
              <span style={{ color: 'var(--t3)', fontSize: 10 }}>
                {pctFlor.toFixed(2)}% floresta PI
              </span>
            </div>
          )}
        </div>

        {/* Circular progress ring — % floresta no município */}
        {total > 0 && (
          <ProgressRing pct={pctFlorTotal} size={44} />
        )}
      </div>

      {/* Mini-stats grid */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sep)' }}>
          <MiniStat label="Floresta"  value={fmtHa(flor)} color="#10B981" />
          <MiniStat label="Desmatado" value={fmtHa(des)}  color="#EF4444" />
        </div>
      )}

      {/* Dual-progress bar para floresta vs desmatado total */}
      {total > 0 && (
        <div style={{ padding: '8px 14px' }}>
          <div className="dual-bar-track">
            <div className="dual-bar-forest" style={{ width: `${pctFlorTotal}%` }} />
            <div className="dual-bar-desmat"  style={{ width: `${Math.min((des / total) * 100, 100 - pctFlorTotal)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--t3)' }}>
            <span style={{ color: '#10B981' }}>{pctFlorTotal.toFixed(1)}% floresta</span>
            <span style={{ color: '#EF4444' }}>{des > 0 ? `${((des / total) * 100).toFixed(1)}% desmatado` : 'sem desmat.'}</span>
          </div>
        </div>
      )}

      {/* Por classe */}
      <div style={{ padding: '10px 14px' }}>
        <div className="section-label" style={{ marginBottom: 8 }}>
          Por classe de prioridade
        </div>

        {classes.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: '12px 0' }}>
            Sem dados para este município
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
          {classes.map((c) => (
            <ClasseRow key={c.classe_prioridade} c={c} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const stroke = 3.5
  const r      = (size - stroke * 2) / 2
  const circ   = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  const color  = pct > 60 ? '#10B981' : pct > 30 ? '#F97316' : '#EF4444'

  return (
    <div className="progress-ring-wrap" style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.25,.46,.45,.94)' }}
        />
      </svg>
      <div className="progress-ring-label">
        <span style={{ fontSize: 9, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {pct.toFixed(0)}%
        </span>
        <span style={{ fontSize: 7, color: 'var(--t3)', marginTop: 1 }}>flor.</span>
      </div>
    </div>
  )
}

function ClasseBadge({ cls }: { cls: ClassePrioridade }) {
  const color = CLASSE_COLORS[cls]
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:           3,
      padding:      '1px 7px',
      borderRadius:  999,
      background:   `${color}18`,
      color:          color,
      border:        `1px solid ${color}35`,
      fontSize:       10,
      fontWeight:     700,
    }}>
      {cls} <span style={{ fontWeight: 400, opacity: .8 }}>—</span> {CLASSE_LABELS[cls]}
    </span>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg4)',
      padding: '8px 12px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

function ClasseRow({ c }: { c: ClasseMunicipio }) {
  const color    = CLASSE_COLORS[c.classe_prioridade]
  const pctFlor  = Math.min(c.pct_floresta, 100)
  const pctDes   = Math.max(0, Math.min(c.pct_desmat, 100 - pctFlor))
  const total    = c.area_floresta_ha + c.area_desmat_ha
  const pctColor = pctFlor > 60 ? '#10B981' : pctFlor > 30 ? '#F97316' : '#EF4444'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
            Classe {c.classe_prioridade}
          </span>
          {c.prioridade_label && (
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>— {c.prioridade_label}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: pctColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {pctFlor.toFixed(1)}%
        </span>
      </div>

      {/* Dual progress bar */}
      <div className="dual-bar-track">
        <div className="dual-bar-forest" style={{ width: `${pctFlor}%` }} />
        <div className="dual-bar-desmat"  style={{ width: `${pctDes}%`  }} />
      </div>

      {/* Area labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--t3)', marginTop: 3 }}>
        <span style={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(c.area_floresta_ha)}</span>
        <span style={{ color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(total)}</span>
        {c.area_desmat_ha > 0 && (
          <span style={{ color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(c.area_desmat_ha)}</span>
        )}
      </div>
    </div>
  )
}
