/**
 * RecorrenciaView.tsx — queimadas_bdq
 * Recorrência de fogo 2022–2025 — municípios que queimaram em vários
 * anos consecutivos. IRF (Índice de Recorrência de Fogo) = anos com
 * queima / anos analisados.
 * Responde: "Quais municípios têm pressão de fogo crônica?"
 */
import { useMemo } from 'react'
import { useQueimadasRecorrencia } from '../hooks/useQueimadasRecorrencia'
import type { QueimadasRecorrenciaItem } from '../types'

const ANO_INI = 2022
const ANO_FIM = 2025
const N_ANOS  = ANO_FIM - ANO_INI + 1

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// IRF colorido por faixa — 4/4 = crítico, 3/4 = alto, 2/4 = médio
function irfColor(irf: number): string {
  if (irf >= 1.0)  return '#B30000'  // crônico (100%)
  if (irf >= 0.75) return '#E34A33'  // alto
  if (irf >= 0.5)  return '#FC8D59'  // médio
  return '#FDBB84'                    // baixo
}

function irfBadge(anos_com_fogo: number): string {
  if (anos_com_fogo === N_ANOS) return `${anos_com_fogo}/${N_ANOS} · CRÔNICO`
  return `${anos_com_fogo}/${N_ANOS} anos`
}

export function RecorrenciaView() {
  // Limit alto (250) para garantir que mostre TODOS os municípios com IRF ≥ 0,5 —
  // sem isso o framing fica enganoso (mostra "60 crônicos" quando na verdade são 219).
  const { data: rec, isLoading } = useQueimadasRecorrencia(ANO_INI, ANO_FIM, 250)

  // Distribuição por nº de anos com fogo (1..N_ANOS)
  const distribuicao = useMemo(() => {
    const map = new Map<number, number>()
    rec?.forEach(r => map.set(r.anos_com_fogo, (map.get(r.anos_com_fogo) ?? 0) + 1))
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([anos, n]) => ({ anos, n }))
  }, [rec])

  const cronicos = rec?.filter(r => r.anos_com_fogo === N_ANOS) ?? []
  const areaCronicaTotal = cronicos.reduce((a, b) => a + b.area_total_ha, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', padding: 14, overflow: 'auto' }}>

      {/* KPIs */}
      <div className="grid-5" style={{ flexShrink: 0 }}>
        <KpiCard
          label="Período"
          value={`${ANO_INI}–${ANO_FIM}`}
          sub={`${N_ANOS} anos analisados`}
          accent="#F5F5F5"
        />
        <KpiCard
          label="Municípios com IRF ≥ 0,5"
          value={isLoading ? '…' : `${rec?.length ?? 0}`}
          sub="≥ metade dos anos com fogo"
          accent="#FC8D59"
        />
        <KpiCard
          label="Municípios crônicos"
          value={isLoading ? '…' : `${cronicos.length}`}
          sub={`Queimaram nos ${N_ANOS} anos`}
          accent="#B30000"
          alert={cronicos.length > 0}
        />
        <KpiCard
          label="Área queimada acum. (crônicos)"
          value={isLoading ? '…' : `${fmt(areaCronicaTotal)} ha`}
          accent="#E34A33"
        />
        <KpiCard
          label="% dos 224 mun."
          value={isLoading ? '…' : `${fmt((cronicos.length / 224) * 100, 1)}%`}
          sub="crônicos sobre o total"
          accent="#FDBB84"
        />
      </div>

      {/* Distribuição por nº de anos com fogo */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>
          Distribuição de municípios por nº de anos com fogo
        </div>
        {isLoading
          ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando…</div>
          : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {distribuicao.map(d => (
                <div key={d.anos} style={{
                  flex: '1 1 140px',
                  padding: '10px 14px',
                  border: `1px solid ${irfColor(d.anos / N_ANOS)}44`,
                  borderRadius: 8,
                  background: `${irfColor(d.anos / N_ANOS)}11`,
                }}>
                  <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase' }}>
                    {d.anos}/{N_ANOS} anos
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: irfColor(d.anos / N_ANOS) }}>
                    {d.n}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t3)' }}>municípios</div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Ranking municípios mais recorrentes */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>
          Ranking de recorrência (IRF ≥ 0,5)
        </div>
        {isLoading
          ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando…</div>
          : (rec?.length ?? 0) === 0
            ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>Nenhum município no critério.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                      {['#', 'Município', `Anos com fogo`, 'IRF', `Área acum. (ha)`].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t3)', fontSize: 9, fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rec?.map(linhaMun)}
                  </tbody>
                </table>
              </div>
            )
        }
        <div style={{ marginTop: 8, fontSize: 9, color: 'var(--t3)' }}>
          IRF = anos com queima detectada ÷ {N_ANOS} anos analisados. Municípios "crônicos" (IRF = 1,0)
          são prioridade máxima para ações REDD+ — confirmam pressão estrutural, não eventual.
        </div>
      </div>
    </div>
  )

  function linhaMun(r: QueimadasRecorrenciaItem, i: number) {
    const cor = irfColor(r.irf)
    const cronico = r.anos_com_fogo === N_ANOS
    return (
      <tr key={r.municipio_cod} style={{
        borderBottom: '1px solid rgba(255,255,255,.04)',
        background: cronico ? 'rgba(179,0,0,.06)' : undefined,
      }}>
        <td style={{ padding: '6px 8px', color: 'var(--t3)', width: 30 }}>{i + 1}</td>
        <td style={{ padding: '6px 8px', color: 'var(--t1)', fontWeight: cronico ? 700 : 500 }}>
          {r.municipio_nome}
        </td>
        <td style={{ padding: '6px 8px' }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 9,
            fontWeight: 700,
            color: '#FFF',
            background: cor,
          }}>
            {irfBadge(r.anos_com_fogo)}
          </span>
        </td>
        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: cor, fontWeight: 700 }}>
          {r.irf.toFixed(2)}
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#FC8D59', fontWeight: 600 }}>
          {fmt(r.area_total_ha)}
        </td>
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
