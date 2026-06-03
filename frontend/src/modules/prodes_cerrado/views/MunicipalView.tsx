/**
 * MunicipalView.tsx — PRODES Cerrado
 * Espelhamento do modelo MapBiomas Municipal: 4 KPIs + Top 10 barras + tabela.
 */
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAppStore } from '../../../core/store/useAppStore'
import { useProdesVisaoGeral, useProdesTopMunicipios } from '../hooks/useProdesData'
import { fmtHa, fmtNum } from '../../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function MunicipalView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano = anoFiltro === 'all' ? 2025 : (anoFiltro as number)
  const { data: kpis }        = useProdesVisaoGeral(ano)
  const { data: top, isLoading } = useProdesTopMunicipios(ano, 100)

  const lista   = top ?? []
  const top10   = lista.slice(0, 10)
  const totalMuns   = kpis?.n_municipios_com_irregular ?? lista.length
  const reincMuns   = lista.filter(d => d.reincidente).length
  const matMuns     = kpis?.n_matopiba ?? lista.filter(d => d.matopiba).length
  const totalIrr    = lista.reduce((s, r) => s + Number(r.ha_irregular), 0)

  const barData = useMemo(() => top10.map(r => ({
    name: r.municipio.length > 14 ? r.municipio.slice(0, 13) + '…' : r.municipio,
    full: r.municipio,
    Irregular: Number(r.ha_irregular),
    _mat: r.matopiba,
    _rei: r.reincidente,
  })), [top10])

  return (
    <div className="view-no-map">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* KPIs — 4 cards */}
        <div className="bento">
          <div className="kpi-card b-3">
            <div className="kpi-label">Municípios com Irregular</div>
            <div className="kpi-value">{fmtNum(totalMuns)}</div>
            <div className="kpi-sub">PRODES Cerrado · {ano}</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Área Irregular Total</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(totalIrr)}</div>
            <div className="kpi-sub">acumulado no ano</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Reincidentes</div>
            <div className="kpi-value" style={{ color: 'var(--reg)' }}>{reincMuns}</div>
            <div className="kpi-sub">≥ 3 anos com irregular</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Municípios MATOPIBA</div>
            <div className="kpi-value" style={{ color: 'var(--mat)' }}>{matMuns}</div>
            <div className="kpi-sub">com irregular PRODES</div>
          </div>
        </div>

        {/* Barras top 10 */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Top 10 municípios — Área Irregular PRODES (ha) · {ano}
          </div>
          {isLoading ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
              Carregando ranking…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} layout="vertical" barSize={14} margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TT}
                  formatter={(v: unknown, _: unknown, p) => {
                    const row = barData.find(r => r.name === (p as { payload: { name: string } }).payload.name)
                    return [fmtHa(v as number), row?._mat ? '⬛ MATOPIBA' : '']
                  }}
                />
                <Bar dataKey="Irregular" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry._mat ? '#F59E0B' : entry._rei ? '#F97316' : '#EF4444'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--t3)' }}>
            {[['#EF4444','Irregular'],['#F97316','Reincidente'],['#F59E0B','MATOPIBA']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabela top 10 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Município</th>
                <th>Irregular (ha)</th>
                <th>Total (ha)</th>
                <th>IPI</th>
                <th>Polígonos</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((r, i) => {
                const irr = Number(r.ha_irregular)
                const tot = Number(r.ha_total)
                const ipi = tot > 0 ? Math.round(irr / tot * 100) : 0
                return (
                  <tr key={r.municipio}>
                    <td style={{ color: 'var(--t3)', width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--t1)' }}>{r.municipio}</td>
                    <td style={{ color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(irr)}</td>
                    <td style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(tot)}</td>
                    <td>
                      <span style={{
                        color: ipi >= 80 ? 'var(--irr)' : ipi >= 50 ? 'var(--reg)' : 'var(--aut)',
                        fontWeight: 700, fontSize: 12,
                      }}>{ipi}%</span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(Number(r.n_poligonos))}</td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      {r.matopiba    && <span className="tag tag-matopiba">MAT</span>}
                      {r.reincidente && <span className="tag tag-irr">REINCID.</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: '6px 0' }}>
          ⚠ Ranking baseado em PRODES Cerrado. Caatinga sem cobertura PRODES — ver módulo MapBiomas.
        </div>
      </div>
    </div>
  )
}
