/**
 * VisaoGeralView.tsx — queimadas_bdq
 * KPIs de queimadas 2025 + choropleth + top 10 municípios críticos.
 */
import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
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

// ─ Toggle flutuante "Prioridade alta" ─────────────────────────────────────────
function PriorityToggle({ active, disabled, count, onToggle }: {
  active: boolean; disabled: boolean; count: number; onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      title={active
        ? `${count} municípios em alta prioridade — clique para ver todos`
        : 'Destacar apenas municípios em alta prioridade (AHP 4-5)'}
      style={{
        position: 'absolute', top: 10, left: 10, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 7,
        fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'rgba(239, 68, 68, 0.92)' : 'var(--bg3)',
        color: active ? '#FFFFFF' : 'var(--t2)',
        border: `1px solid ${active ? '#EF4444' : 'var(--sep)'}`,
        boxShadow: active
          ? '0 2px 8px rgba(239,68,68,.35), 0 1px 0 rgba(0,0,0,.05)'
          : '0 2px 8px rgba(0,0,0,.12)',
        opacity: disabled ? 0.5 : 1,
        transition: 'all .15s',
      }}
    >
      <AlertTriangle size={12} strokeWidth={2} />
      <span>{active ? `Atenção · ${count}` : 'Prioridade alta'}</span>
    </button>
  )
}

export function VisaoGeralView() {
  const anoFiltro    = useAppStore(s => s.anoFiltro)
  const ano          = anoFiltro === 'all' ? 2025 : anoFiltro
  const [, setSelected] = useState<QueimadasMunicipio | null>(null)

  const { data: vg,   isLoading: loadKpis } = useQueimadasVisaoGeral(ano)
  const { data: muns, isLoading: loadMap  } = useQueimadasMunicipios(ano)
  const { data: rank, isLoading: loadRank } = useQueimadasRanking(ano, 20)

  const kpis = vg?.kpis

  // Filtro "Atenção": destaca TODOS os municípios em alta pressão de fogo
  // dentro de áreas prioritárias — critério `pct_area_prioritaria > 50%` E
  // `classe_max_queimada ∈ {4, 5}` (Alta + Muito Alta). É o mesmo conjunto
  // já marcado no mapa com borda tracejada vermelha.
  const [priorityOnly, setPriorityOnly] = useState(false)
  const destacadosMuns = useMemo(() => {
    if (!muns) return null
    return muns
      .filter(m =>
        m.classe_max_queimada != null && m.classe_max_queimada >= 4 &&
        m.pct_area_prioritaria != null && m.pct_area_prioritaria > 50,
      )
      .sort((a, b) => (b.area_queimada_total_ha ?? 0) - (a.area_queimada_total_ha ?? 0))
  }, [muns])
  const highlightCods = useMemo<Set<string> | null>(() => {
    if (!priorityOnly || !destacadosMuns) return null
    return new Set(destacadosMuns.map(m => m.municipio_cod))
  }, [priorityOnly, destacadosMuns])
  // Quando filtro ativo: lista os destacados (todos, sem cap de 20).
  // Quando inativo: mantém Top 20 do ranking original.
  const rankExibido = priorityOnly
    ? destacadosMuns?.map((m, i) => ({
        rank:                   i + 1,
        municipio_cod:          m.municipio_cod,
        municipio_nome:         m.municipio_nome,
        area_queimada_total_ha: m.area_queimada_total_ha,
        n_cicatrizes_total:     m.n_cicatrizes_total,
        classe_max_queimada:    m.classe_max_queimada,
        pct_area_prioritaria:   m.pct_area_prioritaria,
        mes_pico:               m.mes_pico,
      })) ?? []
    : (rank ?? [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', padding: 14, overflow: 'hidden' }}>

      {/* KPI cards — usa .grid-5 + .kpi-card (design system + JetBrains Mono) */}
      <div className="grid-5" style={{ flexShrink: 0 }}>
        <KpiCard
          label="Área queimada total"
          value={loadKpis ? '…' : `${fmt(kpis?.area_queimada_total_ha)} ha`}
          accent="#FC8D59"
          sub="AQ1km V6 Col.2 — estimativa"
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
          sub="Classes 4 + 5"
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
                highlightCods={highlightCods}
              />
          }

          {/* Toggle "Prioridade alta" — flutua no canto superior esquerdo do mapa */}
          <PriorityToggle
            active={priorityOnly}
            disabled={loadMap || !destacadosMuns}
            count={destacadosMuns?.length ?? 0}
            onToggle={() => setPriorityOnly(v => !v)}
          />
        </div>

        {/* Top 20 ranking — scroll vertical, cabecalho fixo */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--t2)',
            padding: '11px 12px 9px',
            borderBottom: '1px solid var(--sep)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span>{priorityOnly ? 'Prioridade alta (AHP 4-5)' : 'Top 20 — maior área queimada'}</span>
            <span style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 500 }}>{rankExibido.length} mun.</span>
          </div>
          <div className="ranking-scroll" style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
          }}>
            {loadRank
              ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando…</div>
              : rankExibido.length === 0
                ? <div style={{ fontSize: 10, color: 'var(--t3)', padding: 8 }}>Nenhum município destacado no critério atual.</div>
                : rankExibido.map((r) => (
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
                    <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: '#FC8D59' }}>
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
                      <span className="font-mono" style={{ fontSize: 9, color: r.pct_area_prioritaria > 50 ? '#E34A33' : 'var(--t3)' }}>
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
    </div>
  )
}

// Detecta se a cor "accent" é muito clara (luminância alta) — esses tons
// ficam invisíveis no modo claro. Usado para inverter para um tom escuro
// preservando legibilidade. Lê HEX 6 dígitos; outros formatos = false.
function isVeryLight(hex: string): boolean {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Luminância relativa (aproximação simples).
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return L > 0.85
}

// Wrapper para usar o sistema de cards padrão (.kpi-card + JetBrains Mono via .kpi-value)
function KpiCard({ label, value, accent, sub, alert }: {
  label: string; value: string; accent: string; sub?: string; alert?: boolean
}) {
  const theme = useAppStore(s => s.theme)
  // No modo claro, tons quase-brancos (#F5F5F5, etc.) ficam invisíveis sobre
  // o KPI card (#FFF). Inverte para um cinza escuro preservando contraste AAA.
  const valueColor = (theme === 'light' && isVeryLight(accent)) ? '#374151' : accent
  return (
    <div className="kpi-card" style={{
      borderColor: alert ? `${accent}66` : undefined,
      boxShadow: alert ? `0 0 0 1px ${accent}33 inset` : undefined,
    }}>
      <div className="kpi-label" style={{ gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 10, letterSpacing: '.04em' }}>{label}</span>
      </div>
      <div className="kpi-value" style={{ color: valueColor }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{sub}</div>}
    </div>
  )
}
