import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { FilterPanel }    from '../../shared/components/Filters/FilterPanel'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { useAppStore }    from '../../core/store/useAppStore'
import { useResumoAnual, useMonthlyAlertas, useResumoEstatico } from '../../core/lib/hooks'
import {
  alertYr, classifYr, ipiYr, matopibaYr, YEARS, MESES, CHART_COLORS,
  fmtHa, fmtNum, calcAutTotal,
} from '../../core/lib/constants'

const TT = {
  background: 'var(--bg3)', border: '1px solid var(--sep)',
  borderRadius: 8, fontSize: 12, color: 'var(--t1)',
}

const fmtTT = (v: unknown) => [fmtHa(v as number), ''] as [string, string]

function heatColor(v: number, min: number, max: number): string {
  const t = max > min ? (v - min) / (max - min) : 0
  if (t < 0.33) {
    const u = t / 0.33
    return `rgb(${Math.round(254 + (249 - 254) * u)},${Math.round(243 + (115 - 243) * u)},${Math.round(199 + (22 - 199) * u)})`
  }
  const u = (t - 0.33) / 0.67
  return `rgb(${Math.round(249 + (153 - 249) * u)},${Math.round(115 + (27 - 115) * u)},${Math.round(22 + (27 - 22) * u)})`
}

