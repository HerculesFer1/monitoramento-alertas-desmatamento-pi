/**
 * TemporalView.tsx — PRODES Cerrado
 * Gráfico de linhas + barras empilhadas da evolução anual.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, Cell } from 'recharts'
import { useProdesTemporal } from '../hooks/useProdesData'
import { fmtHa } from '../../../core/lib/constants'

export function TemporalView() {
  const { data: temporal, isLoading } = useProdesTemporal()

  // 4 classes da regra MapBiomas (CLAUDE.md §4.1) — espelhadas no PRODES
  // para permitir confrontação direta entre as duas fontes.
  const dataChart = (temporal ?? []).map(r => ({
    ano:           r.ano,
    Irregular:                    Number(r.ha_irregular),
    Autorizado:                   Number(r.ha_autorizado),
    'Autorizado Parcialmente':    Number(r.ha_autorizado_parcialmente),
    Regularizado:                 Number(r.ha_regularizado),
    IPI:                          Number(r.pct_irregular),
  }))

  const TT = {
    background: '#222', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8, fontSize: 12, color: '#F2F2F2',
  }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflow: 'auto' }}>

      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Composição anual (ha) — barras empilhadas
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dataChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
            <XAxis dataKey="ano" tick={{ fill: 'var(--t2)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} tickFormatter={(v) => fmtHa(v)} />
            <Tooltip contentStyle={TT} formatter={(v: number) => fmtHa(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Irregular"                stackId="a" fill="#EF4444" />
            <Bar dataKey="Autorizado"               stackId="a" fill="#10B981" />
            <Bar dataKey="Autorizado Parcialmente"  stackId="a" fill="#34D399" />
            <Bar dataKey="Regularizado"             stackId="a" fill="#F97316" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Índice de Pressão Irregular (IPI %) por ano
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={dataChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
            <XAxis dataKey="ano" tick={{ fill: 'var(--t2)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip contentStyle={TT} formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Bar dataKey="IPI" fill="#EF4444" radius={[6, 6, 0, 0]}>
              {dataChart.map((d, i) => (
                <Cell key={i} fill={d.IPI >= 80 ? '#B91C1C' : d.IPI >= 60 ? '#EF4444' : d.IPI >= 40 ? '#F97316' : '#10B981'} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="IPI" stroke="#FBBF24" strokeWidth={2} dot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
        {!isLoading && dataChart.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8, textAlign: 'center' }}>
            Tendência: {dataChart[0].IPI.toFixed(1)}% ({dataChart[0].ano}) → {dataChart[dataChart.length - 1].IPI.toFixed(1)}% ({dataChart[dataChart.length - 1].ano})
            {' · '}variação: {(dataChart[dataChart.length - 1].IPI - dataChart[0].IPI).toFixed(1)} pp
          </div>
        )}
      </div>
    </div>
  )
}
