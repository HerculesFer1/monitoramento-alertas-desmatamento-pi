/**
 * TemporalView.tsx — PRODES Cerrado
 * Espelhamento do modelo MapBiomas Temporal: 4 KPIs + composicao anual +
 * IPI + tabela resumo com delta YoY.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, Cell,
} from 'recharts'
import { useAppStore } from '../../../core/store/useAppStore'
import { useProdesTemporal } from '../hooks/useProdesData'
import { fmtHa, fmtNum } from '../../../core/lib/constants'

const YEARS = [2022, 2023, 2024, 2025] as const

const TT = {
  background: '#222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function TemporalView() {
  const { anoFiltro } = useAppStore()
  const { data: temporal, isLoading } = useProdesTemporal()

  const rows = temporal ?? []
  const byYear = Object.fromEntries(rows.map(r => [r.ano, r]))
  const isActive = (a: number) => anoFiltro === 'all' || anoFiltro === a

  const dataChart = YEARS.map(a => ({
    ano:                          a,
    Irregular:                    Number(byYear[a]?.ha_irregular ?? 0),
    Autorizado:                   Number(byYear[a]?.ha_autorizado ?? 0),
    'Autorizado Parcialmente':    Number(byYear[a]?.ha_autorizado_parcialmente ?? 0),
    Regularizado:                 Number(byYear[a]?.ha_regularizado ?? 0),
    IPI:                          Number(byYear[a]?.pct_irregular ?? 0),
  }))

  const ipiInicio = Number(byYear[2022]?.pct_irregular ?? 0)
  const ipiAtual  = Number(byYear[2025]?.pct_irregular ?? 0)
  const reducao   = Math.round((ipiInicio - ipiAtual) * 10) / 10

  const picoAno = YEARS.reduce((p, a) =>
    Number(byYear[a]?.pct_irregular ?? 0) > Number(byYear[p]?.pct_irregular ?? 0) ? a : p, 2022)
  const ipiPico = Number(byYear[picoAno]?.pct_irregular ?? 0)

  const anos = anoFiltro === 'all' ? [...YEARS] : [anoFiltro as number]
  const totalArea     = anos.reduce((s, a) => s + Number(byYear[a]?.ha_total ?? 0), 0)
  const totalPoligonos = anos.reduce((s, a) => s + Number(byYear[a]?.n_poligonos ?? 0), 0)
  const totalIrr      = anos.reduce((s, a) => s + Number(byYear[a]?.ha_irregular ?? 0), 0)

  return (
    <div className="view-no-map">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* KPIs — 4 cards (modelo MapBiomas) */}
        <div className="grid-4">
          <div className="kpi-card">
            <div className="kpi-label">Redução do IPI</div>
            <div className="kpi-value" style={{ color: reducao >= 0 ? 'var(--aut)' : 'var(--irr)' }}>
              {anos.length >= 2
                ? <>{reducao >= 0 ? '↓' : '↑'}{Math.abs(reducao)}pp</>
                : <>{Number(byYear[anos[0]]?.pct_irregular ?? 0).toFixed(1)}%</>
              }
            </div>
            <div className="kpi-sub">2022 → 2025 · PRODES</div>
            <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
              {ipiInicio.toFixed(1)}% → {ipiAtual.toFixed(1)}%
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Ano de Pico</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{picoAno}</div>
            <div className="kpi-sub">IPI máximo PRODES</div>
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              {ipiPico.toFixed(1)}% irregular
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Área acumulada</div>
            <div className="kpi-value">{fmtHa(totalArea)}</div>
            <div className="kpi-sub">{fmtNum(totalPoligonos)} polígonos</div>
            <div className="kpi-sub" style={{ color: 'var(--t3)', marginTop: 2 }}>período selecionado</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Irregular acumulado</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(totalIrr)}</div>
            <div className="kpi-sub">PRODES Cerrado</div>
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              {totalArea > 0 ? ((totalIrr / totalArea) * 100).toFixed(1) : 0}% do total
            </span>
          </div>
        </div>

        {/* Composicao anual + IPI por ano — lado a lado */}
        <div className="bento">
          <div className="card b-3">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Composição anual (ha) — PRODES Cerrado
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dataChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                <XAxis dataKey="ano" tick={{ fill: 'var(--t2)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} tickFormatter={(v) => fmtHa(v)} />
                <Tooltip contentStyle={TT} formatter={(v) => fmtHa(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Irregular"                stackId="a" fill="#EF4444" />
                <Bar dataKey="Autorizado"               stackId="a" fill="#10B981" />
                <Bar dataKey="Autorizado Parcialmente"  stackId="a" fill="#34D399" />
                <Bar dataKey="Regularizado"             stackId="a" fill="#F97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card b-3">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Índice de Pressão Irregular (IPI %) por ano
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dataChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                <XAxis dataKey="ano" tick={{ fill: 'var(--t2)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip contentStyle={TT} formatter={(v) => `${Number(v).toFixed(1)}%`} />
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

        {/* Tabela resumo anual */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sep)', fontWeight: 600, fontSize: 12, color: 'var(--t2)' }}>
            Resumo anual — PRODES Cerrado
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ano</th>
                  <th style={{ textAlign: 'right' }}>Polígonos</th>
                  <th style={{ textAlign: 'right' }}>Área Total</th>
                  <th style={{ textAlign: 'right' }}>Irregular</th>
                  <th style={{ textAlign: 'right' }}>Autorizado</th>
                  <th style={{ textAlign: 'right' }}>Regularizado</th>
                  <th style={{ textAlign: 'right' }}>IPI (%)</th>
                  <th style={{ minWidth: 80 }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {YEARS.map((a, i) => {
                  const r = byYear[a]
                  const ipi = Number(r?.pct_irregular ?? 0)
                  const ipiPrev = i > 0 ? Number(byYear[YEARS[i - 1]]?.pct_irregular ?? 0) : null
                  const delta   = ipiPrev !== null ? Math.round((ipi - ipiPrev) * 10) / 10 : null
                  const regHa   = Number(r?.ha_regularizado ?? 0)
                  return (
                    <tr key={a} style={{ opacity: isActive(a) ? 1 : 0.45 }}>
                      <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{a}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(r?.n_poligonos ?? 0))}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(Number(r?.ha_total ?? 0))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(Number(r?.ha_irregular ?? 0))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--aut)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(Number(r?.ha_autorizado_total ?? 0))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--reg)', fontVariantNumeric: 'tabular-nums' }}>
                        {regHa > 0 ? fmtHa(regHa) : <span style={{ color: 'var(--t3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700,
                        color: ipi > 60 ? 'var(--irr)' : ipi > 40 ? 'var(--mat)' : 'var(--aut)' }}>
                        {ipi.toFixed(1)}%
                      </td>
                      <td>
                        {delta !== null
                          ? <span style={{ color: delta < 0 ? 'var(--aut)' : 'var(--irr)', fontSize: 11, fontWeight: 600 }}>
                              {delta < 0 ? '↓' : '↑'}{Math.abs(delta)}pp
                            </span>
                          : <span style={{ color: 'var(--t3)', fontSize: 11 }}>base</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