export function TemporalView() {
  const { anoFiltro } = useAppStore()

  // ── Dados anuais (Supabase live ou fallback estático) ─────────────────
  const { data: resumoData, isLoading: resumoLoading, isError: resumoError } = useResumoAnual()
  const { data: staticData } = useResumoEstatico()
  const isLive = !resumoLoading && !resumoError && !!resumoData?.length
  const resumoPorAno = useMemo(
    () => Object.fromEntries((resumoData ?? []).map(r => [r.ano, r])),
    [resumoData],
  )

  // ── Dados mensais (arquivo gerado pelo pipeline) ──────────────────────
  const { data: monthlyRaw, isLoading: monthlyLoading } = useMonthlyAlertas()
  const monthlyByYear = useMemo(() => {
    if (!monthlyRaw) return null
    return Object.fromEntries(
      Object.entries(monthlyRaw).map(([k, v]) => [parseInt(k), v])
    ) as Record<number, number[]>
  }, [monthlyRaw])

  // ── Accessors com fallback em 3 níveis: Supabase → JSON → hardcoded ──
  const getArea  = (a: number) => resumoPorAno[a]?.ha_total      ?? staticData?.alertYr?.[a]?.area        ?? alertYr[a]?.area        ?? 0
  const getCount = (a: number) => resumoPorAno[a]?.n_alertas     ?? staticData?.alertYr?.[a]?.count       ?? alertYr[a]?.count       ?? 0
  const getIpi   = (a: number) => resumoPorAno[a]?.ipi           ?? staticData?.ipiYr?.[a]                ?? ipiYr[a]                ?? 0
  const getIrr   = (a: number) => resumoPorAno[a]?.ha_irregular  ?? staticData?.classifYr?.[a]?.irregular ?? classifYr[a]?.irregular  ?? 0
  const getAut   = (a: number) => resumoPorAno[a]?.ha_autorizado_total
    ?? (staticData?.classifYr?.[a] != null ? calcAutTotal(staticData!.classifYr[a]) : undefined)
    ?? (classifYr[a] != null               ? calcAutTotal(classifYr[a])             : 0)
  const getReg   = (a: number) => resumoPorAno[a]?.ha_regularizado ?? staticData?.classifYr?.[a]?.regularizado ?? classifYr[a]?.regularizado ?? 0

  // ── Anos ativos pelo filtro ───────────────────────────────────────────
  const anos      = anoFiltro === 'all' ? YEARS : [anoFiltro as number]
  const isActive  = (a: number) => anoFiltro === 'all' || anoFiltro === a

  // ── KPIs ──────────────────────────────────────────────────────────────
  const ipiInicio = anos.length > 0 ? getIpi(anos[0])               : 0
  const ipiAtual  = anos.length > 0 ? getIpi(anos[anos.length - 1]) : 0
  const reducao   = Math.round((ipiInicio - ipiAtual) * 10) / 10

  // matPct = ha_irr_MATOPIBA / ha_irr_total_PI × 100 — "% do irregular PI que está no MATOPIBA"
  // Denominador correto é ha_irregular (não ha_total), pois matopibaYr.mat já é ha_irregular MATOPIBA.
  const matIrr2022 = Math.max(staticData?.classifYr?.[2022]?.irregular ?? classifYr[2022]?.irregular ?? 1, 1)
  const matIrr2025 = Math.max(staticData?.classifYr?.[2025]?.irregular ?? classifYr[2025]?.irregular ?? 1, 1)
  const matPct2022 = Math.round((staticData?.matopibaYr?.[2022]?.mat ?? matopibaYr[2022].mat) / matIrr2022 * 100)
  const matPct2025 = Math.round((staticData?.matopibaYr?.[2025]?.mat ?? matopibaYr[2025].mat) / matIrr2025 * 100)

  const totalArea    = anos.reduce((s, a) => s + getArea(a), 0)
  const totalAlertas = anos.reduce((s, a) => s + getCount(a), 0)

  // ── Série mensal contínua (48 pontos, filtrada por anoFiltro) ─────────
  const monthlySeries = useMemo(() => {
    if (!monthlyByYear) return []
    return YEARS.flatMap(year =>
      (monthlyByYear[year] ?? Array(12).fill(0)).map((ha, mi) => ({
        label: `${String(mi + 1).padStart(2, '0')}/${String(year).slice(2)}`,
        ha: (anoFiltro === 'all' || anoFiltro === year) ? ha : null,
        year, mes: mi,
      }))
    )
  }, [monthlyByYear, anoFiltro])

  const xTicks = useMemo(
    () => monthlySeries.filter(d => d.mes % 4 === 0).map(d => d.label),
    [monthlySeries],
  )

  // ── Heatmap ───────────────────────────────────────────────────────────
  const allVals = monthlyByYear ? YEARS.flatMap(a => monthlyByYear[a] ?? []) : []
  const hMin = allVals.length > 0 ? Math.min(...allVals) : 0
  const hMax = allVals.length > 0 ? Math.max(...allVals) : 1

  // ── Dados de gráficos de barras ───────────────────────────────────────
  const biomaData    = anos.map(a => ({ ano: a, Cerrado: staticData?.alertYr?.[a]?.cerrado ?? alertYr[a].cerrado, Caatinga: staticData?.alertYr?.[a]?.caatinga ?? alertYr[a].caatinga }))
  const matopibaData = anos.map(a => ({ ano: a, MATOPIBA: staticData?.matopibaYr?.[a]?.mat ?? matopibaYr[a].mat, 'Restante PI': staticData?.matopibaYr?.[a]?.rest ?? matopibaYr[a].rest }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FilterPanel />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KPIs */}
        <div className="grid-4">
          <div className="kpi-card">
            <div className="kpi-label">
              Redução do IPI
              <StatusBadge live={isLive} />
            </div>
            <div className="kpi-value" style={{ color: reducao >= 0 ? 'var(--aut)' : 'var(--irr)' }}>
              {anos.length >= 2
                ? <>{reducao >= 0 ? '↓' : '↑'}{Math.abs(reducao)}pp</>
                : <>{getIpi(anos[0])}%</>
              }
            </div>
            <div className="kpi-sub">{anos[0]} → {anos[anos.length - 1]}</div>
            {anos.length >= 2 && (
              <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
                {ipiInicio}% → {ipiAtual}%
              </span>
            )}
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Ano de Pico</div>
            <div className="kpi-value" style={{ color: 'var(--irr)' }}>2022</div>
            <div className="kpi-sub">IPI máximo registrado</div>
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              {getIpi(2022)}% irregular
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Área acumulada</div>
            <div className="kpi-value">{fmtHa(totalArea)}</div>
            <div className="kpi-sub">{fmtNum(totalAlertas)} alertas</div>
            <div className="kpi-sub" style={{ color: 'var(--t3)', marginTop: 2 }}>período selecionado</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">MATOPIBA no irregular</div>
            <div className="kpi-value" style={{ color: 'var(--mat)' }}>{matPct2022}% → {matPct2025}%</div>
            <div className="kpi-sub">% do irregular PI · 2022 → 2025</div>
            <span className="kpi-badge" style={{ background: 'var(--mat-bg)', color: 'var(--mat)', marginTop: 4 }}>
              ↓{matPct2022 - matPct2025}pp
            </span>
          </div>
        </div>

        {/* ── Gráfico mensal contínuo ────────────────────────────────── */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Alertas Mensais 2022–2025{' '}
            <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(ha · dados reais por data de detecção)</span>
          </div>
          {monthlyLoading ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>
              Carregando dados mensais...
            </div>
          ) : !monthlyByYear ? (
            <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ color: 'var(--t3)', fontSize: 13 }}>Dados mensais indisponíveis</span>
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>Execute o pipeline para gerar <code>monthly_alertas.json</code></span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlySeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIrr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--irr)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--irr)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis
                  dataKey="label" ticks={xTicks}
                  tick={{ fontSize: 10, fill: 'var(--t3)' }}
                  axisLine={false} tickLine={false} interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--t3)' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={TT}
                  formatter={fmtTT}
                  labelFormatter={(label: unknown) => {
                    const [mm, yy] = String(label).split('/')
                    return `${MESES[parseInt(mm) - 1]}/20${yy}`
                  }}
                />
                <Area
                  type="monotone" dataKey="ha" name="Área alertada"
                  stroke="var(--irr)" strokeWidth={1.8} fill="url(#gradIrr)"
                  dot={false} connectNulls={false}
                  activeDot={{ r: 4, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bioma + MATOPIBA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>Área alertada por bioma (ha)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={biomaData} barSize={22} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={fmtTT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Cerrado"  fill={CHART_COLORS.cerrado}  fillOpacity={0.8} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Caatinga" fill={CHART_COLORS.caatinga} fillOpacity={0.8} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              MATOPIBA × Restante PI — Área irregular anual (ha)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={matopibaData} barSize={22} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={fmtTT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="MATOPIBA"    fill={CHART_COLORS.mat}    fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Restante PI" fill={CHART_COLORS.restPI} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap mensal */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
            Sazonalidade — Área alertada mensal (ha) · 2022–2025
          </div>
          {!monthlyByYear ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>
              {monthlyLoading ? 'Carregando...' : 'Indisponível — execute o pipeline'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(12, 1fr)', gap: 3, marginBottom: 6 }}>
                  <div />
                  {MESES.map(m => (
                    <div key={m} style={{ textAlign: 'center', fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>{m}</div>
                  ))}
                </div>
                {YEARS.map(a => (
                  <div key={a} style={{ display: 'grid', gridTemplateColumns: '44px repeat(12, 1fr)', gap: 3, marginBottom: 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                      color: isActive(a) ? 'var(--t1)' : 'var(--t3)',
                      opacity: isActive(a) ? 1 : 0.4 }}>
                      {a}
                    </div>
                    {(monthlyByYear[a] ?? Array(12).fill(0)).map((v, mi) => (
                      <div key={mi} title={`${MESES[mi]} ${a}: ${fmtHa(v)}`}
                        style={{
                          height: 32, borderRadius: 4, cursor: 'default',
                          background: heatColor(v, hMin, hMax),
                          opacity: isActive(a) ? 1 : 0.3,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 600,
                          color: v > hMax * 0.65 ? '#fff' : 'rgba(0,0,0,.7)' }}>
                          {v >= 10000 ? `${(v / 1000).toFixed(0)}k` : `${(v / 1000).toFixed(1)}k`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtHa(hMin)}</span>
                  <div style={{
                    width: 120, height: 8, borderRadius: 4,
                    background: 'linear-gradient(to right, rgb(254,243,199), rgb(249,115,22), rgb(153,27,27))',
                  }} />
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtHa(hMax)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabela resumo anual */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sep)', fontWeight: 600, fontSize: 12, color: 'var(--t2)' }}>
            Resumo anual — Classificação e IPI
            <StatusBadge live={isLive} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ano</th>
                  <th style={{ textAlign: 'right' }}>Alertas</th>
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
                  const ipi = getIpi(a)
                  const ipiPrev = i > 0 ? getIpi(YEARS[i - 1]) : null
                  const delta   = ipiPrev !== null ? Math.round((ipi - ipiPrev) * 10) / 10 : null
                  const regHa   = getReg(a)
                  return (
                    <tr key={a} style={{ opacity: isActive(a) ? 1 : 0.45 }}>
                      <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{a}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(getCount(a))}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(getArea(a))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(getIrr(a))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--aut)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(getAut(a))}</td>
                      <td style={{ textAlign: 'right', color: 'var(--reg)', fontVariantNumeric: 'tabular-nums' }}>
                        {regHa > 0 ? fmtHa(regHa) : <span style={{ color: 'var(--t3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700,
                        color: ipi > 60 ? 'var(--irr)' : ipi > 40 ? 'var(--mat)' : 'var(--aut)' }}>
                        {ipi}%
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
