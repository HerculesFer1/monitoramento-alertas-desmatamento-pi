/**
 * SerieAnualView.tsx — queimadas_bdq
 * Série anual 2022–2025 — tendência de área queimada, cicatrizes e
 * % em classes prioritárias.
 * Responde: "Como a pressão de fogo evoluiu nos últimos 4 anos?"
 */
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, Bar, Line,
} from 'recharts'
import { useQueimadasSerieAnual } from '../hooks/useQueimadasSerieAnual'
import type { QueimadasSerieAnualItem } from '../types'

const ANO_INI = 2022
const ANO_FIM = 2025

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function SerieAnualView() {
  const { data: serie, isLoading } = useQueimadasSerieAnual(ANO_INI, ANO_FIM)

  // KPIs derivados
  const totais = serie?.reduce(
    (acc, s) => ({
      area:    acc.area    + s.area_ha,
      cic:     acc.cic     + s.n_cicatrizes,
      prio:    acc.prio    + s.area_prioritaria_ha,
    }),
    { area: 0, cic: 0, prio: 0 },
  )
  const mediaArea = totais && serie?.length ? totais.area / serie.length : 0
  const pico  = serie?.length ? serie.reduce((a, b) => a.area_ha > b.area_ha ? a : b) : null
  const baixo = serie?.length ? serie.reduce((a, b) => a.area_ha < b.area_ha ? a : b) : null
  const tendenciaPct = serie && serie.length >= 2
    ? ((serie[serie.length - 1].area_ha - serie[0].area_ha) / serie[0].area_ha) * 100
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', padding: 14, overflow: 'auto' }}>

      {/* KPIs */}
      <div className="grid-5" style={{ flexShrink: 0 }}>
        <KpiCard
          label="Período analisado"
          value={`${ANO_INI}–${ANO_FIM}`}
          sub={isLoading ? '…' : `${serie?.length ?? 0} anos`}
          accent="#F5F5F5"
        />
        <KpiCard
          label="Área queimada acumulada"
          value={isLoading ? '…' : `${fmt(totais?.area)} ha`}
          accent="#FC8D59"
        />
        <KpiCard
          label="Média anual"
          value={isLoading ? '…' : `${fmt(mediaArea)} ha/ano`}
          accent="#FDBB84"
        />
        <KpiCard
          label="Pico anual"
          value={pico ? `${pico.ano}` : '—'}
          sub={pico ? `${fmt(pico.area_ha)} ha` : ''}
          accent="#B30000"
        />
        <KpiCard
          label="Tendência (1º → último ano)"
          value={isLoading ? '…' : `${tendenciaPct >= 0 ? '+' : ''}${fmt(tendenciaPct, 1)}%`}
          sub={tendenciaPct > 0 ? 'crescimento' : 'redução'}
          accent={tendenciaPct > 0 ? '#E34A33' : '#10B981'}
          alert={tendenciaPct > 50}
        />
      </div>

      {/* Gráfico combinado */}
      <div className="card" style={{ minHeight: 360 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 12 }}>
          Área queimada anual + % em classes prioritárias (4 + 5)
        </div>
        {isLoading
          ? <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--t3)' }}>
              Carregando…
            </div>
          : <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={serie ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="ano" stroke="var(--t3)" fontSize={10} />
                <YAxis yAxisId="left" stroke="var(--t3)" fontSize={10}
                  tickFormatter={(v) => fmt(v as number)} label={{ value: 'ha', angle: -90, position: 'insideLeft', fill: 'var(--t3)', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--t3)" fontSize={10}
                  domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                  label={{ value: '% prio.', angle: 90, position: 'insideRight', fill: 'var(--t3)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v, name) => {
                    const label = String(name ?? '')
                    if (typeof v !== 'number') return ['—', label]
                    if (label === 'pct_prioritaria') return [`${fmt(v, 1)}%`, '% em prioritárias']
                    if (label === 'area_ha')        return [`${fmt(v)} ha`,   'Área queimada']
                    return [fmt(v), label]
                  }}
                  labelStyle={{ color: 'var(--t1)', fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="left"  dataKey="area_ha"        fill="#FC8D59" name="Área queimada (ha)" />
                <Line yAxisId="right" dataKey="pct_prioritaria" stroke="#B30000" strokeWidth={2}
                  dot={{ r: 4, fill: '#B30000' }} name="% em prioritárias" />
              </ComposedChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Tabela */}
      {!isLoading && serie && serie.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>
            Detalhamento por ano
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {['Ano', 'Área (ha)', 'Cicatrizes', 'Municípios', 'Em prio. (ha)', '% prio.'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t3)', fontSize: 9, fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serie.map(linha)}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 9, color: 'var(--t3)' }}>
            ▲ destaca o ano de pico ({pico?.ano}) · ▼ destaca o de menor área ({baixo?.ano}). %prio. = área queimada nas classes 4 + 5 / área queimada total.
          </div>
        </div>
      )}
    </div>
  )

  function linha(s: QueimadasSerieAnualItem) {
    const isPico  = s.ano === pico?.ano
    const isBaixo = s.ano === baixo?.ano
    return (
      <tr key={s.ano} style={{
        borderBottom: '1px solid rgba(255,255,255,.04)',
        background: isPico ? 'rgba(179,0,0,.08)' : undefined,
      }}>
        <td style={{ padding: '6px 8px', fontWeight: 600, color: isPico ? '#B30000' : 'var(--t1)' }}>
          {s.ano}
          {isPico  && <span style={{ fontSize: 9, marginLeft: 4, color: '#B30000' }}>▲</span>}
          {isBaixo && <span style={{ fontSize: 9, marginLeft: 4, color: '#10B981' }}>▼</span>}
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#FC8D59', fontWeight: 600 }}>{fmt(s.area_ha)}</td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t2)' }}>{fmt(s.n_cicatrizes)}</td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t2)' }}>{fmt(s.municipios_afetados)} / 224</td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#E34A33' }}>{fmt(s.area_prioritaria_ha)}</td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t1)', fontWeight: 600 }}>{fmt(s.pct_prioritaria, 1)}%</td>
      </tr>
    )
  }
}

function KpiCard({ label, value, sub, accent, alert }: {
  label: string; value: string; sub?: string; accent: string; alert?: boolean
}) {
  return (
    <div className="kpi-card" style={{
      borderColor: alert ? `${accent}66` : undefined,
      boxShadow: alert ? `0 0 0 1px ${accent}33 inset` : undefined,
    }}>
      <div className="kpi-label" style={{ gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 10, letterSpacing: '.04em' }}>{label}</span>
      </div>
      <div className="kpi-value" style={{ color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{sub}</div>}
    </div>
  )
}
