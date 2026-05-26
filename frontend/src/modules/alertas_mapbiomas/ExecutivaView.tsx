import { useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { MapView }        from '../../shared/components/Map/BaseMap'
import { ErrorBoundary }  from '../../shared/components/ErrorBoundary'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { useAppStore }    from '../../core/store/useAppStore'
import { useResumoAnual, useAgregado, useResumoEstatico } from '../../core/lib/hooks'
import {
  alertYr, classifYr, ipiYr, YEARS,
  fmtHa, fmtNum, CHART_COLORS, calcAutTotal,
} from '../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function ExecutivaView() {
  const { anoFiltro } = useAppStore()
  const { data: resumoData, isLoading: resumoLoading, isError: resumoError } = useResumoAnual()
  const { data: agregadoData } = useAgregado()
  const { data: staticData }   = useResumoEstatico()

  const isLive = !resumoLoading && !resumoError && !!resumoData?.length

  const resumoPorAno = useMemo(
    () => Object.fromEntries((resumoData ?? []).map(r => [r.ano, r])),
    [resumoData],
  )

  const classifLive = useMemo(() => {
    if (!agregadoData?.length) return null
    const acc: Record<number, { aut: number; autp: number }> = {}
    for (const r of agregadoData) {
      if (!acc[r.ano]) acc[r.ano] = { aut: 0, autp: 0 }
      acc[r.ano].aut  += r.ha_autorizado
      acc[r.ano].autp += r.ha_autorizado_parcialmente
    }
    return acc
  }, [agregadoData])

  const getArea  = (a: number) => resumoPorAno[a]?.ha_total         ?? staticData?.alertYr?.[a]?.area         ?? alertYr[a]?.area        ?? 0
  const getCount = (a: number) => resumoPorAno[a]?.n_alertas        ?? staticData?.alertYr?.[a]?.count        ?? alertYr[a]?.count       ?? 0
  const getIrr   = (a: number) => resumoPorAno[a]?.ha_irregular     ?? staticData?.classifYr?.[a]?.irregular  ?? classifYr[a]?.irregular  ?? 0
  const getAut   = (a: number) => resumoPorAno[a]?.ha_autorizado_total
    ?? (staticData?.classifYr?.[a] != null ? calcAutTotal(staticData!.classifYr[a]) : undefined)
    ?? (classifYr[a] != null               ? calcAutTotal(classifYr[a])             : 0)
  const getReg   = (a: number) => resumoPorAno[a]?.ha_regularizado  ?? staticData?.classifYr?.[a]?.regularizado ?? classifYr[a]?.regularizado ?? 0
  const getIpi   = (a: number) => resumoPorAno[a]?.ipi              ?? staticData?.ipiYr?.[a]  ?? ipiYr[a]  ?? 0
  const getAuPl  = (a: number) => classifLive?.[a]?.aut             ?? staticData?.classifYr?.[a]?.autorizado  ?? classifYr[a]?.autorizado  ?? 0
  const getAuPp  = (a: number) => classifLive?.[a]?.autp            ?? staticData?.classifYr?.[a]?.autorizado_p ?? classifYr[a]?.autorizado_p ?? 0

  const anos = anoFiltro === 'all' ? YEARS : [anoFiltro as number]

  const areaFiltrada     = anos.reduce((s, a) => s + getArea(a),  0)
  const irrFiltrado      = anos.reduce((s, a) => s + getIrr(a),   0)
  const autFiltrado      = anos.reduce((s, a) => s + getAut(a),   0)
  const regFiltrado      = anos.reduce((s, a) => s + getReg(a),   0)
  const alertasFiltrados = anos.reduce((s, a) => s + getCount(a), 0)

  const ipiAtual = areaFiltrada > 0
    ? Math.round(irrFiltrado / areaFiltrada * 1000) / 10
    : 0

  const ipiDelta = anos.length >= 2
    ? Math.round((getIpi(anos[0]) - getIpi(anos[anos.length - 1])) * 10) / 10
    : null

  const classifChartData = YEARS.map(a => ({
    ano: a,
    Irregular:    getIrr(a),
    'Aut. Pleno': getAuPl(a),
    'Aut. Parc.': getAuPp(a),
    Regularizado: getReg(a),
  }))

  const ipiChartData = YEARS.map(a => ({ ano: a, IPI: getIpi(a) }))

  return (
    <div className="view-with-map">
      {/* ── Conteúdo 70% ───────────────────────────────────────────── */}
      <div className="view-content">

        {/* Row 1: KPIs — bento 4 colunas iguais */}
        <div className="bento">
          {/* IPI — hero */}
          <div className="kpi-card b-3" style={{ borderColor: `rgba(239,68,68,.2)`, background: 'rgba(239,68,68,.04)' }}>
            <div className="kpi-label">
              Índice de Pressão Irregular
              <StatusBadge live={isLive} />
            </div>
            <div className="kpi-value" style={{ fontSize: 34, color: ipiAtual >= 50 ? 'var(--irr)' : ipiAtual >= 25 ? 'var(--reg)' : 'var(--aut)' }}>
              {ipiAtual}%
            </div>
            {ipiDelta !== null && (
              <div className="kpi-sub" style={{ color: 'var(--aut)' }}>
                ↓ {ipiDelta}pp desde {anos[0]}
              </div>
            )}
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              {fmtHa(irrFiltrado)} irregulares
            </span>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Área Total Alertada</div>
            <div className="kpi-value">{fmtHa(areaFiltrada)}</div>
            <div className="kpi-sub">{fmtNum(alertasFiltrados)} alertas</div>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Autorizado (ASV)</div>
            <div className="kpi-value" style={{ color: 'var(--aut)' }}>{fmtHa(autFiltrado)}</div>
            <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
              {Math.round(autFiltrado / (areaFiltrada || 1) * 100)}% do total
            </span>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Regularizado (DERADSA)</div>
            <div className="kpi-value" style={{ color: 'var(--reg)' }}>{fmtHa(regFiltrado)}</div>
            <div className="kpi-sub" style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
              Somente 2024–2025
            </div>
          </div>
        </div>

        {/* Row 2: Year cards — padrão MapBiomas */}
        <div className="grid-4">
          {YEARS.map(a => {
            const haTotal = getArea(a)
            const haIrr   = getIrr(a)
            const haAut   = getAuPl(a)
            const haAutp  = getAuPp(a)
            const haReg   = getReg(a)
            const temDeradsa = haReg > 0
            return (
              <div key={a} className="year-card" style={{
                opacity: (anoFiltro === 'all' || anoFiltro === a) ? 1 : 0.35,
                transition: 'opacity .2s',
              }}>
                <div className="year-tag">{a}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Row label="Autorizado"  ha={haAut}  tot={haTotal} color="var(--aut)" />
                  {haAutp > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', paddingLeft: 10, marginTop: -3 }}>
                      <span>└ Parcialmente</span>
                      <span style={{ color: 'rgba(16,185,129,.5)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtHa(haAutp)}
                      </span>
                    </div>
                  )}
                  {temDeradsa
                    ? <Row label="Regularizado" ha={haReg} tot={haTotal} color="var(--reg)" />
                    : <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'var(--t3)' }}>Regularizado</span>
                        <span style={{ color: 'var(--t3)', fontStyle: 'italic', fontSize: 10 }}>— sem DERADSA</span>
                      </div>
                  }
                  <Row label="Irregular" ha={haIrr} tot={haTotal} color="var(--irr)" />
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--sep)', fontSize: 11, color: 'var(--t3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total: {fmtHa(haTotal)}</span>
                  <span>{fmtNum(getCount(a))} alertas</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Row 3: Barras + IPI linha */}
        <div className="bento">
          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Área por classificação (ha) — 2022–2025
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classifChartData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Irregular"    fill={CHART_COLORS.irr} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Aut. Pleno"   fill={CHART_COLORS.aut} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Aut. Parc."   fill={CHART_COLORS.aut} fillOpacity={0.4}  stackId="a" />
                <Bar dataKey="Regularizado" fill={CHART_COLORS.reg} fillOpacity={0.8}  stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              IPI — Índice de Pressão Irregular (%)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ipiChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${v as number}%`, 'IPI']} />
                <Line type="monotone" dataKey="IPI" stroke="var(--irr)" strokeWidth={2.5}
                  dot={{ r: 5, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ── Mapa retrato 30% ────────────────────────────────────────── */}
      <ErrorBoundary label="Mapa">
        <div className="map-portrait-panel">
          <MapView />
        </div>
      </ErrorBoundary>
    </div>
  )
}

function Row({ label, ha, tot, color }: { label: string; ha: number; tot: number; color: string }) {
  const pct = tot > 0 ? Math.round(ha / tot * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--t2)' }}>{label}</span>
        <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
          <span style={{ color, fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{fmtHa(ha)}</span>
          <span style={{ color, fontWeight: 700, fontSize: 11, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
