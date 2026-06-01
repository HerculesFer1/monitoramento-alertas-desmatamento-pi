/**
 * TemporalGrafico.tsx — queimadas_bdq
 * Gráfico de linha Jan–Dez com 5 séries por classe de prioridade + total.
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { CLASSE_COLORS, MESES_LABELS } from '../types'
import type { QueimadasTemporalItem } from '../types'

interface Props {
  data:         QueimadasTemporalItem[]
  height:       number
  selectedMes?: number | null
}

interface TooltipProps {
  active?:  boolean
  payload?: { name?: string; color?: string; value?: number }[]
  label?:   number
}

function DarkTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null

  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const fmt   = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

  return (
    <div className="tt-premium">
      <div className="tt-title">{MESES_LABELS[label] ?? label}</div>
      {payload.map((p) => (
        <div key={p.name} className="tt-row">
          <span className="tt-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: p.color, flexShrink: 0, display: 'inline-block' }} />
            {p.name}
          </span>
          <span className="tt-val" style={{ color: p.color }}>{fmt(p.value ?? 0)} ha</span>
        </div>
      ))}
      <div className="tt-sep" />
      <div className="tt-row">
        <span className="tt-label">Total</span>
        <span className="tt-val" style={{ color: 'var(--t2)' }}>{fmt(total)} ha</span>
      </div>
    </div>
  )
}

export function TemporalGrafico({ data, height, selectedMes }: Props) {
  if (!data.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--t3)' }}>
      Sem dados temporais
    </div>
  )

  // Flatten: por_classe keys → colunas
  const chartData = data.map(item => ({
    mes:  item.mes,
    ...item.por_classe,
  }))

  const classes = [1, 2, 3, 4, 5] as const

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
          <XAxis
            dataKey="mes"
            label={{ value: 'Mês', position: 'insideBottom', offset: -12, fontSize: 9, fill: 'var(--t3)' }}
            tickFormatter={(v: number) => MESES_LABELS[v] ?? String(v)}
            tick={{ fontSize: 9, fill: 'var(--t3)' }}
            axisLine={{ stroke: 'rgba(255,255,255,.06)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--t3)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` :
              v >= 1000      ? `${(v/1000).toFixed(0)}k`       :
              String(v)
            }
          />
          <Tooltip content={<DarkTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 9, color: 'var(--t3)', paddingTop: 4 }}
            iconType="circle"
            iconSize={6}
            formatter={(value) => `Classe ${value}`}
          />
          {selectedMes && (
            <ReferenceLine
              x={selectedMes}
              stroke="rgba(255,255,255,.25)"
              strokeDasharray="4 2"
            />
          )}
          {classes.map(cls => (
            <Line
              key={cls}
              type="monotone"
              dataKey={String(cls)}
              name={String(cls)}
              stroke={CLASSE_COLORS[cls]}
              strokeWidth={1.5}
              dot={{ r: 2, fill: CLASSE_COLORS[cls] }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
