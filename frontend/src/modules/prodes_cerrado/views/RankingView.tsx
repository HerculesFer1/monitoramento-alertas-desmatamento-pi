/**
 * RankingView.tsx — PRODES Cerrado
 * Top municípios por área irregular PRODES no ano selecionado.
 */
import { useState, useMemo } from 'react'
import { useAppStore } from '../../../core/store/useAppStore'
import { useProdesTopMunicipios } from '../hooks/useProdesData'
import { fmtHa } from '../../../core/lib/constants'

export function RankingView() {
  const anoFiltro = useAppStore(s => s.anoFiltro)
  const ano = anoFiltro === 'all' ? 2025 : anoFiltro
  const { data, isLoading } = useProdesTopMunicipios(ano, 100)
  const [busca, setBusca] = useState('')
  const [matFiltro, setMatFiltro] = useState(false)
  const [reincFiltro, setReincFiltro] = useState(false)

  const filtrados = useMemo(() => {
    let lista = data ?? []
    if (busca) {
      const b = busca.toLowerCase()
      lista = lista.filter(d => d.municipio.toLowerCase().includes(b))
    }
    if (matFiltro)   lista = lista.filter(d => d.matopiba)
    if (reincFiltro) lista = lista.filter(d => d.reincidente)
    return lista
  }, [data, busca, matFiltro, reincFiltro])

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <input
          type="text"
          className="ap-search"
          placeholder="Buscar município…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ flex: 1, maxWidth: 280 }}
        />
        <Toggle label="MATOPIBA" active={matFiltro}   onToggle={() => setMatFiltro(v => !v)}   color="#B45309" />
        <Toggle label="Reincidentes (≥3 anos)" active={reincFiltro} onToggle={() => setReincFiltro(v => !v)} color="#B91C1C" />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>
          {filtrados.length} de {data?.length ?? 0} municípios · ano {ano}
        </div>
      </div>

      <div className="card ranking-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 1 }}>
            <tr>
              <th>#</th><th>Município</th><th>Polígonos</th>
              <th>Irregular (ha)</th><th>Total (ha)</th><th>IPI (%)</th>
              <th>Anos com irregular</th><th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} style={{ padding: 20, color: 'var(--t3)' }}>Carregando…</td></tr>}
            {!isLoading && filtrados.length === 0 && <tr><td colSpan={8} style={{ padding: 20, color: 'var(--t3)' }}>Sem resultados para o filtro.</td></tr>}
            {filtrados.map(m => (
              <tr key={m.rank}>
                <td style={{ fontWeight: 600, color: 'var(--t3)' }}>{m.rank}</td>
                <td style={{ fontWeight: 600 }}>{m.municipio}</td>
                <td>{m.n_poligonos}</td>
                <td style={{ color: 'var(--irr)', fontWeight: 600 }}>{fmtHa(m.ha_irregular)}</td>
                <td>{fmtHa(m.ha_total)}</td>
                <td style={{
                  fontWeight: 700,
                  color: m.pct_irregular >= 80 ? 'var(--irr)' : m.pct_irregular >= 50 ? 'var(--reg)' : 'var(--aut)',
                }}>{Number(m.pct_irregular).toFixed(1)}%</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {[2022, 2023, 2024, 2025].map(a => (
                      <span key={a} style={{
                        width: 6, height: 14, borderRadius: 2,
                        background: m.anos_com_irregular?.includes(a) ? '#EF4444' : 'rgba(127,127,127,.18)',
                      }} title={a + ': ' + (m.anos_com_irregular?.includes(a) ? 'irregular' : 'sem ocorrência')} />
                    ))}
                  </span>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {m.matopiba    && <span className="tag tag-matopiba">MATOPIBA</span>}
                    {m.reincidente && <span className="tag tag-irr">REINCIDENTE</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Toggle({ label, active, onToggle, color }: { label: string; active: boolean; onToggle: () => void; color: string }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      style={{
        padding: '5px 10px', fontSize: 11, fontWeight: 600,
        background: active ? `${color}22` : 'transparent',
        border: `1px solid ${active ? color : 'var(--sep)'}`,
        color: active ? color : 'var(--t2)',
        borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
      }}
    >
      {label}
    </button>
  )
}
