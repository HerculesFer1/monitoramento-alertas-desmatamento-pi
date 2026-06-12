/**
 * ProdesView.tsx — MATOPIBA › PRODES Cerrado
 * Recorta o ranking PRODES pelos 33 municípios MATOPIBA-PI.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useAppStore }  from '../../../core/store/useAppStore'
import { useMatopibaProdes } from '../hooks/useMatopibaProdes'
import { fmtHa } from '../../../core/lib/constants'
import { MAT_COLOR, MAT_COLOR_2 } from '../types'

const TT = {
  background: '#222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function ProdesView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano       = anoFiltro === 'all' ? 2025 : anoFiltro
  const { loading, isError, kpis, topMunicipios } = useMatopibaProdes(ano)

  const live = !loading && !isError && !!kpis

  // Top 10 ordenados por irregular para o gráfico de barras
  const top10 = [...topMunicipios]
    .sort((a, b) => (b.ha_irregular ?? 0) - (a.ha_irregular ?? 0))
    .slice(0, 10)
    .map(r => ({
      municipio: r.municipio,
      Irregular: Math.round(r.ha_irregular ?? 0),
      Total:     Math.round((r.ha_total ?? 0) - (r.ha_irregular ?? 0)),
    }))

  return (
    <div className="view-content" style={{ padding: 16 }}>

      {/* KPIs */}
      <div className="bento">
        <div className="kpi-card b-3">
          <div className="kpi-label">
            Irr. PRODES MATOPIBA <StatusBadge live={live} />
          </div>
          <div className="kpi-value" style={{ color: 'var(--irr)', fontSize: 28 }}>
            {live ? fmtHa(kpis!.ha_irregular_total) : '—'}
          </div>
          <div className="kpi-sub">PRODES Cerrado · {ano}</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">% do Irr. do Estado</div>
          <div className="kpi-value" style={{ color: MAT_COLOR }}>
            {live ? `${kpis!.pct_do_estado_irr.toFixed(1)}%` : '—'}
          </div>
          <div className="kpi-sub">participação MATOPIBA-PI</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Municípios</div>
          <div className="kpi-value" style={{ color: MAT_COLOR_2 }}>
            {live ? kpis!.n_municipios : '—'}
          </div>
          <div className="kpi-sub">com PRODES · {ano}</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Reincidentes</div>
          <div className="kpi-value" style={{ color: 'var(--irr)' }}>
            {live ? kpis!.n_reincidentes : '—'}
          </div>
          <div className="kpi-sub">≥ 3 anos com IRR</div>
        </div>
      </div>

      {/* Top 10 ranking */}
      <div className="card b-3" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
          Top 10 Municípios MATOPIBA — Área Irregular PRODES
        </div>
        {top10.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 12, padding: 24, textAlign: 'center' }}>
            {loading ? 'Carregando…' : isError ? 'Falha ao carregar PRODES.' : 'Sem dados PRODES para o recorte neste ano.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top10} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="municipio" width={140} tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Irregular" fill="#EF4444" stackId="a" />
              <Bar dataKey="Total"     fill="#374151" fillOpacity={0.6} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ color: 'var(--t3)', fontSize: 10, marginTop: 12, textAlign: 'center' }}>
        Filtro client-side a partir de get_prodes_top_municipios (campo matopiba=true).
      </div>
    </div>
  )
}
