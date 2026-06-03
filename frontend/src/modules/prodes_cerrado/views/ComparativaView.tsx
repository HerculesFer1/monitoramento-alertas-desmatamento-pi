/**
 * ComparativaView.tsx — PRODES Cerrado
 * Espelhamento do modelo MapBiomas Comparativa: Indice base 2022=100,
 * cards YoY e comparativo absoluto Irregular x Autorizado.
 */
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, LabelList,
} from 'recharts'
import { useAppStore } from '../../../core/store/useAppStore'
import { useProdesTemporal } from '../hooks/useProdesData'
import { fmtHa, CHART_COLORS } from '../../../core/lib/constants'

const YEARS = [2022, 2023, 2024, 2025] as const
const ANO_BASE = 2022

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function ComparativaView() {
  const { anoFiltro } = useAppStore()
  const { data: temporal } = useProdesTemporal()

  const byYear = Object.fromEntries((temporal ?? []).map(r => [r.ano, r]))

  const getIpi  = (a: number) => Number(byYear[a]?.pct_irregular ?? 0)
  const getIrr  = (a: number) => Number(byYear[a]?.ha_irregular ?? 0)
  const getAut  = (a: number) => Number(byYear[a]?.ha_autorizado_total ?? 0)
  const getArea = (a: number) => Number(byYear[a]?.ha_total ?? 0)

  const ipi2022 = getIpi(ANO_BASE) || 1

  const indexData = YEARS.map(a => ({
    ano:    a,
    Índice: Math.round(getIpi(a) / ipi2022 * 100 * 10) / 10,
    IPI:    getIpi(a),
  }))

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

  const absData = YEARS.map(a => ({
    ano:        a,
    Irregular:  getIrr(a),
    Autorizado: getAut(a),
    'Área Total': getArea(a),
  }))

  const anoSel = anoFiltro === 'all' ? null : (anoFiltro as number)
  const queda  = Math.round((1 - getIpi(2025) / ipi2022) * 100)

  return (
    <div className="view-no-map">

      {/* Row 1: Índice 2022=100 — hero */}
      <div className="card b-full">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>
            Índice de Pressão Irregular PRODES — Base 2022 = 100
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
          {ipi2022 > 0 ? (
            <>
              Queda de{' '}
              <strong style={{ color: queda >= 0 ? 'var(--aut)' : 'var(--irr)' }}>
                {Math.abs(queda)}%
              </strong>{' '}
              no índice de irregularidade entre 2022 e 2025 (PRODES Cerrado)
            </>
          ) : (
            'Sem dados PRODES suficientes para o período base 2022.'
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={indexData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
            <XAxis dataKey="ano" tick={{ fontSize: 12, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
              domain={[0, 'auto']} unit="" />
            <Tooltip
              contentStyle={TT}
              formatter={(v: unknown, name: unknown) =>
                name === 'Índice' ? [`${v as number}`, 'Índice (2022=100)'] : [`${(v as number).toFixed?.(1)}%`, 'IPI']
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
              <DeltaLine label="Irregular"  pct={p.irrDelta} inverso />
              <DeltaLine label="Autorizado" pct={p.autDelta} />
            </div>
          </div>
        ))}
      </div>

      {/* Row 3: Comparativo absoluto */}
      <div className="bento">
        <div className="card b-3">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Irregular PRODES (ha) — todos os anos
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
            Autorizado PRODES (ha) — todos os anos
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
