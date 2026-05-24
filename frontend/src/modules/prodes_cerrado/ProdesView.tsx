import { useMemo } from 'react'
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { FilterPanel }    from '../../shared/components/Filters/FilterPanel'
import { StatusBadge }    from '../../shared/components/StatusBadge'
import { useResumoProdes, useResumoEstatico } from '../../core/lib/hooks'
import { prodesData, prodesExtra, fmtHa, fmtNum, CHART_COLORS } from '../../core/lib/constants'

const TT = {
  background: 'var(--bg3)', border: '1px solid var(--sep)',
  borderRadius: 8, fontSize: 12, color: 'var(--t1)',
}


const CICLOS = [2022, 2023, 2024, 2025] as const

// Cor semafórica por % concordância
function semaforico(pct: number) {
  if (pct >= 70) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  return '#EF4444'
}

export function ProdesView() {
  const { data: prodesLive, isLoading, isError } = useResumoProdes()
  const { data: staticData } = useResumoEstatico()
  const isLive = !isLoading && !isError && !!prodesLive?.length

  // Fonte de dados para análises CP3-CP5 e KPIs derivados:
  // 1º Supabase live (prodesLive) · 2º resumo_estatico.json · 3º hardcoded
  const peData = staticData?.prodesExtra ?? prodesExtra

  // CP3/CP4/CP5 derivados do pipeline (não variam com filtros Supabase)
  const cp3Data = peData.irrAnual.anos.map((a, i) => ({
    ano: a,
    'Confirmado PRODES':    peData.irrAnual.confirmado[i],
    'Discordante':          peData.irrAnual.discordante[i],
    'Caatinga (s/ PRODES)': peData.irrAnual.caatinga[i],
  }))
  const cp4Data = peData.distCob.labels.map((l, i) => ({
    faixa:   l,
    Alertas: peData.distCob.n[i],
    Área:    Math.round(peData.distCob.ha[i] / 1000),
  }))
  const cp5Data = [...peData.porVetor].sort((a, b) => a.pct - b.pct)

  const livePorAno = useMemo(
    () => Object.fromEntries((prodesLive ?? []).map(r => [r.ano_prodes_ref, r])),
    [prodesLive],
  )

  // Accessors com fallback em 3 níveis: Supabase → JSON → hardcoded
  const getPct  = (c: number) => livePorAno[c]?.pct_concordancia    ?? staticData?.prodesSummary?.ciclos?.[c]?.pct           ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.pct           ?? 0
  const getCob  = (c: number) => livePorAno[c]?.media_cobertura_pct ?? (peData.mediaCob as Record<number, number>)[c] ?? 0
  const getN    = (c: number) => livePorAno[c]?.n_total             ?? staticData?.prodesSummary?.ciclos?.[c]?.n             ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.n             ?? 0
  const getConc = (c: number) => livePorAno[c]?.n_concordantes      ?? staticData?.prodesSummary?.ciclos?.[c]?.concordantes  ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.concordantes  ?? 0
  const getDisc = (c: number) => livePorAno[c]?.n_discordantes      ?? staticData?.prodesSummary?.ciclos?.[c]?.discordantes  ?? prodesData.ciclos[c as keyof typeof prodesData.ciclos]?.discordantes  ?? 0

  // CP1 e CP2 com dados live
  const cp1Data = CICLOS.map(c => ({
    ciclo: c,
    Concordância: getPct(c),
    'Cob. Média': getCob(c),
    alertas: getN(c),
  }))

  const cp2Data = CICLOS.map(c => ({
    ciclo: c,
    Concordantes: getConc(c),
    Discordantes: getDisc(c),
  }))

  // totalValidados = apenas CONCORDANTE + DISCORDANTE (exclui SEM_PRODES_NO_CICLO e DADOS_PENDENTES)
  // n_total da RPC inclui alertas sem PRODES disponível (ex.: ciclo 2026 → 747 SEM_PRODES_NO_CICLO)
  // que devem ficar FORA do denominador da taxa de concordância.
  const totalValidados    = isLive
    ? (prodesLive ?? []).reduce((s, r) => s + r.n_concordantes + r.n_discordantes, 0)
    : (staticData?.prodesSummary?.totalValidados    ?? prodesData.totalValidados)
  const totalConcordantes = isLive
    ? (prodesLive ?? []).reduce((s, r) => s + r.n_concordantes, 0)
    : (staticData?.prodesSummary?.totalConcordantes ?? prodesData.totalConcordantes)
  const semProdes = staticData?.prodesSummary?.semProdes ?? prodesData.semProdes

  const pctGeral  = Math.round(totalConcordantes / (totalValidados || 1) * 1000) / 10
  const tendencia = Math.round((getPct(2025) - getPct(2022)) * 10) / 10

  // CP4 — percentuais da distribuição de cobertura (calculados dinamicamente)
  const totalDistCob = peData.distCob.n.reduce((s: number, v: number) => s + v, 0)
  const cp4Pct0 = totalDistCob > 0 ? (peData.distCob.n[0] / totalDistCob * 100).toFixed(1) : '0'
  const cp4Pct5 = totalDistCob > 0 ? (peData.distCob.n[5] / totalDistCob * 100).toFixed(1) : '0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FilterPanel />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }}>
          <div className="kpi-card">
            <div className="kpi-label">
              Concordância Geral
              <StatusBadge live={isLive} />
            </div>
            <div className="kpi-value" style={{ color: 'var(--aut)' }}>{pctGeral}%</div>
            <div className="kpi-sub">PRODES-Cerrado INPE</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Alertas Validados</div>
            <div className="kpi-value">{fmtNum(totalValidados)}</div>
            <div className="kpi-sub">Cerrado 2022–2025</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Irr. Confirmado PRODES</div>
            <div className="kpi-value" style={{ color: 'var(--irr)', fontSize: 18 }}>{fmtHa(peData.haIrrConfirmado)}</div>
            {/* pctIrrConfirmado: numerador=Cerrado concordante | denominador=TOTAL irr (Cerrado+Caatinga) */}
            <div className="kpi-sub">{peData.pctIrrConfirmado}% do total irregular PI</div>
            {peData.pctIrrCerradoDisponivel != null && (
              <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4, fontSize: 9 }}>
                {peData.pctIrrCerradoDisponivel}% do Cerrado validável
              </span>
            )}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Tendência</div>
            <div className="kpi-value" style={{ color: tendencia >= 0 ? 'var(--aut)' : 'var(--irr)' }}>
              {tendencia >= 0 ? '+' : ''}{tendencia}pp
            </div>
            <div className="kpi-sub">ciclo 2022 → 2025</div>
            <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
              {getPct(2022)}% → {getPct(2025)}%
            </span>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Ciclos validados</div>
            <div className="kpi-value">4</div>
            <div className="kpi-sub">2022–2025 · {fmtNum(semProdes)} sem PRODES</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Caatinga</div>
            <div className="kpi-value" style={{ color: 'var(--t2)', fontSize: 18 }}>{fmtNum(6634)}</div>
            <div className="kpi-sub">alertas sem PRODES equiv.</div>
            <span className="kpi-badge" style={{ background: 'rgba(66,165,245,.15)', color: '#42A5F5', marginTop: 4 }}>
              NAO_DISPONIVEL
            </span>
          </div>
        </div>

        {/* ── CP1 + CP2 ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
          {/* CP1 — Tendência concordância + cobertura média */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              CP1 — Tendência de concordância por ciclo PRODES (%) + cobertura média
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={cp1Data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  domain={[0, 100]} unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT} formatter={(v: unknown, name: unknown) => [`${v as number}%`, name as string]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Concordância" fill={CHART_COLORS.aut} fillOpacity={0.75} radius={[3,3,0,0]} barSize={28} />
                <Line yAxisId="right" type="monotone" dataKey="Cob. Média" stroke="var(--mat)" strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 4, fill: 'var(--mat)', stroke: 'var(--bg1)', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* CP2 — Concordantes × Discordantes */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              CP2 — Concordantes × Discordantes por ciclo (alertas)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cp2Data} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Concordantes" fill={CHART_COLORS.aut} fillOpacity={0.8} stackId="a" />
                <Bar dataKey="Discordantes" fill={CHART_COLORS.irr} fillOpacity={0.8} stackId="a" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── CP3 — Área irregular confirmada por ano ───────────────────── */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            CP3 — Área irregular Cerrado confirmada por PRODES · por ano de detecção (ha)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cp3Data} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Confirmado PRODES"    fill={CHART_COLORS.irr}      fillOpacity={0.85} stackId="a" />
              <Bar dataKey="Discordante"          fill={CHART_COLORS.irr}      fillOpacity={0.35} stackId="a" />
              <Bar dataKey="Caatinga (s/ PRODES)" fill={CHART_COLORS.caatinga} fillOpacity={0.5}  stackId="a" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── CP4 + CP5 ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* CP4 — Distribuição de cobertura PRODES */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              CP4 — Distribuição de cobertura PRODES por faixa (alertas Cerrado)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cp4Data} layout="vertical" barSize={16} margin={{ left: 8, right: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="faixa" tick={{ fontSize: 10, fill: 'var(--t2)' }}
                  axisLine={false} tickLine={false} width={52} />
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Alertas" fill={CHART_COLORS.aut} fillOpacity={0.75} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>
              Padrão bimodal: {cp4Pct0}% com 0% e {cp4Pct5}% com 90–100% de cobertura
            </div>
          </div>

          {/* CP5 — Concordância por vetor de pressão */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              CP5 — Concordância por vetor de pressão (%) · semafórico
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {cp5Data.map(d => (
                <div key={d.vp}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'var(--t2)' }}>{d.vp}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtNum(d.n)} alertas</span>
                      <span style={{ fontWeight: 700, color: semaforico(d.pct), minWidth: 36, textAlign: 'right' }}>
                        {d.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${d.pct}%`, background: semaforico(d.pct) }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 12, lineHeight: 1.5, borderTop: '1px solid var(--sep)', paddingTop: 8 }}>
              Abertura de Estradas (35,9%) — MapBiomas detecta infraestrutura viária antes da consolidação PRODES
            </div>
          </div>
        </div>

        {/* ── Top 10 municípios ─────────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sep)', fontWeight: 600, fontSize: 12, color: 'var(--t2)' }}>
            Top 10 Municípios — Maior área irregular confirmada PRODES (Cerrado, acumulado)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Município</th>
                  <th style={{ textAlign:'right' }}>Confirmado (ha)</th>
                  <th style={{ textAlign:'right' }}>Total Irr. (ha)</th>
                  <th style={{ textAlign:'right' }}>Concordância</th>
                  <th style={{ minWidth: 80 }}>Dist.</th>
                </tr>
              </thead>
              <tbody>
                {peData.topMun.map((d, i) => (
                  <tr key={d.mun}>
                    <td style={{ color: i < 3 ? 'var(--mat)' : 'var(--t3)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ fontWeight: i < 3 ? 600 : 400 }}>{d.mun}</td>
                    <td style={{ textAlign:'right', color:'var(--irr)', fontVariantNumeric:'tabular-nums' }}>{fmtHa(d.conc)}</td>
                    <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtHa(d.total)}</td>
                    <td style={{ textAlign:'right', fontWeight: 600, color: semaforico(d.pct) }}>{d.pct}%</td>
                    <td>
                      <div className="bar-track" style={{ height: 5 }}>
                        <div className="bar-fill" style={{ width: `${d.pct}%`, background: semaforico(d.pct) }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--t3)', lineHeight: 1.5, borderTop: '1px solid var(--sep)' }}>
            Concordância = % da área irregular do município coberta por desmatamento PRODES-Cerrado no mesmo ciclo anual.
            Alertas Caatinga e ciclo 2026 não incluídos.
          </div>
        </div>

        {/* Nota metodológica */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.18)',
          borderRadius: 8, padding: '10px 14px',
        }}>
          <span style={{ color: 'var(--mat)', fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--mat)' }}>Nota metodológica:</strong>{' '}
            Validação por interseção espacial real (gpd.overlay + STRtree) entre alertas MapBiomas e polígonos PRODES-Cerrado INPE
            do mesmo ciclo anual (ago/Y → jul/Y+1). Limiar de concordância: sobreposição PRODES {'>'} 0%
            (configurável via <code>CONCORDANCIA_PRODES_MIN_PCT</code> em pipeline/constants.py).
            Caatinga sem PRODES equivalente — declarada formalmente como limitação de dado.
            O percentual "do total irregular PI" usa denominador conservador (Cerrado + Caatinga);
            "do Cerrado validável" exclui Caatinga e ciclos sem PRODES disponível.{' '}
            <strong style={{ color: 'var(--irr)' }}>Esta análise é estimativa exploratória e não substitui autuação ambiental.</strong>
          </div>
        </div>

      </div>
    </div>
  )
}
