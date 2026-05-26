import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, LabelList,
} from 'recharts'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { useAppStore }    from '../../core/store/useAppStore'
import { useResumoAnual, useResumoEstatico } from '../../core/lib/hooks'
import {
  alertYr, classifYr, ipiYr, YEARS, fmtHa, CHART_COLORS, calcAutTotal,
} from '../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

const ANO_BASE = 2022

export function ComparativaView() {
  const { anoFiltro } = useAppStore()
  const { data: resumoData, isLoading, isError } = useResumoAnual()
  const { data: staticData } = useResumoEstatico()

  const isLive = !isLoading && !isError && !!resumoData?.length

  const resumoPorAno = useMemo(
    () => Object.fromEntries((resumoData ?? []).map(r => [r.ano, r])),
    [resumoData],
  )

  const getIpi  = (a: number) => resumoPorAno[a]?.ipi          ?? staticData?.ipiYr?.[a]                ?? ipiYr[a]  ?? 0
  const getIrr  = (a: number) => resumoPorAno[a]?.ha_irregular  ?? staticData?.classifYr?.[a]?.irregular ?? classifYr[a]?.irregular  ?? 0
  const getAut  = (a: number) => resumoPorAno[a]?.ha_autorizado_total
    ?? (staticData?.classifYr?.[a] != null ? calcAutTotal(staticData!.classifYr[a]) : undefined)
    ?? (classifYr[a] != null               ? calcAutTotal(classifYr[a])             : 0)
  const getArea = (a: number) => resumoPorAno[a]?.ha_total      ?? staticData?.alertYr?.[a]?.area        ?? alertYr[a]?.area ?? 0

  const ipi2022 = getIpi(ANO_BASE) || 1

  // Índice relativo 2022=100
  const indexData = YEARS.map(a => ({
    ano:   a,
    Índice: Math.round(getIpi(a) / ipi2022 * 100 * 10) / 10,
    IPI:    getIpi(a),
  }))

  // Variação YoY entre anos consecutivos
  const yoyPairs = YEARS.slice(1).map((a, i) => {
    const prev = YEARS[i]
    const ipiAtual = getIpi(a)
    const ipiPrev  = getIpi(prev)
    const irrAtual = getIrr(a)
    const irrPrev  = getIrr(prev)
    const autAtual = getAut(a)
    const autPrev  = getAut(prev)
    return {
      label:      `${prev}→${a}`,
      ano:         a,
      ipiDelta:   Math.round((ipiAtual - ipiPrev) * 10) / 10,
      irrDelta:   Math.round((irrAtual - irrPrev) / (irrPrev || 1) * 1000) / 10,
      autDelta:   Math.round((autAtual - autPrev) / (autPrev || 1) * 1000) / 10,
      ipiAtual,
      ipiPrev,
    }
  })

  // Comparativo absoluto por ano
  const absData = YEARS.map(a => ({
    ano:       a,
    Irregular: getIrr(a),
    Autorizado: getAut(a),
    'Área Total': getArea(a),
  }))

  const anoSel = anoFiltro === 'all' ? null : (anoFiltro as number)

  return (
    <div className="view-no-map">

      {/* Row 1: Índice 2022=100 — hero */}
      <div className="card b-full">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>
            Índice de Pressão Irregular — Base 2022 = 100
          </div>
          <StatusBadge live={isLive} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
          Queda de{' '}
          <strong style={{ color: 'var(--aut)' }}>
            {Math.round((1 - getIpi(2025) / ipi2022) * 100)}%
          </strong>{' '}
          no índice de irregularidade entre 2022 e 2025
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={indexData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
            <XAxis dataKey="ano" tick={{ fontSize: 12, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
              domain={[0, 110]} unit="" />
            <Tooltip
              contentStyle={TT}
              formatter={(v: unknown, name: unknown) =>
                name === 'Índice' ? [`${v as number}`, 'Índice (2022=100)'] : [`${v as number}%`, 'IPI']
              }
            />
            <ReferenceLine y={100} stroke="rgba(255,255,255,.12)" strokeDasharray="4 3" />
            {anoSel && <ReferenceLine x={anoSel} stroke="rgba(16,185,129,.4)" strokeDasharray="4 3" />}
            <Line
              type="monotone" dataKey="Índice" stroke="var(--irr)" strokeWidth={3}
              dot={{ r: 6, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }}
              activeDot={{ r: 8 }}
            >
              <LabelList dataKey="Índice" position="top" style={{ fontSize: 11, fill: 'var(--t2)', fontWeight: 600 }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Row 2: Cards YoY */}
      <div style={{ display: 'flex', gap: 12 }}>
        {yoyPairs.map(p => (
          <div key={p.label} className="kpi-card" style={{ flex: 1 }}>
            <div className="kpi-label">{p.label}</div>
            <div className="kpi-value" style={{ fontSize: 22, color: p.ipiDelta <= 0 ? 'var(--aut)' : 'var(--irr)' }}>
              {p.ipiDelta <= 0 ? '↓' : '↑'} {Math.abs(p.ipiDelta)}pp IPI
            </div>
            <div className="kpi-sub">
              {p.ipiPrev.toFixed(1)}% → {p.ipiAtual.toFixed(1)}%
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <DeltaLine label="Irregular" pct={p.irrDelta} inverso />
              <DeltaLine label="Autorizado" pct={p.autDelta} />
            </div>
          </div>
        ))}
      </div>

      {/* Row 3: Comparativo absoluto */}
      <div className="bento">
        <div className="card b-3">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Irregular (ha) — todos os anos
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={absData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Irregular']} />
              <Bar dataKey="Irregular" fill={CHART_COLORS.irr} fillOpacity={0.85} radius={[4,4,0,0]}>
                {anoSel && <LabelList dataKey="Irregular" position="top" style={{ fontSize: 10, fill: 'var(--t3)' }} formatter={(v: unknown) => fmtHa(v as number)} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card b-3">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Autorizado (ha) — todos os anos
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={absData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Autorizado']} />
              <Bar dataKey="Autorizado" fill={CHART_COLORS.aut} fillOpacity={0.85} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}

function DeltaLine({ label, pct, inverso }: { label: string; pct: number; inverso?: boolean }) {
  const melhora = inverso ? pct <= 0 : pct >= 0
  const color   = melhora ? 'var(--aut)' : 'var(--irr)'
  const arrow   = pct === 0 ? '→' : pct > 0 ? '↑' : '↓'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{arrow} {Math.abs(pct).toFixed(1)}%</span>
    </div>
  )
}
