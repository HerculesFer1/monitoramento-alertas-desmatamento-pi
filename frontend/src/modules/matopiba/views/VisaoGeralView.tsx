/**
 * VisaoGeralView.tsx — MATOPIBA
 * Painel transversal: KPIs vindos dos 4 módulos com recorte
 * nos 33 municípios da Portaria MAPA 244/2015 (Decreto 8.447/2015).
 */
import { StatusBadge }                          from '../../../shared/components/StatusBadge'
import { useAppStore }                           from '../../../core/store/useAppStore'
import { useResumoMatopibaClient }              from '../hooks/useMatopibaAlertasClient'
import { useMatopibaProdes }                    from '../hooks/useMatopibaProdes'
import { useMatopibaQueimadasVisaoGeralClient } from '../hooks/useMatopibaQueimadasClient'
import { useMatopibaApVisaoGeralClient }        from '../hooks/useMatopibaApClient'
import { fmtHa, MATOPIBA_N_MUNICIPIOS, MATOPIBA_LIST } from '../../../core/lib/constants'
import { MAT_COLOR, MAT_COLOR_2, MAT_BG, MAT_BG_HARD } from '../types'

const N_MUNICIPIOS = MATOPIBA_N_MUNICIPIOS
const BASE_LEGAL   = 'Portaria MAPA 244/2015 · Decreto 8.447/2015'

function fmtNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR')
}

