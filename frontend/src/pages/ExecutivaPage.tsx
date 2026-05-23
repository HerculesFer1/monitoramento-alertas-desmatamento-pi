import { useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { FilterPanel }    from '../components/Filters/FilterPanel'
import { MapView }        from '../components/Map/MapView'
import { ErrorBoundary }  from '../components/ErrorBoundary'
import { StatusBadge }    from '../components/StatusBadge'
import { useAppStore }    from '../store/useAppStore'
import { useResumoAnual, useAgregado, useResumoEstatico } from '../lib/hooks'
import {
  alertYr, classifYr, ipiYr, matopibaYr, YEARS,
  fmtHa, fmtNum, CHART_COLORS, calcAutTotal,
} from '../lib/constants'

const TT_STYLE = {
  background: 'var(--bg3)', border: '1px solid var(--sep)',
  borderRadius: 8, fontSize: 12, color: 'var(--t1)',
}


export function ExecutivaPage() {
  const { anoFiltro } = useAppStore()
  const { data: resumoData, isLoading: resumoLoading, isError: resumoError } = useResumoAnual()
  const { data: agregadoData } = useAgregado()
  const { data: staticData } = useResumoEstatico()

  const isLive = !resumoLoading && !resumoError && !!resumoData?.length

  // Índice rápido por ano
  const resumoPorAno = useMemo(
    () => Object.fromEntries((resumoData ?? []).map(r => [r.ano, r])),
    [resumoData],
  )

  // Somas de ha_autorizado e ha_autorizado_parcialmente por ano (vindas do agregado)
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

  // Accessors com fallback em 3 níveis: Supabase → JSON → hardcoded
  const getArea  = (a: number) => resumoPorAno[a]?.ha_total         ?? staticData?.alertYr?.[a]?.area         ?? alertYr[a]?.area        ?? 0
  const getCount = (a: number) => resumoPorAno[a]?.n_alertas        ?? staticData?.alertYr?.[a]?.count        ?? alertYr[a]?.count       ?? 0
  const getIrr   = (a: number) => resumoPorAno[a]?.ha_irregular     ?? staticData?.classifYr?.[a]?.irregular  ?? classifYr[a]?.irregular  ?? 0
  const getAut   = (a: number) => resumoPorAno[a]?.ha_autorizado_total
    ?? (staticData?.classifYr?.[a] != null ? calcAutTotal(staticData!.classifYr[a]) : undefined)
    ?? (classifYr[a] != null               ? calcAutTotal(classifYr[a])             : 0)
  const getReg   = (a: number) => resumoPorAno[a]?.ha_regularizado  ?? staticData?.classifYr?.[a]?.regularizado ?? classifYr[a]?.regularizado ?? 0
  const getIpi   = (a: number) => resumoPorAno[a]?.ipi              ?? staticData?.ipiYr?.[a]                 ?? ipiYr[a]                ?? 0
  const getAuPl  = (a: number) => classifLive?.[a]?.aut             ?? staticData?.classifYr?.[a]?.autorizado  ?? classifYr[a]?.autorizado  ?? 0
  const getAuPp  = (a: number) => classifLive?.[a]?.autp            ?? staticData?.classifYr?.[a]?.autorizado_p ?? classifYr[a]?.autorizado_p ?? 0

  const anos = anoFiltro === 'all' ? YEARS : [anoFiltro as number]

  // IPI = ha_irregular / ha_total — numerador e denominador devem ser do mesmo universo (todos os biomas).
  // O filtro de bioma afeta apenas o mapa; não há dados de irregular por bioma disponíveis.
  const areaFiltrada = anos.reduce((s, a) => s + getArea(a), 0)

  const irrFiltrado      = anos.reduce((s, a) => s + getIrr(a),   0)
  const autFiltrado      = anos.reduce((s, a) => s + getAut(a),   0)
  const regFiltrado      = anos.reduce((s, a) => s + getReg(a),   0)
  const alertasFiltrados = anos.reduce((s, a) => s + getCount(a), 0)

  const ipiAtual = areaFiltrada > 0
    ? Math.round(irrFiltrado / areaFiltrada * 1000) / 10
    : 0

  const totalArea = YEARS.reduce((s, a) => s + getArea(a), 0)
  const totalIrr  = YEARS.reduce((s, a) => s + getIrr(a), 0)
  const pctIrr    = totalArea > 0 ? Math.round(totalIrr / totalArea * 100) : 0

  // Dados dos gráficos
  const classifChartData = YEARS.map(a => ({
    ano: a,
    Irregular:    getIrr(a),
    'Aut. Pleno': getAuPl(a),
    'Aut. Parc.': getAuPp(a),
    Regularizado: getReg(a),
  }))

  const ipiChartData = YEARS.map(a => ({ ano: a, IPI: getIpi(a) }))

  // Donut classificação (filtro anos)
  const donutData = [
    { name: 'Irregular',    value: irrFiltrado, color: CHART_COLORS.irr },
    { name: 'Autorizado',   value: autFiltrado, color: CHART_COLORS.aut },
    { name: 'Regularizado', value: regFiltrado, color: CHART_COLORS.reg },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <FilterPanel />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div className="grid-4">
          <div className="kpi-card">
            <div className="kpi-label">
              Área Total Alertada
              <StatusBadge live={isLive} />
            </div>
            <div className="kpi-value">{fmtHa(areaFiltrada)}</div>
            <div className="kpi-sub">{fmtNum(alertasFiltrados)} alertas</div>
            <div className="kpi-sub" style={{ color: 'var(--t3)', marginTop: 2 }}>
              ≈ {(areaFiltrada / 139200).toFixed(1)}× Teresina
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Autorizado (ASV)</div>
            <div className="kpi-value" style={{ color: 'var(--aut)' }}>{fmtHa(autFiltrado)}</div>
            <div className="kpi-sub">pleno + parcialmente</div>
            <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
              {Math.round(autFiltrado / (areaFiltrada || 1) * 100)}%
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Regularizado (DERADSA)</div>
            <div className="kpi-value" style={{ color: 'var(--reg)' }}>{fmtHa(regFiltrado)}</div>
            <div className="kpi-sub">Somente 2024–2025</div>
            <span className="kpi-badge" style={{ background: 'var(--reg-bg)', color: 'var(--reg)', marginTop: 4 }}>
              {regFiltrado === 0
                ? '— sem DERADSA'
                : (() => {
                    const pct = regFiltrado / (areaFiltrada || 1) * 100
                    return pct < 1 ? `${pct.toFixed(2).replace('.', ',')}%` : `${Math.round(pct)}%`
                  })()
              }
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Indício de Ilegalidade</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(irrFiltrado)}</div>
            {anos.length >= 2 && (
              <div className="kpi-sub" style={{ color: 'var(--aut)', fontSize: 11 }}>
                ↓ {Math.round((getIpi(anos[0]) - getIpi(anos[anos.length - 1])) * 10) / 10}pp
                {' '}({anos[0]}→{anos[anos.length - 1]})
              </div>
            )}
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              IPI {ipiAtual}%
            </span>
          </div>
        </div>

        {/* ── Year cards ───────────────────────────────────────────────── */}
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
                opacity: (anoFiltro === 'all' || anoFiltro === a) ? 1 : 0.4,
                transition: 'opacity .2s',
              }}>
                <div className="year-tag">{a}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Row label="Autorizado" ha={haAut} tot={haTotal} color="var(--aut)" />
                  {haAutp > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
                      color: 'var(--t3)', paddingLeft: 10, marginTop: -3 }}>
                      <span>└ Parcialmente</span>
                      <span style={{ color: 'rgba(16,185,129,.6)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtHa(haAutp)}
                      </span>
                    </div>
                  )}
                  {temDeradsa
                    ? <Row label="Regularizado" ha={haReg} tot={haTotal} color="var(--reg)" />
                    : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'var(--t3)' }}>Regularizado</span>
                        <span style={{ color: 'var(--t3)', fontStyle: 'italic', fontSize: 10 }}>— sem DERADSA</span>
                      </div>
                    )
                  }
                  <Row label="Irregular" ha={haIrr} tot={haTotal} color="var(--irr)" />
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--sep)',
                  fontSize: 11, color: 'var(--t3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total: {fmtHa(haTotal)}</span>
                  <span>{fmtNum(getCount(a))} alertas</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Gráficos linha 1: barras + donut ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Área por classificação (ha) — 2022–2025
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classifChartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={TT_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Irregular"    fill={CHART_COLORS.irr} fillOpacity={0.8}  stackId="a" />
                <Bar dataKey="Aut. Pleno"   fill={CHART_COLORS.aut} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Aut. Parc."   fill={CHART_COLORS.aut} fillOpacity={0.4}  stackId="a" />
                <Bar dataKey="Regularizado" fill={CHART_COLORS.reg} fillOpacity={0.75} stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 4, alignSelf: 'flex-start' }}>
              Distribuição acumulada (ha)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE}
                  formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--irr)', marginTop: -10 }}>
              {pctIrr}% irregular (acum.)
            </div>
          </div>
        </div>

        {/* ── Gráficos linha 2: IPI + bioma + MATOPIBA ─────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              IPI — Índice de Pressão Irregular (%)
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ipiChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => [`${v as number}%`, 'IPI']} />
                <Line type="monotone" dataKey="IPI" stroke="var(--irr)" strokeWidth={2.5}
                  dot={{ r: 5, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bioma — dados de área por bioma por ano (split do pipeline) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 4, alignSelf: 'flex-start' }}>
              Bioma
              <StatusBadge live={false} staticLabel="PIPELINE" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Cerrado',  value: anos.reduce((s,a) => s + (staticData?.alertYr?.[a]?.cerrado  ?? alertYr[a]?.cerrado  ?? 0), 0) },
                    { name: 'Caatinga', value: anos.reduce((s,a) => s + (staticData?.alertYr?.[a]?.caatinga ?? alertYr[a]?.caatinga ?? 0), 0) },
                  ]}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  dataKey="value" paddingAngle={2}
                >
                  <Cell fill={CHART_COLORS.cerrado} /><Cell fill={CHART_COLORS.caatinga} />
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* MATOPIBA — ha_irregular MATOPIBA vs resto do PI (split do pipeline) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 4, alignSelf: 'flex-start' }}>
              MATOPIBA
              <StatusBadge live={false} staticLabel="PIPELINE" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'MATOPIBA',    value: anos.reduce((s,a) => s + (staticData?.matopibaYr?.[a]?.mat  ?? matopibaYr[a]?.mat  ?? 0), 0) },
                    { name: 'Restante PI', value: anos.reduce((s,a) => s + (staticData?.matopibaYr?.[a]?.rest ?? matopibaYr[a]?.rest ?? 0), 0) },
                  ]}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  dataKey="value" paddingAngle={2}
                >
                  <Cell fill={CHART_COLORS.mat} /><Cell fill={CHART_COLORS.restPI} />
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Mapa ─────────────────────────────────────────────────────── */}
        <ErrorBoundary label="Mapa">
          <div className="card" style={{ height: 400, padding: 0, overflow: 'hidden' }}>
            <MapView />
          </div>
        </ErrorBoundary>

      </div>
    </div>
  )
}

function Row({ label, ha, tot, color }: { label: string; ha: number; tot: number; color: string }) {
  const pct = tot > 0 ? Math.round(ha / tot * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 11, marginBottom: 3 }}>
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
