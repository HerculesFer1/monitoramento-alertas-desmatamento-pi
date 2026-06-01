/**
 * VisaoGeralView.tsx — queimadas_bdq
 * KPIs de queimadas 2025 + choropleth + top 10 municípios críticos.
 */
import { useState } from 'react'
import { useAppStore }                  from '../../../core/store/useAppStore'
import { useQueimadasVisaoGeral }       from '../hooks/useQueimadasVisaoGeral'
import { useQueimadasMunicipios }       from '../hooks/useQueimadasMunicipios'
import { useQueimadasRanking }          from '../hooks/useQueimadasRanking'
import { QueimadasMap }                 from '../components/QueimadasMap'
import { PrioridadeBadge }             from '../components/PrioridadeBadge'
import { MESES_LABELS }                from '../types'
import type { QueimadasMunicipio }      from '../types'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function VisaoGeralView() {
  const anoFiltro    = useAppStore(s => s.anoFiltro)
  const ano          = anoFiltro === 'all' ? 2025 : anoFiltro
  const [, setSelected] = useState<QueimadasMunicipio | null>(null)

  const { data: vg,   isLoading: loadKpis } = useQueimadasVisaoGeral(ano)
  const { data: muns, isLoading: loadMap  } = useQueimadasMunicipios(ano)
  const { data: rank, isLoading: loadRank } = useQueimadasRanking(ano, 10)

  const kpis = vg?.kpis

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <KpiCard
          label="Área queimada total"
          value={loadKpis ? '…' : `${fmt(kpis?.area_queimada_total_ha)} ha`}
          accent="#FC8D59"
          note="AQ1km V6 Col.2 — estimativa"
        />
        <KpiCard
          label="Cicatrizes detectadas"
          value={loadKpis ? '…' : fmt(kpis?.n_cicatrizes_total)}
          accent="#FDBB84"
        />
        <KpiCard
          label="Municípios afetados"
          value={loadKpis ? '…' : `${fmt(kpis?.municipios_afetados)} / 224`}
          accent="#F5F5F5"
        />
        <KpiCard
          label="Em classes prioritárias"
          value={loadKpis ? '…' : `${fmt(kpis?.area_prioritaria_ha)} ha`}
          accent="#E34A33"
          note="Classes 4 + 5"
        />
        <KpiCard
          label="% em alta prioridade"
          value={loadKpis ? '…' : `${fmt(kpis?.pct_em_prioritarias, 1)}%`}
          accent={kpis && kpis.pct_em_prioritarias > 50 ? '#B30000' : '#FC8D59'}
          alert={kpis != null && kpis.pct_em_prioritarias > 50}
        />
      </div>

      {/* Mapa + ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, flex: 1, minHeight: 0 }}>

        {/* Mapa */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', minHeight: 340 }}>
          {loadMap
            ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--t3)' }}>Carregando mapa…</div>
            : <QueimadasMap
                municipios={muns ?? []}
                onSelectMunicipio={setSelected}
              />
          }
        </div>

        {/* Top 10 ranking */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>
            Top 10 — maior área queimada
          </div>
          {loadRank
            ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando…</div>
            : (rank ?? []).map((r) => (
              <div key={r.municipio_cod} style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '7px 9px',
                background: 'rgba(255,255,255,.03)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t1)' }}>
                    {r.rank}. {r.municipio_nome}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#FC8D59' }}>
                    {fmt(r.area_queimada_total_ha)} ha
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {r.classe_max_queimada && <PrioridadeBadge classe={r.classe_max_queimada} size="sm" />}
                  {r.mes_pico && (
                    <span style={{ fontSize: 9, color: 'var(--t3)' }}>
                      Pico: {MESES_LABELS[r.mes_pico] ?? r.mes_pico}
                    </span>
                  )}
                  {r.pct_area_prioritaria != null && (
                    <span style={{ fontSize: 9, color: r.pct_area_prioritaria > 50 ? '#E34A33' : 'var(--t3)' }}>
                      {fmt(r.pct_area_prioritaria, 0)}% prio.
                    </span>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, accent, note, alert }: {
  label: string; value: string; accent: string; note?: string; alert?: boolean
}) {
  return (
    <div className="card" style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      border: alert ? `1px solid ${accent}44` : undefined,
    }}>
      <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      {note && <div style={{ fontSize: 9, color: 'var(--t3)' }}>{note}</div>}
    </div>
  )
}
