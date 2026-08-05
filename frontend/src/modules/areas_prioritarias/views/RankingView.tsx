/**
 * RankingView.tsx
 * Tabela de ranking de municípios ordenável por qualquer coluna.
 * Clique na linha navega para MunicipalView com o município selecionado.
 */
import { useState } from 'react'
import { useAppStore }  from '../../../core/store/useAppStore'
import type { AppState } from '../../../core/store/useAppStore'
import { useRanking }   from '../hooks/useAreasData'
import type { MunicipioResumo } from '../types'

type OrderBy =
  | 'area_floresta_ha'
  | 'area_desmat_ha'
  | 'pct_floresta_estado'
  | 'classe_max_prioridade'
  | 'municipio_nome'

const COL_LABELS: Record<OrderBy, string> = {
  area_floresta_ha:       'Floresta (ha)',
  area_desmat_ha:         'Desmatado (ha)',
  pct_floresta_estado:    '% Floresta PI',
  classe_max_prioridade:  'Classe máx.',
  municipio_nome:         'Município',
}

export function RankingView() {
  const [orderBy, setOrderBy] = useState<OrderBy>('area_floresta_ha')
  const [search,  setSearch]  = useState('')

  const anoFiltro            = useAppStore((s: AppState) => s.anoFiltro)
  const setSelectedMunicipio = useAppStore((s: AppState) => s.setSelectedMunicipio)
  const setActiveView        = useAppStore((s: AppState) => s.setActiveView)

  const { data: ranking, isLoading } = useRanking(anoFiltro, orderBy)

  const filtered = (ranking ?? []).filter((m) =>
    m.municipio_nome.toLowerCase().includes(search.toLowerCase()),
  )

  function handleRowClick(m: MunicipioResumo) {
    setSelectedMunicipio({ cod: m.municipio_cod, nome: m.municipio_nome, bbox: m.bbox })
    setActiveView('municipal')  // navegar para o mapa municipal
  }

  if (isLoading) return <div className="p-4">Carregando ranking...</div>

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Controles */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Buscar município..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 max-w-xs"
        />
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Ordenar por:</span>
          <select
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value as OrderBy)}
            className="border border-gray-200 rounded px-2 py-1 text-xs"
          >
            {(Object.keys(COL_LABELS) as OrderBy[]).map((k) => (
              <option key={k} value={k}>{COL_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-gray-400 ml-auto">
          {filtered.length} municípios
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left p-2 font-medium">#</th>
              <th
                className="text-left p-2 font-medium cursor-pointer hover:text-blue-600"
                onClick={() => setOrderBy('municipio_nome')}
              >
                Município {orderBy === 'municipio_nome' && '↑'}
              </th>
              {(['area_floresta_ha', 'area_desmat_ha', 'pct_floresta_estado', 'classe_max_prioridade'] as OrderBy[]).map((col) => (
                <th
                  key={col}
                  className="text-right p-2 font-medium cursor-pointer hover:text-blue-600 whitespace-nowrap"
                  onClick={() => setOrderBy(col)}
                >
                  {COL_LABELS[col]} {orderBy === col && '↓'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => (
              <tr
                key={m.municipio_cod}
                className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                onClick={() => handleRowClick(m)}
                title="Clique para ver no mapa"
              >
                <td className="p-2 text-gray-400">{i + 1}</td>
                <td className="p-2 font-medium text-blue-700">{m.municipio_nome}</td>
                <td className="p-2 text-right text-green-700">
                  {m.area_floresta_ha.toLocaleString('pt-BR')}
                </td>
                <td className="p-2 text-right text-red-700">
                  {m.area_desmat_ha.toLocaleString('pt-BR')}
                </td>
                <td className="p-2 text-right">
                  {m.pct_floresta_estado.toFixed(2)}%
                </td>
                <td className="p-2 text-right font-medium">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-white text-xs"
                    style={{ backgroundColor: m.classe_max_prioridade ? `hsl(${(1 - (m.classe_max_prioridade - 1) / 4) * 120}, 70%, 40%)` : '#ccc' }}
                  >
                    {m.classe_max_prioridade ?? '—'}
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
