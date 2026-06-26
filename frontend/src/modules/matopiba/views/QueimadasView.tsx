/**
 * QueimadasView.tsx — MATOPIBA › Queimadas BD-INPE
 * Espelha o esqueleto da queimadas_bdq VisaoGeralView para o recorte
 * dos 33 municípios MATOPIBA-PI (RPCs _matopiba).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useAppStore }  from '../../../core/store/useAppStore'
import {
  useMatopibaQueimadasVisaoGeralClient as useMatopibaQueimadasVisaoGeral,
  useMatopibaQueimadasRankingClient    as useMatopibaQueimadasRanking,
} from '../hooks/useMatopibaQueimadasClient'
import { useMatopibaQueimadasTemporal } from '../hooks/useMatopibaQueimadas'
import { fmtHa, MATOPIBA_N_MUNICIPIOS, MESES, ANO_RECENTE_COMPLETO } from '../../../core/lib/constants'
import { CLASSE_COLORS, CLASSE_LABELS } from '../../queimadas_bdq/types'
import type { ClassePrioridade } from '../../areas_prioritarias/types'
import { MAT_COLOR } from '../types'

const TT = {
  background: '#222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function QueimadasView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano       = anoFiltro === 'all' ? ANO_RECENTE_COMPLETO : anoFiltro

  const { data: vg,  isLoading: vgLoad,  isError: vgErr, error: vgError } = useMatopibaQueimadasVisaoGeral(ano)
  const { data: rk,  isLoading: rkLoad  }                    = useMatopibaQueimadasRanking(ano, 10)
  // Sazonalidade: chama get_qb_temporal_matopiba (RPC habilitada via migration 020).
  const { data: temporal, isLoading: tempLoad, isError: tempErr } = useMatopibaQueimadasTemporal(ano)

  const live = !vgLoad && !vgErr && !!vg?.kpis
  const kpis = vg?.kpis

  const vgMsg = (vgError as { message?: string } | null)?.message ?? ''
  const rpcMissing = vgErr && /PGRST202|schema cache|not found|does not exist/i.test(vgMsg)

  return (
    <div className="view-content" style={{ padding: 16 }}>

      {/* Badge "Mostrando: ano" quando 'Todos os anos' selecionado.
          KPIs single-year; 'all' cai em ANO_RECENTE_COMPLETO. */}
      {anoFiltro === 'all' && (
        <div style={{
          padding: '8px 12px', marginBottom: 12,
          background: 'rgba(252, 141, 89, 0.10)',
          border: '1px solid rgba(252, 141, 89, 0.30)',
          borderRadius: 6, fontSize: 11, color: 'var(--t2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#FC8D59', fontWeight: 700 }}>📅 Mostrando: {ano}</span>
          <span>(ano mais recente completo) — para visão multi-ano agregada use as abas <b>Série Anual</b> ou <b>Recorrência</b>.</span>
        </div>
      )}

      {rpcMissing && (
        <div role="alert" style={{
          border: '1px solid rgba(239,68,68,.35)',
          background: 'rgba(239,68,68,.08)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          color: 'var(--t1)', fontSize: 12, lineHeight: 1.5,
        }}>
          <strong style={{ color: '#EF4444' }}>RPC ausente — </strong>
          <code>get_qb_visao_geral_matopiba</code> não existe no schema. Aplique
          <code> infra/supabase/migrations/015_matopiba_panorama.sql</code> no SQL Editor para habilitar este slide.
        </div>
      )}

      {/* KPIs */}
      <div className="bento">
        <div className="kpi-card b-3">
          <div className="kpi-label">Área Queimada <StatusBadge live={live} /></div>
          <div className="kpi-value" style={{ color: '#EF4444', fontSize: 28 }}>
            {live ? fmtHa(kpis!.area_queimada_total_ha) : '—'}
          </div>
          <div className="kpi-sub">AQ1km V6 · {ano}</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Cicatrizes</div>
          <div className="kpi-value" style={{ color: 'var(--t1)' }}>
            {live ? kpis!.n_cicatrizes_total.toLocaleString('pt-BR') : '—'}
          </div>
          <div className="kpi-sub">polígonos detectados</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Municípios Afetados</div>
          <div className="kpi-value" style={{ color: MAT_COLOR }}>
            {live ? `${kpis!.municipios_afetados} / ${MATOPIBA_N_MUNICIPIOS}` : '—'}
          </div>
          <div className="kpi-sub">no recorte MATOPIBA</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">% Classes 4 + 5</div>
          <div className="kpi-value" style={{ color: 'var(--irr)' }}>
            {live ? `${(kpis!.pct_em_prioritarias ?? 0).toFixed(1)}%` : '—'}
          </div>
          <div className="kpi-sub">em prioridade crítica</div>
        </div>
      </div>

      {/* Sazonalidade mensal — RPC get_qb_temporal_matopiba (migration 020) */}
      <div className="bento" style={{ marginTop: 12 }}>
        <div className="card b-3">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>Sazonalidade {ano} — Área Queimada Mensal (MATOPIBA-PI)</span>
            <StatusBadge live={!tempLoad && !tempErr && !!temporal?.length} />
          </div>
          {tempLoad && (
            <div style={{ color: 'var(--t3)', fontSize: 12, padding: 48, textAlign: 'center' }}>Carregando…</div>
          )}
          {tempErr && (
            <div style={{ color: 'var(--t3)', fontSize: 11, padding: 48, textAlign: 'center', lineHeight: 1.6 }}>
              Falha ao carregar sazonalidade.<br />
              <span style={{ color: 'var(--t3)', fontSize: 10 }}>Tente recarregar a página.</span>
            </div>
          )}
          {!tempLoad && !tempErr && temporal && temporal.length > 0 && (() => {
            const max = temporal.reduce((m, p) => p.area_ha > m.area_ha ? p : m)
            const total = temporal.reduce((s, p) => s + p.area_ha, 0)
            const chartData = temporal.map(p => ({
              mes: MESES[p.mes - 1] ?? `M${p.mes}`,
              area_ha: p.area_ha,
              isPico: p.mes === max.mes,
            }))
            return (
              <>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
                  <span>Pico: <b style={{ color: '#EF4444' }}>{MESES[max.mes - 1]}</b> ({fmtHa(max.area_ha)})</span>
                  <span>Total: <b style={{ color: 'var(--t1)' }}>{fmtHa(total)}</b></span>
                  <span>{temporal.length} mês{temporal.length !== 1 ? 'es' : ''} com dado</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Área']} />
                    <Line type="monotone" dataKey="area_ha" stroke="#EF4444" strokeWidth={2}
                          dot={(props: { payload?: { isPico?: boolean }; cx?: number; cy?: number; index?: number }) =>
                            props.payload?.isPico
                              ? <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill="#EF4444" stroke="#111" strokeWidth={2} />
                              : <circle key={props.index} cx={props.cx} cy={props.cy} r={3} fill="#EF4444" />
                          } />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )
          })()}
          {!tempLoad && !tempErr && (!temporal || temporal.length === 0) && (
            <div style={{ color: 'var(--t3)', fontSize: 12, padding: 48, textAlign: 'center' }}>Sem dados mensais para {ano}.</div>
          )}
        </div>

        {/* Distribuição por classe */}
        <div className="card b-3">
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
            Distribuição por Classe AHP
          </div>
          {vg?.por_classe?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vg.por_classe} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis
                  dataKey="classe_prioridade"
                  tick={{ fontSize: 11, fill: 'var(--t2)' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => CLASSE_LABELS[v as ClassePrioridade] ?? `C${v}`}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Área']} />
                <Bar dataKey="area_queimada_ha" radius={[4, 4, 0, 0]}>
                  {vg.por_classe.map((c, i) => (
                    <Cell key={i} fill={CLASSE_COLORS[c.classe_prioridade as ClassePrioridade]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--t3)', fontSize: 12, padding: 24, textAlign: 'center' }}>
              {vgLoad ? 'Carregando…' : 'Sem dados.'}
            </div>
          )}
        </div>
      </div>

      {/* Top 10 ranking */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ padding: '14px 16px', fontWeight: 600, fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--sep)' }}>
          Top 10 Municípios — Área Queimada
          {rkLoad && <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 8 }}>carregando…</span>}
        </div>
        <table className="data-table">
          <thead><tr><th>#</th><th>Município</th><th>Área (ha)</th><th>Cicatrizes</th><th>Classe máx</th><th>% Prioritária</th></tr></thead>
          <tbody>
            {(rk ?? []).map(r => (
              <tr key={r.municipio_cod}>
                <td style={{ color: 'var(--t3)' }}>{r.rank}</td>
                <td style={{ fontWeight: 600, color: MAT_COLOR }}>{r.municipio_nome}</td>
                <td style={{ color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.area_queimada_total_ha)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.n_cicatrizes_total.toLocaleString('pt-BR')}</td>
                <td>{r.classe_max_queimada != null ? CLASSE_LABELS[r.classe_max_queimada as ClassePrioridade] : '—'}</td>
                <td style={{ color: (r.pct_area_prioritaria ?? 0) > 50 ? 'var(--irr)' : 'var(--t2)', fontWeight: 700 }}>
                  {r.pct_area_prioritaria != null ? `${r.pct_area_prioritaria.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

