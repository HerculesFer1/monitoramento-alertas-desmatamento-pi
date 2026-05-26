import { useMemo } from 'react'
import {
  BarChart, Bar, Cell, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ErrorBoundary }    from '../../shared/components/ErrorBoundary'
import { StatusBadge }      from '../../shared/components/StatusBadge'
import { ConcordanciaMap }  from '../../shared/components/Map/ConcordanciaMap'
import { useResumoProdes, useResumoEstatico } from '../../core/lib/hooks'
import { prodesData, prodesExtra, fmtHa, fmtNum, CHART_COLORS } from '../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

const CICLOS = [2022, 2023, 2024, 2025] as const

function semaforico(pct: number) {
  if (pct >= 70) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  return '#EF4444'
}

export function ProdesView() {
  const { data: prodesLive, isLoading, isError } = useResumoProdes()
  const { data: staticData } = useResumoEstatico()
  const isLive = !isLoading && !isError && !!prodesLive?.length

  const peData = staticData?.prodesExtra ?? prodesExtra

  const cp3Data = peData.irrAnual.anos.map((a, i) => ({
    ano: a,
    'Confirmado PRODES':    peData.irrAnual.confirmado[i],
    'Discordante':          peData.irrAnual.discordante[i],
    'Caatinga (s/ PRODES)': peData.irrAnual.caatinga[i],
  }))

  const cp5Data = [...peData.porVetor].sort((a, b) => a.pct - b.pct)

  const livePorAno = useMemo(
    () => Object.fromEntries((prodesLive ?? []).map(r => [r.ano_prodes_ref, r])),
    [prodesLive],
  )

  const getPct  = (c: number) => livePorAno[c]?.pct_concordancia    ?? staticData?.prodesSummary?.ciclos?.[c]?.pct          ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.pct          ?? 0
  const getCob  = (c: number) => livePorAno[c]?.media_cobertura_pct ?? (peData.mediaCob as Record<number, number>)[c]        ?? 0
  const getConc = (c: number) => livePorAno[c]?.n_concordantes      ?? staticData?.prodesSummary?.ciclos?.[c]?.concordantes  ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.concordantes  ?? 0
  const getDisc = (c: number) => livePorAno[c]?.n_discordantes      ?? staticData?.prodesSummary?.ciclos?.[c]?.discordantes  ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.discordantes  ?? 0

  const cp1Data = CICLOS.map(c => ({
    ciclo: c,
    Concordância: getPct(c),
    'Cob. Média': getCob(c),
  }))

  const cp2Data = CICLOS.map(c => ({
    ciclo:        c,
    Concordantes: getConc(c),
    Discordantes: getDisc(c),
  }))

  const totalValidados    = isLive
    ? (prodesLive ?? []).reduce((s, r) => s + r.n_concordantes + r.n_discordantes, 0)
    : (staticData?.prodesSummary?.totalValidados ?? prodesData.totalValidados)
  const totalConcordantes = isLive
    ? (prodesLive ?? []).reduce((s, r) => s + r.n_concordantes, 0)
    : (staticData?.prodesSummary?.totalConcordantes ?? prodesData.totalConcordantes)
  const concGeral = totalValidados > 0
    ? Math.round(totalConcordantes / totalValidados * 1000) / 10
    : Math.round(prodesData.totalConcordantes / prodesData.totalValidados * 1000) / 10

  const haIrrConf = peData.haIrrConfirmado
  const tendencia = getPct(2025) - getPct(2022)

  return (
    <div className="view-with-map">
      <div className="view-content">

        <div className="bento">
          <div className="kpi-card b-3" style={{ borderColor: 'rgba(16,185,129,.2)', background: 'rgba(16,185,129,.04)' }}>
            <div className="kpi-label">Concordância Geral <StatusBadge live={isLive} /></div>
            <div className="kpi-value" style={{ color: semaforico(concGeral), fontSize: 30 }}>{concGeral}%</div>
            <div className="kpi-sub">MapBiomas × PRODES-Cerrado</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Alertas Validados</div>
            <div className="kpi-value">{fmtNum(totalValidados)}</div>
            <div className="kpi-sub">ciclos 2022–2025</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Irr. Confirmado PRODES</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>{fmtHa(haIrrConf)}</div>
            <div className="kpi-sub">{peData.pctIrrConfirmado?.toFixed(1) ?? '—'}% do irregular total</div>
          </div>
          <div className="kpi-card b-3">
            <div className="kpi-label">Tendência (2022→2025)</div>
            <div className="kpi-value" style={{ color: 'var(--aut)', fontSize: 26 }}>+{tendencia.toFixed(1)}pp</div>
            <div className="kpi-sub">crescimento de concordância</div>
          </div>
        </div>

        <div className="bento">
          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Tendência de Concordância por Ciclo (%)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={cp1Data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Concordância" stroke={CHART_COLORS.aut} strokeWidth={2.5}
                  dot={{ r: 5, fill: CHART_COLORS.aut, stroke: '#111', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="Cob. Média" stroke={CHART_COLORS.reg} strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 4, fill: CHART_COLORS.reg, stroke: '#111', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Concordantes × Discordantes por Ciclo
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cp2Data} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtNum(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Concordantes" fill={CHART_COLORS.aut} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Discordantes" fill={CHART_COLORS.irr} fillOpacity={0.85} stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bento">
          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Área Irregular por Fonte de Validação (ha)
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cp3Data} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Confirmado PRODES"    fill={CHART_COLORS.irr} fillOpacity={0.85} stackId="a" />
                <Bar dataKey="Discordante"          fill={CHART_COLORS.reg} fillOpacity={0.7}  stackId="a" />
                <Bar dataKey="Caatinga (s/ PRODES)" fill={CHART_COLORS.mat} fillOpacity={0.5}  stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Concordância por Vetor de Pressão (%)
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cp5Data} layout="vertical" barSize={12} margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} domain={[0,100]} unit="%" />
                <YAxis type="category" dataKey="vp" width={130} tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'Concordância']} />
                <Bar dataKey="pct" radius={[0,4,4,0]}
                  label={{ position: 'right', fontSize: 10, fill: 'var(--t3)', formatter: (v: unknown) => `${(v as number).toFixed(0)}%` }}>
                  {cp5Data.map((_d, i) => (
                    <Cell key={i} fill={semaforico(_d.pct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <ErrorBoundary label="Mapa PRODES">
        <div className="map-portrait-panel">
          <ConcordanciaMap />
        </div>
      </ErrorBoundary>
    </div>
  )
}