export function VisaoGeralView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano       = anoFiltro === 'all' ? 2025 : anoFiltro

  // 1) Alertas MapBiomas — client-side a partir de agregado_municipios
  const { data: alertasResumo, isLoading: alertasLoad, isError: alertasErr } = useResumoMatopibaClient()
  const alertasAno = alertasResumo?.find(r => r.ano === ano)
  const alertasLive = !alertasLoad && !alertasErr && !!alertasAno

  // 2) PRODES (filtro client-side por nome — get_prodes_top_municipios)
  const prodes = useMatopibaProdes(ano)

  // 3) Queimadas — client-side a partir de get_qb_municipios
  const { data: qb, isLoading: qbLoad, isError: qbErr } = useMatopibaQueimadasVisaoGeralClient(ano)
  const qbLive = !qbLoad && !qbErr && !!qb?.kpis

  // 4) Áreas Prioritárias — client-side a partir de get_ap_ranking
  const { data: ap, isLoading: apLoad, isError: apErr } = useMatopibaApVisaoGeralClient(ano)
  const apLive = !apLoad && !apErr && !!ap?.kpis

  // Aviso só fica visível se tudo falhou — cenário improvável agora,
  // pois usamos RPCs base independentes das funções _matopiba.
  const showMigrationHint = alertasErr && qbErr && apErr

  return (
    <div className="view-content" style={{ padding: 16 }}>

      {/* ── Cabeçalho contextual ─────────────────────────────────────── */}
      <div className="card b-3" style={{
        borderColor: MAT_BG_HARD, background: MAT_BG, padding: 16, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: MAT_COLOR_2 }}>
            Panorama MATOPIBA-PI
          </div>
          <div style={{ color: 'var(--t2)', fontSize: 12 }}>
            {N_MUNICIPIOS} municípios · {BASE_LEGAL} · Ano de referência: {ano}
          </div>
        </div>
        <div style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4 }}>
          Recorte transversal dos quatro módulos do dashboard (Alertas MapBiomas,
          PRODES Cerrado, Queimadas BD-INPE e Áreas Prioritárias) limitado aos
          municípios piauienses do MATOPIBA.
        </div>
        <details style={{ marginTop: 8, fontSize: 11 }}>
          <summary style={{ cursor: 'pointer', color: MAT_COLOR_2, fontWeight: 600 }}>
            Ver lista oficial dos {N_MUNICIPIOS} municípios
          </summary>
          <div style={{
            marginTop: 6, columnCount: 3, columnGap: 16,
            color: 'var(--t2)', lineHeight: 1.7,
          }}>
            {[...MATOPIBA_LIST].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => (
              <div key={m} style={{ breakInside: 'avoid' }}>• {m}</div>
            ))}
          </div>
        </details>
      </div>

      {showMigrationHint && (
        <div
          role="alert"
          style={{
            border: '1px solid rgba(239,68,68,.4)',
            background: 'rgba(239,68,68,.08)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            color: 'var(--t1)', fontSize: 12, lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>
            Dados MATOPIBA indisponíveis no Supabase
          </div>
          As RPCs <code>get_resumo_matopiba</code> (migration 002) e
          <code> get_*_matopiba</code> (migration 015) não foram detectadas no
          schema. Aplique <strong>nesta ordem</strong> no SQL Editor:
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li><code>infra/supabase/migrations/002_matopiba_view.sql</code></li>
            <li><code>infra/supabase/migrations/015_matopiba_panorama.sql</code></li>
            <li><code>infra/supabase/migrations/016_matopiba_mv_by_name.sql</code> <span style={{ color: 'var(--t3)' }}>— recria a MV usando a lista de 33 municípios (Portaria 244/2015)</span></li>
          </ol>
        </div>
      )}

      {/* ── Bloco 1: Alertas MapBiomas ──────────────────────────────── */}
      <SectionHeader title="Alertas MapBiomas" color={MAT_COLOR} />
      <div className="bento" style={{ marginBottom: 16 }}>
        <KpiCard
          label={<>IPI MATOPIBA <StatusBadge live={alertasLive} /></>}
          value={alertasLive ? `${(alertasAno!.ipi ?? 0).toFixed(1)}%` : '—'}
          sub={`Índice de Pressão Irregular · ${ano}`}
          color={MAT_COLOR}
        />
        <KpiCard
          label="Área Irregular"
          value={alertasLive ? fmtHa(alertasAno!.ha_irregular ?? 0) : '—'}
          sub={`Total no recorte · ${ano}`}
          color="var(--irr)"
        />
        <KpiCard
          label="Reincidentes"
          value={alertasLive ? String(alertasAno!.n_reincidentes ?? 0) : '—'}
          sub="≥ 3 anos com irregular"
          color={MAT_COLOR_2}
        />
        <KpiCard
          label="Δ IPI YoY"
          value={alertasLive && alertasAno!.delta_ipi_yoy != null
            ? `${alertasAno!.delta_ipi_yoy > 0 ? '+' : ''}${alertasAno!.delta_ipi_yoy?.toFixed(1)} pp`
            : '—'}
          sub="variação vs ano anterior"
          color={alertasLive && (alertasAno!.delta_ipi_yoy ?? 0) > 0 ? 'var(--irr)' : 'var(--aut)'}
        />
      </div>

      {/* ── Bloco 2: PRODES Cerrado ─────────────────────────────────── */}
      <SectionHeader title="PRODES Cerrado / INPE" color="#10B981" />
      <div className="bento" style={{ marginBottom: 16 }}>
        <KpiCard
          label={<>Irregular PRODES <StatusBadge live={!prodes.loading && !!prodes.kpis} /></>}
          value={prodes.kpis ? fmtHa(prodes.kpis.ha_irregular_total) : '—'}
          sub={`${prodes.kpis?.n_municipios ?? 0} de ${N_MUNICIPIOS} municípios com PRODES`}
          color="var(--irr)"
        />
        <KpiCard
          label="Total Mapeado"
          value={prodes.kpis ? fmtHa(prodes.kpis.ha_total) : '—'}
          sub={`Irregular + autorizado · ${ano}`}
          color="var(--t1)"
        />
        <KpiCard
          label="% do Irregular PI"
          value={prodes.kpis ? `${prodes.kpis.pct_do_estado_irr.toFixed(1)}%` : '—'}
          sub="participação do MATOPIBA"
          color={MAT_COLOR}
        />
        <KpiCard
          label="Municípios Reincidentes"
          value={prodes.kpis ? String(prodes.kpis.n_reincidentes) : '—'}
          sub="≥ 3 anos com IRR no PRODES"
          color={MAT_COLOR_2}
        />
      </div>

      {/* ── Bloco 3: Queimadas ──────────────────────────────────────── */}
      <SectionHeader title="Queimadas BD-INPE" color="#EF4444" />
      <div className="bento" style={{ marginBottom: 16 }}>
        <KpiCard
          label={<>Área Queimada <StatusBadge live={qbLive} /></>}
          value={qbLive ? fmtHa(qb!.kpis.area_queimada_total_ha) : '—'}
          sub={`Cicatrizes ${ano} · AQ1km V6`}
          color="#EF4444"
        />
        <KpiCard
          label="Nº Cicatrizes"
          value={qbLive ? fmtNum(qb!.kpis.n_cicatrizes_total) : '—'}
          sub="polígonos detectados"
          color="var(--t1)"
        />
        <KpiCard
          label="Municípios Afetados"
          value={qbLive ? `${qb!.kpis.municipios_afetados} / ${N_MUNICIPIOS}` : '—'}
          sub="no recorte MATOPIBA"
          color={MAT_COLOR}
        />
        <KpiCard
          label="% em Classe Crítica"
          value={qbLive ? `${(qb!.kpis.pct_em_prioritarias ?? 0).toFixed(1)}%` : '—'}
          sub="prioridade AHP 4 + 5"
          color={qbLive && (qb!.kpis.pct_em_prioritarias ?? 0) > 50 ? 'var(--irr)' : MAT_COLOR_2}
        />
      </div>

      {/* ── Bloco 4: Áreas Prioritárias REDD+ ───────────────────────── */}
      <SectionHeader title="Áreas Prioritárias REDD+" color="#10B981" />
      <div className="bento">
        <KpiCard
          label={<>Floresta Mapeada <StatusBadge live={apLive} /></>}
          value={apLive ? fmtHa(ap!.kpis.prodes.area_floresta_total_ha ?? 0) : '—'}
          sub={`Máscara florestal · ${ano}`}
          color="var(--aut)"
        />
        <KpiCard
          label="Desmatamento PRODES"
          value={apLive ? fmtHa(ap!.kpis.prodes.area_desmat_total_ha ?? 0) : '—'}
          sub={`${ap?.kpis.prodes.pct_desmat_recorte?.toFixed(2) ?? '—'}% da área`}
          color="var(--irr)"
        />
        <KpiCard
          label="Biomassa Total"
          value={apLive && ap!.kpis.prodes.biomassa_total_tc != null
            ? `${(ap!.kpis.prodes.biomassa_total_tc / 1_000_000).toFixed(1)} M tC`
            : '—'}
          sub="AGB acumulado"
          color={MAT_COLOR_2}
        />
        <KpiCard
          label="Munic. Classe Máxima"
          value={apLive ? `${ap!.kpis.prodes.n_municipios_classe_max} / ${N_MUNICIPIOS}` : '—'}
          sub="prioridade Muito Alto (5)"
          color="var(--irr)"
        />
      </div>

      <div style={{ color: 'var(--t3)', fontSize: 10, marginTop: 16, textAlign: 'center' }}>
        Use as abas no topo para abrir o detalhamento de cada módulo no recorte MATOPIBA.
      </div>
    </div>
  )
}

/* ── Subcomponentes ─────────────────────────────────────────────────── */

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '4px 4px 8px', paddingBottom: 4,
      borderBottom: '1px solid var(--sep)',
    }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: 2,
        background: color, boxShadow: `0 0 6px ${color}66`,
      }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {title}
      </div>
    </div>
  )
}

function KpiCard({
  label, value, sub, color,
}: {
  label: React.ReactNode
  value: string
  sub:   string
  color: string
}) {
  return (
    <div className="kpi-card b-3">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 24 }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
