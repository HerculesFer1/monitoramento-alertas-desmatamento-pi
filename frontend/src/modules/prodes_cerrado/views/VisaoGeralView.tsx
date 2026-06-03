/**
 * VisaoGeralView.tsx — PRODES Cerrado
 * KPIs anuais + breakdown por ano (cards 2022-2025) + graficos
 * (espelhamento do modelo MapBiomas Executiva).
 */
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '../../../core/store/useAppStore'
import { useProdesVisaoGeral, useProdesTemporal } from '../hooks/useProdesData'
import { fmtHa, fmtNum, CHART_COLORS } from '../../../core/lib/constants'

const TT = {
  background: '#222222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

const ANOS = [2022, 2023, 2024, 2025] as const

export function VisaoGeralView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano = anoFiltro === 'all' ? 2025 : anoFiltro
  const { data: kpis, isLoading: loadKpis } = useProdesVisaoGeral(ano)
  const { data: temporal }                  = useProdesTemporal()

  return (
    <div className="view-with-map">
      <div className="view-content">

        {/* Row 1: KPIs principais */}
        <div className="bento">
          <div className="kpi-card b-3" style={{ borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.04)' }}>
            <div className="kpi-label">
              IPI PRODES {ano}
              <span style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(16,185,129,.18)', color: 'var(--aut)', borderRadius: 4, marginLeft: 4 }}>AO VIVO</span>
            </div>
            <div className="kpi-value" style={{
              fontSize: 34,
              color: (kpis?.pct_irregular_estado ?? 0) >= 70 ? 'var(--irr)'
                   : (kpis?.pct_irregular_estado ?? 0) >= 50 ? 'var(--reg)'
                   : 'var(--aut)',
            }}>
              {loadKpis ? '…' : `${kpis?.pct_irregular_estado ?? 0}%`}
            </div>
            <span className="kpi-badge" style={{ background: 'var(--irr-bg)', color: 'var(--irr)', marginTop: 4 }}>
              {fmtHa(kpis?.ha_irregular_total ?? 0)} irregulares
            </span>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Área Total PRODES</div>
            <div className="kpi-value">{loadKpis ? '…' : fmtHa(kpis?.ha_total ?? 0)}</div>
            <div className="kpi-sub">{fmtNum(kpis?.n_poligonos ?? 0)} polígonos · {fmtNum(kpis?.n_municipios_total ?? 0)} municípios</div>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Autorizado (ASV)</div>
            <div className="kpi-value" style={{ color: 'var(--aut)' }}>{loadKpis ? '…' : fmtHa(kpis?.ha_autorizado_total ?? 0)}</div>
            <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
              {kpis && kpis.ha_total > 0 ? Math.round((kpis.ha_autorizado_total / kpis.ha_total) * 100) : 0}% do total
            </span>
          </div>

          <div className="kpi-card b-3">
            <div className="kpi-label">Regularizado (DERADSA)</div>
            <div className="kpi-value" style={{ color: 'var(--reg)' }}>{loadKpis ? '…' : fmtHa(kpis?.ha_regularizado_total ?? 0)}</div>
            <div className="kpi-sub" style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>Somente 2024–2025</div>
          </div>
        </div>

        {/* Row 2: Year breakdown */}
        <div className="grid-4">
          {ANOS.map(a => {
            const r = temporal?.find(t => t.ano === a)
            const ativo = anoFiltro === 'all' || anoFiltro === a
            return (
              <div key={a} className="year-card" style={{ opacity: ativo ? 1 : 0.4, transition: 'opacity .2s' }}>
                <div className="year-tag">{a}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Row label="Autorizado"       ha={r?.ha_autorizado ?? 0}              tot={r?.ha_total ?? 0} color="var(--aut)" />
                  <Row label="└ Parcialmente"   ha={r?.ha_autorizado_parcialmente ?? 0} tot={r?.ha_total ?? 0} color="var(--aut)" sub />
                  <Row label="Regularizado"     ha={r?.ha_regularizado ?? 0}            tot={r?.ha_total ?? 0} color="var(--reg)" />
                  <Row label="Irregular"        ha={r?.ha_irregular ?? 0}               tot={r?.ha_total ?? 0} color="var(--irr)" />
                </div>
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--sep)', fontSize: 10, color: 'var(--t3)' }}>
                  Total: {fmtHa(r?.ha_total ?? 0)} · {fmtNum(r?.n_poligonos ?? 0)} polígonos
                </div>
              </div>
            )
          })}
        </div>

        {/* Row 3: Barras empilhadas + IPI linha — espelhamento MapBiomas */}
        <div className="bento">
          <div className="card b-3">
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
              Área por classificação (ha) — PRODES Cerrado 2022–2025
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(temporal ?? []).map(r => ({
                ano: r.ano,
                Irregular:    Number(r.ha_irregular),
                'Aut. Pleno': Number(r.ha_autorizado),
                'Aut. Parc.': Number(r.ha_autorizado_parcialmente),
                Regularizado: Number(r.ha_regularizado),
              }))} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={TT} formatter={(v) => fmtHa(Number(v))} />
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
              IPI — Índice de Pressão Irregular (%) PRODES
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={(temporal ?? []).map(r => ({ ano: r.ano, IPI: Number(r.pct_irregular) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false}
                  domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(1)}%`, 'IPI']} />
                <Line type="monotone" dataKey="IPI" stroke="var(--irr)" strokeWidth={2.5}
                  dot={{ r: 5, fill: 'var(--irr)', stroke: 'var(--bg1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 4: Tabela temporal */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Série Anual PRODES Cerrado
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ano</th><th>Polígonos</th><th>Municípios</th>
                <th>Aut. Pleno (ha)</th><th>Aut. Parcial (ha)</th>
                <th>Regularizado (ha)</th><th>Irregular (ha)</th>
                <th>Total (ha)</th><th>IPI (%)</th>
              </tr>
            </thead>
            <tbody>
              {(temporal ?? []).map(r => (
                <tr key={r.ano}>
                  <td><strong>{r.ano}</strong></td>
                  <td>{fmtNum(r.n_poligonos)}</td>
                  <td>{fmtNum(r.n_municipios)}</td>
                  <td style={{ color: 'var(--aut)' }}>{fmtHa(r.ha_autorizado)}</td>
                  <td style={{ color: 'var(--aut)', opacity: 0.75 }}>{fmtHa(r.ha_autorizado_parcialmente)}</td>
                  <td style={{ color: 'var(--reg)' }}>{fmtHa(r.ha_regularizado)}</td>
                  <td style={{ color: 'var(--irr)', fontWeight: 600 }}>{fmtHa(r.ha_irregular)}</td>
                  <td>{fmtHa(r.ha_total)}</td>
                  <td><strong>{Number(r.pct_irregular).toFixed(1)}%</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: '6px 0' }}>
          ⚠ PRODES cobre apenas o bioma Cerrado. Para Caatinga, ver módulo MapBiomas (validação cruzada).
        </div>
      </div>
    </div>
  )
}

function Row({ label, ha, tot, color, sub }: { label: string; ha: number; tot: number; color: string; sub?: boolean }) {
  const pct = tot > 0 ? Math.round((ha / tot) * 100) : 0
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: sub ? 10 : 11,
      opacity: sub ? 0.75 : 1,
      paddingLeft: sub ? 8 : 0,
    }}>
      <span style={{ color: 'var(--t2)' }}>{label}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="font-mono" style={{ color, fontWeight: sub ? 500 : 600 }}>{fmtHa(ha)}</span>
        <span style={{ fontSize: 9, color: 'var(--t3)', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
      </span>
    </div>
  )
}
