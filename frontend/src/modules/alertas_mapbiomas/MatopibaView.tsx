import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useResumoMatopiba, useMatopibaMunicipios, useResumoAnual } from '../../core/lib/hooks'
import { isSupabaseConfigured }                      from '../../core/lib/supabase'
import { ipiYr, matopibaYr, YEARS, fmtHa, fmtNum, CHART_COLORS } from '../../core/lib/constants'

const TT = {
  background: 'var(--bg3)', border: '1px solid var(--sep)',
  borderRadius: 8, fontSize: 12, color: 'var(--t1)',
}

const MAT_COLOR = '#F59E0B'   // âmbar — MATOPIBA
const MAT_BG    = 'rgba(245,158,11,.1)'

// Ícone de tendência: positivo = piora (IPI sobe), negativo = melhora
function DeltaBadge({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>
  const color = v > 0 ? 'var(--irr)' : 'var(--aut)'
  const sign  = v > 0 ? '▲' : '▼'
  return (
    <span style={{ color, fontSize: 11, fontWeight: 700 }}>
      {sign} {Math.abs(v).toFixed(1)}pp
    </span>
  )
}

// Estado exibido quando Supabase não está configurado
function OfflineTeaser() {
  const chartData = YEARS.map(a => ({
    ano: a,
    'IPI PI geral': ipiYr[a],
    'Irr. MATOPIBA (ha)': matopibaYr[a]?.mat ?? 0,
  }))

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{
        padding: '14px 18px', borderRadius: 10,
        background: MAT_BG, border: `1px solid rgba(245,158,11,.25)`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: MAT_COLOR }}>
          Módulo MATOPIBA-PI
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
          Este módulo requer conexão com o <strong>Supabase</strong> para exibir o ranking municipal completo,
          IPI regional e métricas YoY. Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env</code>.
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          Base legal: Decreto Federal nº 8.447/2015 · 26 municípios piauienses
        </div>
      </div>

      {/* Prévia com dados estáticos do pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Área Irregular — MATOPIBA-PI (ha) · dados do pipeline
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [fmtHa(v as number), '']} />
              <Bar dataKey="Irr. MATOPIBA (ha)" fill={MAT_COLOR} fillOpacity={.8} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            IPI PI Geral 2022–2025 (prévia)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} domain={[0,100]} unit="%" />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v}%`, '']} />
              <Line type="monotone" dataKey="IPI PI geral" stroke="var(--irr)" strokeWidth={2.5}
                dot={{ r: 5, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export function MatopibaView() {
  const [anoTabela, setAnoTabela] = useState<number | undefined>(undefined)

  const { data: resumo,    isLoading: resumoLoading    } = useResumoMatopiba()
  const { data: munic,     isLoading: municLoading     } = useMatopibaMunicipios(anoTabela)
  const { data: resumoPI                               } = useResumoAnual()

  if (!isSupabaseConfigured) return <OfflineTeaser />

  // ── Processamento dos dados ────────────────────────────────────────────

  // IPI chart: MATOPIBA vs PI geral por ano
  const ipiChartData = useMemo(() => {
    const piByAno = Object.fromEntries((resumoPI ?? []).map(r => [r.ano, r.ipi]))
    return YEARS.map(a => ({
      ano: a,
      'IPI MATOPIBA': resumo?.find(r => r.ano === a)?.ipi ?? null,
      'IPI PI geral': piByAno[a] ?? ipiYr[a] ?? null,
    }))
  }, [resumo, resumoPI])

  // Tendência: barras aut/irr por ano
  const areaChartData = useMemo(() =>
    YEARS.map(a => {
      const r = resumo?.find(x => x.ano === a)
      return {
        ano: a,
        Irregular:  r?.ha_irregular      ?? (matopibaYr[a]?.mat ?? 0),
        Autorizado: r?.ha_autorizado_total ?? 0,
      }
    }), [resumo],
  )

  // KPIs do último ano com dados
  const ultimoAno  = resumo?.at(-1)
  const primeiroAno = resumo?.at(0)
  const totalIrrAcum = resumo?.reduce((s, r) => s + r.ha_irregular, 0) ?? 0
  const totalHaAcum  = resumo?.reduce((s, r) => s + r.ha_total,    0) ?? 0
  const ipiAcum = totalHaAcum > 0 ? Math.round(totalIrrAcum / totalHaAcum * 1000) / 10 : 0
  const tendencia = primeiroAno && ultimoAno && ultimoAno.ano !== primeiroAno.ano
    ? ultimoAno.ipi - primeiroAno.ipi : null

  // Municípios MATOPIBA com dados do ano selecionado (ou acumulado)
  const top10Irr = useMemo(() => {
    if (!munic?.length) return []
    const byMun: Record<string, { ha: number; mat: boolean }> = {}
    for (const r of munic) {
      if (!byMun[r.municipio]) byMun[r.municipio] = { ha: 0, mat: true }
      byMun[r.municipio].ha += r.ha_irregular
    }
    return Object.entries(byMun)
      .sort(([, a], [, b]) => b.ha - a.ha)
      .slice(0, 10)
      .map(([m, d]) => ({
        municipio: m.length > 20 ? m.slice(0, 19) + '…' : m,
        ha: d.ha,
      }))
  }, [munic])

  // Tabela — uma linha por município (resumo por ano selecionado ou top por ha_irr acum)
  const tabelaRows = useMemo(() => {
    if (!munic?.length) return []
    if (anoTabela) {
      return [...munic].sort((a, b) => a.rank_irr_matopiba - b.rank_irr_matopiba)
    }
    // Acumulado: agrupar por municipio
    const byMun: Record<string, { haIrr: number; haTotal: number; reincidente: boolean }> = {}
    for (const r of munic) {
      if (!byMun[r.municipio]) byMun[r.municipio] = { haIrr: 0, haTotal: 0, reincidente: false }
      byMun[r.municipio].haIrr  += r.ha_irregular
      byMun[r.municipio].haTotal += r.ha_total
      byMun[r.municipio].reincidente = byMun[r.municipio].reincidente || r.reincidente
    }
    return Object.entries(byMun)
      .sort(([, a], [, b]) => b.haIrr - a.haIrr)
      .map(([municipio, d], i) => ({
        municipio,
        rank_irr_matopiba: i + 1,
        ha_irregular: d.haIrr,
        ha_total: d.haTotal,
        pct_irregular: d.haTotal > 0 ? Math.round(d.haIrr / d.haTotal * 1000) / 10 : 0,
        reincidente: d.reincidente,
        pct_do_matopiba_irr: null as number | null,
        delta_ipi_yoy: null as number | null,
        ano: null,
      }))
  }, [munic, anoTabela])

  const isLoading = resumoLoading || municLoading

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Cabeçalho regional ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderRadius: 10,
        background: MAT_BG, border: `1px solid rgba(245,158,11,.2)`,
      }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: MAT_COLOR }}>MATOPIBA-PI</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 10 }}>
            26 municípios · Decreto Federal nº 8.447/2015 · Cerrado piauiense
          </span>
        </div>
        {isLoading && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Carregando…</span>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid-4">
        <div className="kpi-card">
          <div className="kpi-label">IPI MATOPIBA (acum.)</div>
          <div className="kpi-value" style={{ color: ipiAcum > 50 ? 'var(--irr)' : 'var(--mat)' }}>
            {ultimoAno ? `${ipiAcum}%` : '—'}
          </div>
          <div className="kpi-sub">índice de pressão irregular</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Área Irregular (acum.)</div>
          <div className="kpi-value" style={{ color: 'var(--irr)' }}>
            {fmtHa(totalIrrAcum)}
          </div>
          <div className="kpi-sub">2022–2025 · região MATOPIBA</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Municípios Reincidentes</div>
          <div className="kpi-value" style={{ color: MAT_COLOR }}>
            {ultimoAno?.n_reincidentes ?? '—'}
          </div>
          <div className="kpi-sub">de {ultimoAno?.n_municipios ?? 26} com alertas no último ano</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Tendência IPI</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>
            {tendencia !== null
              ? <DeltaBadge v={tendencia} />
              : '—'
            }
          </div>
          <div className="kpi-sub">
            {primeiroAno && ultimoAno && primeiroAno.ano !== ultimoAno.ano
              ? `${primeiroAno.ano}→${ultimoAno.ano} (${primeiroAno.ipi}% → ${ultimoAno.ipi}%)`
              : 'variação período'
            }
          </div>
        </div>
      </div>

      {/* ── Gráficos linha 1: IPI + área ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>

        {/* IPI MATOPIBA vs PI geral */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            IPI por ano — MATOPIBA vs PI Geral (%)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ipiChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v}%`, '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={50} stroke="var(--sep)" strokeDasharray="4 4" label={{ value: '50%', fill: 'var(--t3)', fontSize: 10 }} />
              <Line type="monotone" dataKey="IPI MATOPIBA" stroke={MAT_COLOR}   strokeWidth={2.5}
                dot={{ r: 5, fill: MAT_COLOR,      stroke: 'var(--bg1)', strokeWidth: 2 }}
                connectNulls />
              <Line type="monotone" dataKey="IPI PI geral"  stroke="var(--irr)" strokeWidth={1.5} strokeDasharray="5 3"
                dot={{ r: 3, fill: 'var(--irr)',    stroke: 'var(--bg1)', strokeWidth: 1 }}
                connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Área irregular vs autorizado por ano */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Área por classificação — MATOPIBA-PI (ha)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={areaChartData} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [fmtHa(v as number), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Irregular"  fill={CHART_COLORS.irr} fillOpacity={0.8} stackId="a" />
              <Bar dataKey="Autorizado" fill={CHART_COLORS.aut} fillOpacity={0.8} stackId="a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Gráficos linha 2: top10 + tabela ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>

        {/* Barras horizontais top10 irregular */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Top 10 — Área Irregular MATOPIBA (ha)
            {anoTabela ? ` · ${anoTabela}` : ' · acum.'}
          </div>
          {top10Irr.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10Irr} layout="vertical" barSize={14} margin={{ left: 6, right: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="municipio" tick={{ fontSize: 10, fill: 'var(--t2)' }}
                  axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [fmtHa(v as number), 'Irregular']} />
                <Bar dataKey="ha" fill={MAT_COLOR} fillOpacity={.85} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>
              {isLoading ? 'Carregando…' : 'Sem dados'}
            </div>
          )}
        </div>

        {/* Tabela de ranking */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--sep)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)' }}>
              Ranking Municipal — MATOPIBA-PI
            </span>
            <select
              value={anoTabela ?? ''}
              onChange={e => setAnoTabela(e.target.value ? Number(e.target.value) : undefined)}
              style={{
                background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--sep)',
                borderRadius: 6, padding: '3px 8px', fontSize: 11, outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">Todos os anos</option>
              {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Município</th>
                  {anoTabela && <th style={{ textAlign: 'right' }}>% MATOPIBA</th>}
                  <th style={{ textAlign: 'right' }}>Irr. (ha)</th>
                  <th style={{ textAlign: 'right' }}>IPI (%)</th>
                  {anoTabela && <th style={{ textAlign: 'right' }}>ΔYoY</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tabelaRows.slice(0, 26).map((r) => {
                  const ipiVal = r.pct_irregular
                  const ipiColor = ipiVal > 70 ? 'var(--irr)' : ipiVal > 40 ? 'var(--mat)' : 'var(--aut)'
                  return (
                    <tr key={r.municipio}>
                      <td style={{ color: r.rank_irr_matopiba <= 3 ? MAT_COLOR : 'var(--t3)', fontWeight: 700 }}>
                        {r.rank_irr_matopiba}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontWeight: r.rank_irr_matopiba <= 3 ? 600 : 400 }}>{r.municipio}</span>
                          {r.reincidente && <span title="Reincidente" style={{ color: MAT_COLOR }}>⚠</span>}
                        </div>
                      </td>
                      {anoTabela && (
                        <td style={{ textAlign: 'right', color: 'var(--t2)' }}>
                          {r.pct_do_matopiba_irr != null ? `${r.pct_do_matopiba_irr}%` : '—'}
                        </td>
                      )}
                      <td style={{ textAlign: 'right', color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(r.ha_irregular)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: ipiColor }}>
                        {ipiVal.toFixed(1)}%
                      </td>
                      {anoTabela && (
                        <td style={{ textAlign: 'right' }}>
                          <DeltaBadge v={r.delta_ipi_yoy} />
                        </td>
                      )}
                      <td>
                        <div className="bar-track" style={{ height: 4, width: 48 }}>
                          <div className="bar-fill" style={{ width: `${Math.min(ipiVal, 100)}%`, background: ipiColor }} />
                        </div>
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
