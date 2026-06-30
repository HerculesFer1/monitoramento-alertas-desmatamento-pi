/**
 * ProdesPrioridadeView.tsx
 * Área florestal × desmatamento PRODES por classe de prioridade.
 * Responde: "Onde o desmatamento avança sobre zonas prioritárias?"
 */
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAppStore }            from '../../../core/store/useAppStore'
import { useVisaoGeral, useMunicipioDetalhe } from '../hooks/useAreasData'
import type { ClasseMunicipio, ClasseResumo } from '../types'
import { CLASSE_LABELS } from '../types'
import type { ClassePrioridade } from '../types'
import { fmtHa } from '../../../core/lib/constants'

// ── Inline tooltip interface (avoids Recharts 3.x type instability) ──────────

interface TooltipEntry {
  dataKey?: string | number
  name?:    string
  color?:   string
  value?:   number
}
interface ChartTooltipProps {
  active?:  boolean
  payload?: TooltipEntry[]
  label?:   string | number
}

// ── Custom premium tooltip ────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const cls      = label as ClassePrioridade
  const clsLabel = CLASSE_LABELS[cls] ?? ''

  return (
    <div className="tt-premium">
      <div className="tt-title">
        Classe {label}
        {clsLabel && (
          <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 10, marginLeft: 6 }}>
            {clsLabel}
          </span>
        )}
      </div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="tt-row">
          <span className="tt-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: p.color, flexShrink: 0, display: 'inline-block' }} />
            {p.name}
          </span>
          <span className="tt-val" style={{ color: p.color }}>
            {fmtHa(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ProdesPrioridadeView() {
  const [showPct, setShowPct] = useState(false)

  const anoFiltro         = useAppStore((s) => s.anoFiltro)
  const selectedMunicipio = useAppStore((s) => s.selectedMunicipio)

  const { data: visaoGeral } = useVisaoGeral(anoFiltro)
  const { data: detalhe }    = useMunicipioDetalhe(
    selectedMunicipio?.cod ?? null,
    anoFiltro,
  )

  const porClasse: ClasseResumo[] = selectedMunicipio
    ? _adaptClassesMunicipio(detalhe?.classes ?? [])
    : (visaoGeral?.por_classe ?? [])

  const scopeLabel = selectedMunicipio
    ? selectedMunicipio.nome
    : 'Piauí (estado)'

  // Totais para contexto (?? 0 blinda contra RPC devolvendo undefined em campo numérico)
  const totalFloresta = porClasse.reduce((s, c) => s + (c.area_floresta_ha ?? 0), 0)
  const totalDesmat   = porClasse.reduce((s, c) => s + (c.area_desmat_ha   ?? 0), 0)
  const totalGeral    = totalFloresta + totalDesmat

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, gap: 12, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
            PRODES × Prioridade — {scopeLabel}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
            Ano PRODES: {anoFiltro === 'all' ? '2025' : anoFiltro}
            {totalGeral > 0 && (
              <span style={{ color: 'var(--t3)', marginLeft: 8 }}>
                · Total: {fmtHa(totalGeral)}
              </span>
            )}
          </div>
        </div>

        {/* Toggle ha/% */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg4)', borderRadius: 8, padding: 2, border: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
          {([false, true] as const).map((pct) => (
            <button
              key={String(pct)}
              onClick={() => setShowPct(pct)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11,
                fontWeight: 600, cursor: 'pointer', border: 'none',
                background: showPct === pct ? 'rgba(255,255,255,.1)' : 'transparent',
                color: showPct === pct ? 'var(--t1)' : 'var(--t3)',
                transition: 'all .15s',
                fontFamily: 'inherit',
              }}
            >
              {pct ? '%' : 'ha'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip — totais visuais */}
      {totalGeral > 0 && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <SummaryPill label="Floresta" value={fmtHa(totalFloresta)} color="#10B981" pct={(totalFloresta / totalGeral) * 100} />
          <SummaryPill label="Desmatado" value={fmtHa(totalDesmat)}  color="#EF4444" pct={(totalDesmat   / totalGeral) * 100} />
        </div>
      )}

      {/* Chart */}
      <div className="card" style={{ flexShrink: 0, padding: '12px 8px 8px' }}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={porClasse} margin={{ top: 4, right: 16, left: 4, bottom: 20 }} barSize={26}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false} />
            <XAxis
              dataKey="classe_prioridade"
              label={{ value: 'Classe de Prioridade', position: 'insideBottom', offset: -12, fontSize: 9, fill: 'var(--t3)' }}
              tick={{ fontSize: 11, fill: 'var(--t2)', fontWeight: 600 }}
              axisLine={{ stroke: 'rgba(255,255,255,.06)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--t3)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                showPct ? `${v.toFixed(0)}%` :
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` :
                v >= 1000      ? `${(v / 1000).toFixed(0)}k`       :
                String(v)
              }
            />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
            <Legend wrapperStyle={{ fontSize: 10, color: 'var(--t2)', paddingTop: 4 }} iconType="square" iconSize={7} />
            <Bar
              dataKey={showPct ? 'pct_floresta_media' : 'area_floresta_ha'}
              name="Floresta remanescente"
              fill="#10B981"
              stackId="a"
              radius={[3, 3, 0, 0]}
            />
            {!showPct && (
              <Bar
                dataKey="area_desmat_ha"
                name="Desmatamento PRODES"
                fill="#EF4444"
                stackId="a"
                opacity={0.85}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.06)' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 2 }}>
            <tr>
              <th>Classe</th>
              <th style={{ textAlign: 'right' }}>Floresta (ha)</th>
              <th style={{ textAlign: 'right' }}>Desmatado (ha)</th>
              <th style={{ textAlign: 'right' }}>Total (ha)</th>
              <th style={{ textAlign: 'right' }}>% Floresta</th>
              <th style={{ textAlign: 'right' }}>DETER (ha)</th>
              <th style={{ textAlign: 'right' }}>Municípios</th>
            </tr>
          </thead>
          <tbody>
            {porClasse.map((c) => {
              // Guards: RPC pode devolver undefined em campo numérico (regressão de schema).
              // Sem isso a página inteira crasha em c.pct_floresta_media.toFixed().
              const pctFlor = c.pct_floresta_media ?? 0
              const haDeter = c.ha_deter_recente ?? 0
              const pctColor = pctFlor > 60 ? '#10B981' : pctFlor > 30 ? '#F97316' : '#EF4444'
              return (
                <tr key={c.classe_prioridade}>
                  <td style={{ fontWeight: 600, color: 'var(--t1)' }}>
                    {c.prioridade_label ?? `Classe ${c.classe_prioridade}`}
                  </td>
                  <td style={{ textAlign: 'right', color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtHa(c.area_floresta_ha ?? 0)}
                  </td>
                  <td style={{ textAlign: 'right', color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtHa(c.area_desmat_ha ?? 0)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtHa(c.area_total_ha ?? 0)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.pct_floresta_media == null
                      ? <span style={{ color: 'var(--t3)' }}>—</span>
                      : <span style={{ color: pctColor, fontWeight: 600 }}>{pctFlor.toFixed(1)}%</span>}
                  </td>
                  <td style={{ textAlign: 'right', color: '#F97316', fontVariantNumeric: 'tabular-nums' }}>
                    {haDeter > 0 ? fmtHa(haDeter) : (
                      <span style={{ color: 'var(--t3)' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--t3)' }}>
                    {c.n_municipios ?? 0}
                  </td>
                </tr>
              )
            })}
            {!porClasse.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--t3)', padding: '24px 0', fontSize: 12 }}>
                  Sem dados disponíveis
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryPill({ label, value, color, pct }: {
  label: string; value: string; color: string; pct: number
}) {
  return (
    <div style={{
      flex: 1, background: `${color}0F`, border: `1px solid ${color}22`,
      borderRadius: 8, padding: '6px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// ── Adapter ───────────────────────────────────────────────────────────────────

function _adaptClassesMunicipio(classes: ClasseMunicipio[]): ClasseResumo[] {
  return classes.map((c) => ({
    classe_prioridade:  c.classe_prioridade,
    prioridade_label:   c.prioridade_label ?? null,
    area_floresta_ha:   c.area_floresta_ha,
    area_desmat_ha:     c.area_desmat_ha,
    area_total_ha:      c.area_total_ha,
    pct_floresta_media: c.pct_floresta,
    ha_deter_recente:   c.ha_deter_recente ?? 0,
    n_municipios:       1,
  }))
}
