/**
 * TemporalView.tsx — queimadas_bdq
 * Série mensal Jan–Dez 2025 com breakout por classe de prioridade.
 * Responde: "Quando o fogo atinge as áreas prioritárias?"
 */
import { useAppStore }             from '../../../core/store/useAppStore'
import { ANO_MIN, ANO_DEFAULT, ANO_RECENTE_COMPLETO } from '../../../core/lib/constants'
import { useQueimadasTemporal }    from '../hooks/useQueimadasTemporal'
import { useQueimadasTemporalMultianual } from '../hooks/useQueimadasMultianual'
import { TemporalGrafico }         from '../components/TemporalGrafico'
import { MESES_LABELS }           from '../types'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function TemporalView() {
  const anoFiltro   = useAppStore(s => s.anoFiltro)
  const selectedMes = useAppStore(s => s.selectedMes)
  const isMulti     = anoFiltro === 'all'
  const ano         = isMulti ? ANO_RECENTE_COMPLETO : anoFiltro

  // Single-year usa get_qb_temporal; multi-ano usa get_qb_temporal_multianual
  // (média mensal entre anos da janela — sazonalidade típica, não soma).
  const sy = useQueimadasTemporal(ano)
  const my = useQueimadasTemporalMultianual(ANO_MIN, ANO_DEFAULT)
  const serie     = isMulti ? my.data      : sy.data
  const isLoading = isMulti ? my.isLoading : sy.isLoading

  const pico = serie?.length
    ? serie.reduce((a, b) => a.area_ha > b.area_ha ? a : b)
    : null

  const mesAtual = selectedMes != null
    ? serie?.find(s => s.mes === selectedMes)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Badge multi-ano: chart mostra MÉDIA mensal entre anos */}
      {isMulti && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(16, 185, 129, 0.10)',
          border: '1px solid rgba(16, 185, 129, 0.30)',
          borderRadius: 6, fontSize: 11, color: 'var(--t2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#10B981', fontWeight: 700 }}>🌍 Sazonalidade média {ANO_MIN}–{ANO_DEFAULT}</span>
          <span>— curva mensal típica (AVG entre anos). Para evolução ano a ano use a aba <b>Série Anual</b>.</span>
        </div>
      )}

      {/* KPIs temporais */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Mês de pico</div>
          {isLoading
            ? <div style={{ fontSize: 14, color: 'var(--t3)' }}>…</div>
            : pico
              ? <>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#B30000' }}>
                    {MESES_LABELS[pico.mes] ?? `Mês ${pico.mes}`}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{fmt(pico.area_ha)} ha | {fmt(pico.n_cicatrizes)} cicatrizes</div>
                </>
              : <div style={{ fontSize: 11, color: 'var(--t3)' }}>Sem dados</div>
          }
        </div>

        {mesAtual && (
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid rgba(252,141,89,.25)' }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Mês selecionado — {MESES_LABELS[mesAtual.mes]}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FC8D59' }}>
              {fmt(mesAtual.area_ha)} ha
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>
              {fmt(mesAtual.n_cicatrizes)} cicatrizes
            </div>
          </div>
        )}

        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Meses com queimada</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>
            {isLoading ? '…' : `${serie?.filter(s => s.area_ha > 0).length ?? 0} / 12`}
          </div>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="card" style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 12 }}>
          Área queimada mensal {isMulti ? `(média ${ANO_MIN}–${ANO_DEFAULT})` : `— ${ano}`}
        </div>
        {isLoading
          ? <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--t3)' }}>
              Carregando…
            </div>
          : <TemporalGrafico data={serie ?? []} height={300} selectedMes={selectedMes} />
        }
        <div style={{ marginTop: 8, fontSize: 9, color: 'var(--t3)' }}>
          Clique em um mês no gráfico para destacá-lo. Use o seletor de mês em "Municipal" para filtrar o mapa.
        </div>
      </div>

      {/* Tabela mensal */}
      {!isLoading && serie && serie.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>Tabela mensal</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {['Mês', 'Área total (ha)', 'Cicatrizes', 'Cl.1', 'Cl.2', 'Cl.3', 'Cl.4', 'Cl.5'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--t3)', fontSize: 9, fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serie.map(s => {
                  const isPico = pico?.mes === s.mes
                  return (
                    <tr key={s.mes} style={{
                      borderBottom: '1px solid rgba(255,255,255,.04)',
                      background: isPico ? 'rgba(179,0,0,.08)' : undefined,
                    }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: isPico ? '#B30000' : 'var(--t1)' }}>
                        {MESES_LABELS[s.mes] ?? s.mes}
                        {isPico && <span style={{ fontSize: 8, marginLeft: 4, color: '#B30000' }}>▲</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#FC8D59', fontWeight: 600 }}>{fmt(s.area_ha)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t2)' }}>{fmt(s.n_cicatrizes)}</td>
                      {([1,2,3,4,5] as const).map(cls => (
                        <td key={cls} style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t3)', fontSize: 9 }}>
                          {fmt(s.por_classe?.[String(cls)])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
