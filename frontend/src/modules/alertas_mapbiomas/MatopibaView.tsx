import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { ErrorBoundary }  from '../../shared/components/ErrorBoundary'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { ChoroplethMap }  from '../../shared/components/Map/ChoroplethMap'
import { useResumoMatopiba, useMatopibaMunicipios, useResumoAnual } from '../../core/lib/hooks'
import { isSupabaseConfigured }                                      from '../../core/lib/supabase'
import { ipiYr, matopibaYr, YEARS, fmtHa }                          from '../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

const MAT_COLOR = '#F59E0B'
const MAT_BG    = 'rgba(245,158,11,.1)'

function DeltaBadge({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>
  const color = v > 0 ? 'var(--irr)' : 'var(--aut)'
  return <span style={{ color, fontSize: 11, fontWeight: 700 }}>{v > 0 ? '▲' : '▼'} {Math.abs(v).toFixed(1)}pp</span>
}

export function MatopibaView() {
  const { data: matopibaResumo, isLoading: mlLoad, isError: mlErr } = useResumoMatopiba()
  const { data: municipios, isLoading: munLoad }                     = useMatopibaMunicipios()
  const { data: resumoAnual }                                         = useResumoAnual()
  const isLive = !mlLoad && !mlErr && !!matopibaResumo?.length

  const ipiGeral = useMemo(
    () => Object.fromEntries((resumoAnual ?? []).map(r => [r.ano, r.ipi])),
    [resumoAnual],
  )

  const matByYear = useMemo(() => {
    if (!matopibaResumo?.length) return null
    return Object.fromEntries(matopibaResumo.map(r => [r.ano, r]))
  }, [matopibaResumo])

  const haIrrGeral = useMemo(
    () => Object.fromEntries((resumoAnual ?? []).map(r => [r.ano, r.ha_irregular])),
    [resumoAnual],
  )

  const getIpiMat   = (a: number) => matByYear?.[a]?.ipi          ?? 0
  const getHaIrrMat = (a: number) => matByYear?.[a]?.ha_irregular  ?? matopibaYr[a]?.mat ?? 0
  const getHaIrrRest= (a: number) => haIrrGeral[a] != null
    ? Math.max((haIrrGeral[a] ?? 0) - getHaIrrMat(a), 0)
    : (matopibaYr[a]?.rest ?? 0)

  const ipiMat2025 = isLive ? getIpiMat(2025) : 0
  const ipiMat2022 = isLive ? getIpiMat(2022) : 0
  const tendMat    = isLive ? Math.round((ipiMat2025 - ipiMat2022) * 10) / 10 : null
  const haIrrAcum  = YEARS.reduce((s, a) => s + getHaIrrMat(a), 0)
  const ipiPI2025  = ipiGeral[2025] ?? ipiYr[2025] ?? 0

  const lineData = YEARS.map(a => ({
    ano:            a,
    'IPI MATOPIBA': isLive ? getIpiMat(a) : 0,
    'IPI PI Geral': ipiGeral[a] ?? ipiYr[a] ?? 0,
  }))

  const barData = YEARS.map(a => ({
    ano:          a,
    MATOPIBA:     getHaIrrMat(a),
    'Restante PI': getHaIrrRest(a),
  }))

  const topMunicipios = (municipios ?? []).slice(0, 10)

  return (
    <div className="view-with-map">
      <div className="view-content">

        {/* KPIs */}
        <div className="bento">
          <div className="kpi-card b-3" style={{ borderColor: 'rgba(245,158,11,.25)', background: MAT_BG }}>
            <div className="kpi-label">IPI MATOPIBA 2025 <StatusBadge live={isLive} /></div>
            <div className="kpi-value" style={{ color: MAT_COLOR, fontSize: 30 }}>
              {isLive ? `${ipiMat2025.toFixed(1)}%` : '—'}
            </div>
            {tendMat !== null && <div className="kpi-sub"><DeltaBadge v={tendMat} /> desde 2022</div>}
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Irr. Acumulado MATOPIBA</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(haIrrAcum)}</div>
            <div className="kpi-sub">2022–2025 acumulado</div>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Municípios MATOPIBA-PI</div>
            <div className="kpi-value" style={{ color: MAT_COLOR }}>26</div>
            <div className="kpi-sub">Decreto Federal 8.447/2015</div>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">vs. IPI PI Geral 2025</div>
            <div className="kpi-value" style={{
              color: isLive && ipiMat2025 > ipiPI2025 ? 'var(--irr)' : 'var(--aut)', fontSize: 24,
            }}>
              {isLive && ipiPI2025 > 0 ? `${((ipiMat2025 / ipiPI2025) * 100 - 100).toFixed(1)}%` : '—'}
            </div>
            <div className="kpi-sub">variação vs estado</div>
          </div>
        </div>

        {/* Comparativo */}
        <div className="bento">
          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              IPI: MATOPIBA vs PI Geral (%)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,.1)" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="IPI MATOPIBA" stroke={MAT_COLOR}  strokeWidth={2.5} dot={{ r: 5, fill: MAT_COLOR,  stroke: '#111', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="IPI PI Geral" stroke="#EF4444"    strokeWidth={2}   strokeDasharray="4 3" dot={{ r: 4, fill: '#EF4444', stroke: '#111', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Área Irregular: MATOPIBA vs Restante PI (ha)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="MATOPIBA"    fill={MAT_COLOR} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Restante PI" fill="#374151"   fillOpacity={0.7}  stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela ranking */}
        {isSupabaseConfigured && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontWeight: 600, fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--sep)' }}>
              Top Municípios MATOPIBA-PI — Área Irregular
              {munLoad && <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 8 }}>carregando…</span>}
            </div>
            <table className="data-table">
              <thead><tr><th>#</th><th>Município</th><th>Irr. Total (ha)</th><th>Aut. Total (ha)</th><th>IPI</th><th>Reincid.</th></tr></thead>
              <tbody>
                {topMunicipios.map((r, i) => (
                  <tr key={r.municipio}>
                    <td style={{ color: 'var(--t3)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: MAT_COLOR }}>{r.municipio}</td>
                    <td style={{ color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.ha_irregular)}</td>
                    <td style={{ color: 'var(--aut)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.ha_autorizado_total)}</td>
                    <td>
                      <span style={{ color: r.pct_irregular >= 80 ? 'var(--irr)' : r.pct_irregular >= 50 ? 'var(--reg)' : 'var(--aut)', fontWeight: 700 }}>
                        {r.pct_irregular?.toFixed(1) ?? '—'}%
                      </span>
                    </td>
                    <td>
                      {r.reincidente
                        ? <span className="tag tag-irr">SIM</span>
                        : <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      <ErrorBoundary label="Mapa MATOPIBA">
        <div className="map-portrait-panel">
          <ChoroplethMap mode="matopiba" />
        </div>
      </ErrorBoundary>
    </div>
  )
}
