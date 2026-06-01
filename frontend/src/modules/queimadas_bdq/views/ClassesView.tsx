/**
 * ClassesView.tsx — queimadas_bdq
 * Área queimada distribuída pelas 5 classes de prioridade AHP.
 * Responde: "O fogo incide mais nas áreas que mais precisamos proteger?"
 */
import { useAppStore }             from '../../../core/store/useAppStore'
import { useQueimadasVisaoGeral }  from '../hooks/useQueimadasVisaoGeral'
import { ClasseBarChart }          from '../components/ClasseBarChart'
import { PrioridadeBadge }        from '../components/PrioridadeBadge'
import { CLASSE_LABELS }          from '../types'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function ClassesView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano       = anoFiltro === 'all' ? 2025 : anoFiltro

  const { data: vg, isLoading } = useQueimadasVisaoGeral(ano)

  const porClasse  = vg?.por_classe ?? []
  const totalHa    = porClasse.reduce((s, c) => s + c.area_queimada_ha, 0)
  const prioHa     = porClasse.filter(c => c.classe_prioridade >= 4).reduce((s, c) => s + c.area_queimada_ha, 0)
  const pctPrio    = totalHa > 0 ? (prioHa / totalHa * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Em classes Alta + Muito Alta
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: pctPrio > 50 ? '#B30000' : '#E34A33' }}>
            {isLoading ? '…' : `${fmt(pctPrio, 1)}%`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            {isLoading ? '' : `${fmt(prioHa)} ha de ${fmt(totalHa)} ha`}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Classe mais afetada
          </div>
          {isLoading
            ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>…</div>
            : (() => {
                const max = porClasse.reduce((a, b) => a.area_queimada_ha > b.area_queimada_ha ? a : b, porClasse[0])
                return max ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <PrioridadeBadge classe={max.classe_prioridade} />
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>{fmt(max.area_queimada_ha)} ha</span>
                  </div>
                ) : null
              })()
          }
        </div>
      </div>

      {/* Gráfico de barras horizontal */}
      <div className="card" style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 12 }}>
          Área queimada por classe de prioridade — {ano}
        </div>
        {isLoading
          ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--t3)' }}>Carregando…</div>
          : <ClasseBarChart data={porClasse} height={280} />
        }
      </div>

      {/* Tabela */}
      {!isLoading && porClasse.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>Detalhamento por classe</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Classe', 'Prioridade', 'Área queimada (ha)', 'Cicatrizes', '% do total'].map(h => (
                  <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Classe' ? 'left' : 'right', color: 'var(--t3)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porClasse.map(c => (
                <tr key={c.classe_prioridade} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <PrioridadeBadge classe={c.classe_prioridade} size="sm" />
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{CLASSE_LABELS[c.classe_prioridade]}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#FC8D59' }}>{fmt(c.area_queimada_ha)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t2)' }}>{fmt(c.n_cicatrizes)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: c.pct_do_total > 30 ? '#E34A33' : 'var(--t2)' }}>
                    {fmt(c.pct_do_total, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
