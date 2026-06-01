/**
 * ClasseBarChart.tsx — queimadas_bdq
 * Barras horizontais: área queimada por classe de prioridade.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { CLASSE_COLORS, CLASSE_LABELS } from '../types'
import type { QueimadasPorClasse } from '../types'

interface Props {
  data:   QueimadasPorClasse[]
  height: number
}

interface TooltipProps {
  active?:  boolean
  payload?: { value?: number; payload?: QueimadasPorClasse }[]
}

function DarkTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  if (!item) return null

  return (
    <div className="tt-premium">
      <div className="tt-title">Classe {item.classe_prioridade} — {item.prioridade_label}</div>
      <div className="tt-row">
        <span className="tt-label">Área queimada</span>
        <span className="tt-val" style={{ color: '#FC8D59' }}>
          {item.area_queimada_ha.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ha
        </span>
      </div>
      <div className="tt-row">
        <span className="tt-label">Cicatrizes</span>
        <span className="tt-val">{item.n_cicatrizes.toLocaleString('pt-BR')}</span>
      </div>
      <div className="tt-sep" />
      <div className="tt-row">
        <span className="tt-label">% do total</span>
        <span className="tt-val" style={{ color: 'var(--t2)' }}>{item.pct_do_total?.toFixed(1)}%</span>
      </div>
    </div>
  )
}

export function ClasseBarChart({ data, height }: Props) {
  if (!data.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--t3)' }}>
      Sem dados
    </div>
  )

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 60, left: 56, bottom: 4 }}
          barSize={14}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 9, fill: 'var(--t3)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` :
              v >= 1000      ? `${(v/1000).toFixed(0)}k`       :
              String(v)
            }
          />
          <YAxis
            type="category"
            dataKey="classe_prioridade"
            tick={({ x, y, payload }) => {
              const cls = payload.value as 1|2|3|4|5
              return (
                <text x={(x as number) - 4} y={y} textAnchor="end" dominantBaseline="middle"
                  style={{ fontSize: 10, fill: CLASSE_COLORS[cls] ?? 'var(--t2)', fontWeight: 600 }}>
                  {CLASSE_LABELS[cls] ?? cls}
                </text>
              )
            }}
            width={52}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
          <Bar dataKey="area_queimada_ha" name="Área queimada (ha)" radius={[0, 3, 3, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.classe_prioridade}
                fill={CLASSE_COLORS[entry.classe_prioridade] ?? '#FC8D59'}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
