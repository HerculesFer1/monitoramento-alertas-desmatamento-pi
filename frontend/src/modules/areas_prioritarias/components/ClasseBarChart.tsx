/**
 * ClasseBarChart.tsx
 * Gráfico de barras: área florestal × desmatamento por classe de prioridade.
 * Reutilizado em VisaoGeralView e ProdesPrioridadeView.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { ClasseResumo } from '../types'

interface Props {
  data:   ClasseResumo[]
  height: number
}

export function ClasseBarChart({ data, height }: Props) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded"
        style={{ height }}
      >
        Sem dados
      </div>
    )
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="classe_prioridade"
            label={{ value: 'Classe', position: 'insideBottom', offset: -12, fontSize: 10 }}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <Tooltip
            formatter={(value, name) => [
              `${Number(value ?? 0).toLocaleString('pt-BR')} ha`,
              String(name ?? ''),
            ]}
            labelFormatter={(label) => `Classe ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar
            dataKey="area_floresta_ha"
            name="Floresta"
            fill="#16a34a"
            stackId="a"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="area_desmat_ha"
            name="Desmatado"
            fill="#dc2626"
            stackId="a"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
