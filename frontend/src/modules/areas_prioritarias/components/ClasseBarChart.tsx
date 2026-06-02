/**
 * ClasseBarChart.tsx
 * Gráfico de barras agrupadas com EIXO Y DUPLO por classe de prioridade.
 *
 * Histórico: a versão anterior empilhava `area_floresta_ha` e `area_desmat_ha`
 * em escala linear. Como floresta (~3,5M ha) é ~7.000x maior que desmatamento
 * (4-3042 ha), o desmatamento ficava invisível e todas as barras pareciam
 * iguais — escondendo o sinal mais importante do gráfico.
 *
 * Esta versão usa dois eixos Y independentes (recharts suporta nativamente
 * via `yAxisId`): Floresta à esquerda (verde, 0..4M ha) e Desmatado à direita
 * (vermelho, 0..pico real). Revela o crescimento ~724x do desmatamento da
 * classe 1 para a 5 — validação visual da metodologia AHP CGEO.
 *
 * Tooltip continua mostrando os 4 dados de contexto (floresta, desmatado,
 * total, %floresta).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import type { ClasseResumo } from '../types'
import { CLASSE_LABELS } from '../types'
import type { ClassePrioridade } from '../types'
import { fmtHa } from '../../../core/lib/constants'

interface Props {
  data:   ClasseResumo[]
  height: number
}

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

  const floresta = payload.find(p => p.dataKey === 'area_floresta_ha')
  const desmat   = payload.find(p => p.dataKey === 'area_desmat_ha')
  const fHa      = floresta?.value ?? 0
  const dHa      = desmat?.value   ?? 0
  const total    = fHa + dHa
  const pctFlor  = total > 0 ? ((fHa / total) * 100).toFixed(1) : '—'
  const cls      = label as ClassePrioridade
  const clsLabel = CLASSE_LABELS[cls] ?? ''

  return (
    <div className="tt-premium">
      <div className="tt-title">
        <span style={{ opacity: .6, fontSize: 10, fontWeight: 400 }}>Classe </span>
        {label}
        {clsLabel && (
          <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 10, marginLeft: 6 }}>
            {clsLabel}
          </span>
        )}
      </div>

      <div className="tt-row">
        <span className="tt-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 1, background: '#10B981', flexShrink: 0, display: 'inline-block' }} />
          Floresta
        </span>
        <span className="tt-val" style={{ color: '#10B981' }}>{fmtHa(fHa)}</span>
      </div>
      <div className="tt-row">
        <span className="tt-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 1, background: '#EF4444', flexShrink: 0, display: 'inline-block' }} />
          Desmatado
        </span>
        <span className="tt-val" style={{ color: '#EF4444' }}>{fmtHa(dHa)}</span>
      </div>

      <div className="tt-sep" />

      <div className="tt-row">
        <span className="tt-label">Total</span>
        <span className="tt-val" style={{ color: 'var(--t2)' }}>{fmtHa(total)}</span>
      </div>
      <div className="tt-row">
        <span className="tt-label">% floresta</span>
        <span className="tt-val" style={{ color: pctFlor !== '—' && Number(pctFlor) > 60 ? '#10B981' : Number(pctFlor) > 30 ? '#F97316' : '#EF4444' }}>
          {pctFlor}%
        </span>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const FOREST_SHADES: Record<ClassePrioridade, string> = {
  1: '#059669',
  2: '#10B981',
  3: '#34D399',
  4: '#6EE7B7',
  5: '#A7F3D0',
}

export function ClasseBarChart({ data, height }: Props) {
  if (!data.length) {
    return (
      <div style={{
        height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--t3)',
        border: '1px dashed rgba(255,255,255,.07)',
        borderRadius: 8,
      }}>
        Sem dados disponíveis
      </div>
    )
  }

  // Formatter compartilhado pelos dois eixos (k / M).
  const fmtAxis = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` :
    v >= 1000      ? `${(v / 1000).toFixed(0)}k`       :
    String(v)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 22 }} barSize={11} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false} />
          <XAxis
            dataKey="classe_prioridade"
            label={{ value: 'Classe de prioridade', position: 'insideBottom', offset: -14, fontSize: 9, fill: 'var(--t3)' }}
            tick={{ fontSize: 11, fill: 'var(--t2)', fontWeight: 600 }}
            axisLine={{ stroke: 'rgba(255,255,255,.06)' }}
            tickLine={false}
          />
          {/* Eixo Y esquerdo — Floresta (verde) em escala 0..pico (~3.5M ha) */}
          <YAxis
            yAxisId="floresta"
            orientation="left"
            tick={{ fontSize: 9, fill: '#34D399' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtAxis}
            label={{ value: 'Floresta (ha)', angle: -90, position: 'insideLeft', offset: 18, fontSize: 9, fill: '#34D399', dy: 28 }}
          />
          {/* Eixo Y direito — Desmatado (vermelho) em escala separada (0..pico real ~3k ha).
              Sem isso, com floresta ~7000x maior, o desmatado fica invisivel. */}
          <YAxis
            yAxisId="desmat"
            orientation="right"
            tick={{ fontSize: 9, fill: '#FCA5A5' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtAxis}
            label={{ value: 'Desmatado (ha)', angle: 90, position: 'insideRight', offset: 14, fontSize: 9, fill: '#FCA5A5', dy: -28 }}
          />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: 'var(--t2)', paddingTop: 4 }}
            iconType="square"
            iconSize={7}
          />
          <Bar
            yAxisId="floresta"
            dataKey="area_floresta_ha"
            name="Floresta"
            radius={[2, 2, 0, 0]}
          >
            {data.map((entry) => (
              <Cell
                key={entry.classe_prioridade}
                fill={FOREST_SHADES[entry.classe_prioridade as ClassePrioridade] ?? '#10B981'}
              />
            ))}
          </Bar>
          <Bar
            yAxisId="desmat"
            dataKey="area_desmat_ha"
            name="Desmatado (escala dir.)"
            fill="#EF4444"
            radius={[2, 2, 0, 0]}
            opacity={0.92}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
