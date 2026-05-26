import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ErrorBoundary }  from '../../shared/components/ErrorBoundary'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { ChoroplethMap }  from '../../shared/components/Map/ChoroplethMap'
import { useAppStore }    from '../../core/store/useAppStore'
import { useAgregado, useResumoEstatico } from '../../core/lib/hooks'
import { top20, munIrrReal, MUN_BIOME, MATOPIBA_LIST, REINCIDENT_MUNIS, fmtHa, fmtNum } from '../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

interface MunRow {
  municipio:   string
  haTotal:     number
  haIrr:       number
  haAut:       number
  haReg:       number
  bioma:       string
  matopiba:    boolean
  reincidente: boolean
}

export function MunicipalView() {
  const { anoFiltro } = useAppStore()
  const { data: agregado, isLoading, isError } = useAgregado()
  const { data: staticData } = useResumoEstatico()

  const top20Data = (staticData?.top20    ?? top20)    as [string, number][]
  const irrData   = staticData?.munIrrReal ?? munIrrReal
  const biomeData = staticData?.munBiome   ?? MUN_BIOME

  const liveRows = useMemo((): MunRow[] | null => {
    if (!agregado?.length) return null
    const filtered = agregado.filter(r => anoFiltro === 'all' || r.ano === anoFiltro)
    const acc: Record<string, MunRow> = {}
    for (const r of filtered) {
      if (!acc[r.municipio]) {
        acc[r.municipio] = { municipio: r.municipio, haTotal: 0, haIrr: 0, haAut: 0, haReg: 0,
          bioma: r.bioma_predominante, matopiba: r.matopiba, reincidente: false }
      }
      const m = acc[r.municipio]
      m.haTotal += r.ha_total
      m.haIrr   += r.ha_irregular
      m.haAut   += r.ha_autorizado_total
      m.haReg   += r.ha_regularizado
      m.reincidente = m.reincidente || r.reincidente
    }
    return Object.values(acc).sort((a, b) => b.haIrr - a.haIrr)
  }, [agregado, anoFiltro])

  const isLive = !isLoading && !isError && !!liveRows?.length

  const rows: MunRow[] = liveRows ?? top20Data.map(([m, haTotal]) => ({
    municipio: m, haTotal, haIrr: irrData[m] ?? 0, haAut: 0, haReg: 0,
    bioma: biomeData[m] ?? 'Cerrado',
    matopiba: MATOPIBA_LIST.includes(m), reincidente: REINCIDENT_MUNIS.includes(m as typeof REINCIDENT_MUNIS[number]),
  }))

  const top10     = rows.slice(0, 10)
  const totalMuns = rows.length
  const reincMuns = rows.filter(r => r.reincidente).length
  const matMuns   = rows.filter(r => r.matopiba && r.haIrr > 0).length
  const totalIrr  = rows.reduce((s, r) => s + r.haIrr, 0)

  const barData = top10.map(r => ({
    name:    r.municipio.length > 14 ? r.municipio.slice(0, 13) + '…' : r.municipio,
    full:    r.municipio,
    Irregular:  r.haIrr,
    Autorizado: r.haAut,
    _mat: r.matopiba,
    _rei: r.reincidente,
  }))

  return (
    <div className="view-with-map">
      {/* ── Conteúdo 70% ─────────────────────────────────────────── */}
      <div className="view-content">

        {/* KPIs */}
        <div className="bento">
          <div className="kpi-card b-3">
            <div className="kpi-label">Municípios com Irregular <StatusBadge live={isLive} /></div>
            <div className="kpi-value">{fmtNum(totalMuns)}</div>
            <div className="kpi-sub">com alertas no período</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Área Irregular Total</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(totalIrr)}</div>
            <div className="kpi-sub">acumulado no período</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Reincidentes</div>
            <div className="kpi-value" style={{ color: 'var(--reg)' }}>{reincMuns}</div>
            <div className="kpi-sub">≥ 3 anos com irregular</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Municípios MATOPIBA</div>
            <div className="kpi-value" style={{ color: 'var(--mat)' }}>{matMuns}</div>
            <div className="kpi-sub">com irregular no período</div>
          </div>
        </div>

        {/* Barras top 10 */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Top 10 municípios — Área Irregular (ha)
          </div>
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

          {/* Legenda */}
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
                <th>Bioma</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((r, i) => {
                const ipi = r.haTotal > 0 ? Math.round(r.haIrr / r.haTotal * 100) : 0
                return (
                  <tr key={r.municipio}>
                    <td style={{ color: 'var(--t3)', width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--t1)' }}>{r.municipio}</td>
                    <td style={{ color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.haIrr)}</td>
                    <td style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.haTotal)}</td>
                    <td>
                      <span style={{
                        color: ipi >= 80 ? 'var(--irr)' : ipi >= 50 ? 'var(--reg)' : 'var(--aut)',
                        fontWeight: 700, fontSize: 12,
                      }}>{ipi}%</span>
                    </td>
                    <td>
                      <span className={r.bioma === 'Cerrado' ? 'tag tag-cerrado' : 'tag tag-caatinga'}>{r.bioma}</span>
                    </td>
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
      </div>

      {/* ── Mapa coroplético retrato 30% ─────────────────────────── */}
      <ErrorBoundary label="Mapa Municipal">
        <div className="map-portrait-panel">
          <ChoroplethMap mode="ipi" />
        </div>
      </ErrorBoundary>
    </div>
  )
}
