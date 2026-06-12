/**
 * AreasPrioritariasView.tsx — MATOPIBA › Áreas Prioritárias REDD+
 * Espelha o resumo de Áreas Prioritárias com recorte nos 33 municípios
 * MATOPIBA-PI (RPCs _matopiba).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useAppStore }  from '../../../core/store/useAppStore'
import {
  useMatopibaApVisaoGeralClient as useMatopibaApVisaoGeral,
  useMatopibaApRankingClient    as useMatopibaApRanking,
} from '../hooks/useMatopibaApClient'
import { fmtHa, MATOPIBA_N_MUNICIPIOS } from '../../../core/lib/constants'
import { CLASSE_COLORS, CLASSE_LABELS } from '../../areas_prioritarias/types'
import type { ClassePrioridade } from '../../areas_prioritarias/types'
import { MAT_COLOR } from '../types'

const TT = {
  background: '#222', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8, fontSize: 12, color: '#F2F2F2',
}

export function AreasPrioritariasView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano       = anoFiltro === 'all' ? 2025 : anoFiltro

  const { data: vg, isLoading: vgLoad, isError: vgErr, error: vgError } = useMatopibaApVisaoGeral(ano)
  const { data: rk, isLoading: rkLoad }                  = useMatopibaApRanking(ano, 'area_desmat_ha', 10)

  const live = !vgLoad && !vgErr && !!vg?.kpis
  const prodes = vg?.kpis.prodes

  const vgMsg = (vgError as { message?: string } | null)?.message ?? ''
  const rpcMissing = vgErr && /PGRST202|schema cache|not found|does not exist/i.test(vgMsg)

  return (
    <div className="view-content" style={{ padding: 16 }}>

      {rpcMissing && (
        <div role="alert" style={{
          border: '1px solid rgba(239,68,68,.35)',
          background: 'rgba(239,68,68,.08)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          color: 'var(--t1)', fontSize: 12, lineHeight: 1.5,
        }}>
          <strong style={{ color: '#EF4444' }}>RPC ausente — </strong>
          <code>get_ap_visao_geral_matopiba</code> não existe no schema. Aplique
          <code> infra/supabase/migrations/015_matopiba_panorama.sql</code> no SQL Editor.
          <span style={{ color: 'var(--t3)' }}> Se persistir, verifique também a migration 010 (colunas v3).</span>
        </div>
      )}

      {/* KPIs */}
      <div className="bento">
        <div className="kpi-card b-3">
          <div className="kpi-label">Floresta Mapeada <StatusBadge live={live} /></div>
          <div className="kpi-value" style={{ color: 'var(--aut)', fontSize: 28 }}>
            {live ? fmtHa(prodes!.area_floresta_total_ha ?? 0) : '—'}
          </div>
          <div className="kpi-sub">Máscara florestal · {ano}</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Desmatamento PRODES</div>
          <div className="kpi-value" style={{ color: 'var(--irr)' }}>
            {live ? fmtHa(prodes!.area_desmat_total_ha ?? 0) : '—'}
          </div>
          <div className="kpi-sub">{prodes?.pct_desmat_recorte?.toFixed(2) ?? '—'}% da área do recorte</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Biomassa Total</div>
          <div className="kpi-value" style={{ color: MAT_COLOR }}>
            {live && prodes!.biomassa_total_tc != null
              ? `${(prodes!.biomassa_total_tc / 1_000_000).toFixed(1)} M tC`
              : '—'}
          </div>
          <div className="kpi-sub">AGB acumulado (rasterstats)</div>
        </div>
        <div className="kpi-card b-3">
          <div className="kpi-label">Munic. Classe 5</div>
          <div className="kpi-value" style={{ color: 'var(--irr)' }}>
            {live ? `${prodes!.n_municipios_classe_max} / ${MATOPIBA_N_MUNICIPIOS}` : '—'}
          </div>
          <div className="kpi-sub">prioridade Muito Alto</div>
        </div>
      </div>

      {/* Distribuição por classe de prioridade */}
      <div className="card b-3" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
          Área Florestal por Classe de Prioridade — MATOPIBA-PI
        </div>
        {vg?.por_classe?.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vg.por_classe}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis
                dataKey="classe_prioridade"
                tick={{ fontSize: 11, fill: 'var(--t2)' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: number) => CLASSE_LABELS[v as ClassePrioridade] ?? `C${v}`}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Área florestal']} />
              <Bar dataKey="area_floresta_ha" radius={[4, 4, 0, 0]}>
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

      {/* Ranking por desmatamento */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ padding: '14px 16px', fontWeight: 600, fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--sep)' }}>
          Ranking Municipal MATOPIBA — Desmatamento PRODES
          {rkLoad && <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 8 }}>carregando…</span>}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Município</th>
              <th>Floresta (ha)</th><th>Desmat. (ha)</th>
              <th>Classe máx</th><th>Biomassa (tC)</th>
            </tr>
          </thead>
          <tbody>
            {(rk ?? []).map((r, i) => (
              <tr key={r.municipio_cod}>
                <td style={{ color: 'var(--t3)' }}>{i + 1}</td>
                <td style={{ fontWeight: 600, color: MAT_COLOR }}>{r.municipio_nome}</td>
                <td style={{ color: 'var(--aut)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.area_floresta_ha)}</td>
                <td style={{ color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(r.area_desmat_ha)}</td>
                <td>{r.classe_max_prioridade != null ? CLASSE_LABELS[r.classe_max_prioridade] : '—'}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.biomassa_floresta_tc.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ color: 'var(--t3)', fontSize: 10, marginTop: 12, textAlign: 'center' }}>
        Recorte legal: Portaria MAPA 244/2015 (Decreto 8.447/2015) · {vg?.kpis.recorte?.n_municipios ?? MATOPIBA_N_MUNICIPIOS} municípios piauienses.
      </div>
    </div>
  )
}
