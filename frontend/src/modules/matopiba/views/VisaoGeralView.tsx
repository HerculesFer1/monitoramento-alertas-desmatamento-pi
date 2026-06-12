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

      {/* ── 4 sessões temáticas lado a lado ───────────────────────────
          Grid responsivo: 4 colunas em telas largas, 2 em médias,
          1 em mobile. Cada sessão é um cartão denso com 4 mini-KPIs
          empilhados verticalmente — sem barra de rolagem. */}
      <div className="matopiba-grid">
        <SectionCard title="Alertas MapBiomas" color={MAT_COLOR} live={alertasLive}>
          <MiniKpi
            label="IPI MATOPIBA"
            value={alertasLive ? `${(alertasAno!.ipi ?? 0).toFixed(1)}%` : '—'}
            sub={`Pressão Irregular · ${ano}`}
            color={MAT_COLOR}
          />
          <MiniKpi
            label="Área Irregular"
            value={alertasLive ? fmtHa(alertasAno!.ha_irregular ?? 0) : '—'}
            sub="Total no recorte"
            color="var(--irr)"
          />
          <MiniKpi
            label="Reincidentes"
            value={alertasLive ? String(alertasAno!.n_reincidentes ?? 0) : '—'}
            sub="≥ 3 anos c/ IRR"
            color={MAT_COLOR_2}
          />
          <MiniKpi
            label="Δ IPI YoY"
            value={alertasLive && alertasAno!.delta_ipi_yoy != null
              ? `${alertasAno!.delta_ipi_yoy > 0 ? '+' : ''}${alertasAno!.delta_ipi_yoy?.toFixed(1)} pp`
              : '—'}
            sub="vs ano anterior"
            color={alertasLive && (alertasAno!.delta_ipi_yoy ?? 0) > 0 ? 'var(--irr)' : 'var(--aut)'}
          />
        </SectionCard>

        <SectionCard title="PRODES Cerrado" color="#10B981" live={!prodes.loading && !!prodes.kpis}>
          <MiniKpi
            label="Irregular PRODES"
            value={prodes.kpis ? fmtHa(prodes.kpis.ha_irregular_total) : '—'}
            sub={`${prodes.kpis?.n_municipios ?? 0} / ${N_MUNICIPIOS} munic. PRODES`}
            color="var(--irr)"
          />
          <MiniKpi
            label="Total Mapeado"
            value={prodes.kpis ? fmtHa(prodes.kpis.ha_total) : '—'}
            sub="Irreg. + autorizado"
            color="var(--t1)"
          />
          <MiniKpi
            label="% do Irreg. PI"
            value={prodes.kpis ? `${prodes.kpis.pct_do_estado_irr.toFixed(1)}%` : '—'}
            sub="participação MATOPIBA"
            color={MAT_COLOR}
          />
          <MiniKpi
            label="Munic. Reincidentes"
            value={prodes.kpis ? String(prodes.kpis.n_reincidentes) : '—'}
            sub="≥ 3 anos IRR PRODES"
            color={MAT_COLOR_2}
          />
        </SectionCard>

        <SectionCard title="Queimadas BD-INPE" color="#EF4444" live={qbLive}>
          <MiniKpi
            label="Área Queimada"
            value={qbLive ? fmtHa(qb!.kpis.area_queimada_total_ha) : '—'}
            sub={`Cicatrizes ${ano} · AQ1km V6`}
            color="#EF4444"
          />
          <MiniKpi
            label="Nº Cicatrizes"
            value={qbLive ? fmtNum(qb!.kpis.n_cicatrizes_total) : '—'}
            sub="polígonos detectados"
            color="var(--t1)"
          />
          <MiniKpi
            label="Munic. Afetados"
            value={qbLive ? `${qb!.kpis.municipios_afetados} / ${N_MUNICIPIOS}` : '—'}
            sub="no recorte MATOPIBA"
            color={MAT_COLOR}
          />
          <MiniKpi
            label="% Classe Crítica"
            value={qbLive ? `${(qb!.kpis.pct_em_prioritarias ?? 0).toFixed(1)}%` : '—'}
            sub="prioridade AHP 4 + 5"
            color={qbLive && (qb!.kpis.pct_em_prioritarias ?? 0) > 50 ? 'var(--irr)' : MAT_COLOR_2}
          />
        </SectionCard>

        <SectionCard title="Áreas Prioritárias REDD+" color="#10B981" live={apLive}>
          <MiniKpi
            label="Floresta Mapeada"
            value={apLive ? fmtHa(ap!.kpis.prodes.area_floresta_total_ha ?? 0) : '—'}
            sub={`Máscara florestal · ${ano}`}
            color="var(--aut)"
          />
          <MiniKpi
            label="Desmat. PRODES"
            value={apLive ? fmtHa(ap!.kpis.prodes.area_desmat_total_ha ?? 0) : '—'}
            sub={`${ap?.kpis.prodes.pct_desmat_recorte?.toFixed(2) ?? '—'}% da área`}
            color="var(--irr)"
          />
          <MiniKpi
            label="Biomassa Total"
            value={apLive && ap!.kpis.prodes.biomassa_total_tc != null
              ? `${(ap!.kpis.prodes.biomassa_total_tc / 1_000_000).toFixed(1)} M tC`
              : '—'}
            sub="AGB acumulado"
            color={MAT_COLOR_2}
          />
          <MiniKpi
            label="Munic. Classe 5"
            value={apLive ? `${ap!.kpis.prodes.n_municipios_classe_max} / ${N_MUNICIPIOS}` : '—'}
            sub="prioridade Muito Alto"
            color="var(--irr)"
          />
        </SectionCard>
      </div>

      <div style={{ color: 'var(--t3)', fontSize: 10, marginTop: 12, textAlign: 'center' }}>
        Use as abas no topo para abrir o detalhamento de cada módulo no recorte MATOPIBA.
      </div>

      <style>{`
        .matopiba-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 1180px) {
          .matopiba-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .matopiba-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

/* ── Subcomponentes ─────────────────────────────────────────────────── */

function SectionCard({
  title, color, live, children,
}: {
  title:    string
  color:    string
  live:     boolean
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 6, borderBottom: '1px solid var(--sep)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 2,
            background: color, boxShadow: `0 0 6px ${color}66`,
          }} />
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--t2)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {title}
          </div>
        </div>
        <StatusBadge live={live} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function MiniKpi({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub:   string
  color: string
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'baseline',
      gap: 6,
      padding: '6px 8px',
      borderRadius: 6,
      background: 'rgba(255,255,255,.02)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9.5, fontWeight: 600,
          color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1 }}>
          {sub}
        </div>
      </div>
      <div style={{
        fontSize: 18, fontWeight: 800, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  )
}
