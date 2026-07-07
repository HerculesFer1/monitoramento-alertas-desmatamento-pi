/**
 * ProdesPrioridadeView.tsx
 * Quantificação de áreas: floresta remanescente × desmatado por classe de prioridade.
 * Gráfico de barras empilhadas + tabela filtrável por município.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAppStore }  from '../../../core/store/useAppStore'
import type { AppState } from '../../../core/store/useAppStore'
import { useVisaoGeral, useMunicipioDetalhe } from '../hooks/useAreasData'
import type { ClasseMunicipio, ClasseResumo } from '../types'

export function ProdesPrioridadeView() {
  const anoFiltro         = useAppStore((s: AppState) => s.anoFiltro)
  const selectedMunicipio = useAppStore((s: AppState) => s.selectedMunicipio)

  const { data: visaoGeral } = useVisaoGeral(anoFiltro)
  const { data: detalhe }    = useMunicipioDetalhe(
    selectedMunicipio?.cod ?? null,
    anoFiltro,
  )

  // Usar dado do município se selecionado, senão estado inteiro
  const porClasse: ClasseResumo[] = selectedMunicipio
    ? _adaptarClassesMunicipio(detalhe?.classes ?? [])
    : (visaoGeral?.por_classe ?? [])

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {selectedMunicipio
            ? `PRODES × Prioridade — ${selectedMunicipio.nome}`
            : 'PRODES × Prioridade — Piauí (estado)'}
        </h2>
        <div className="text-xs text-gray-500">
          Ano PRODES: {anoFiltro === 'all' ? '2024' : anoFiltro}
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-lg border border-gray-200 p-3" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porClasse} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="classe_prioridade"
              label={{ value: 'Classe de Prioridade', position: 'insideBottom', offset: -4 }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              label={{ value: 'Área (ha)', angle: -90, position: 'insideLeft', offset: 8 }}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
            />
            <Tooltip
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString('pt-BR')} ha`,
                String(name ?? ''),
              ]}
            />
            <Legend />
            <Bar dataKey="area_floresta_ha" name="Floresta remanescente" fill="#16a34a" stackId="a" />
            <Bar dataKey="area_desmat_ha"   name="Desmatamento PRODES"   fill="#dc2626" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left p-2">Classe</th>
              <th className="text-right p-2">Floresta (ha)</th>
              <th className="text-right p-2">Desmatado (ha)</th>
              <th className="text-right p-2">Total (ha)</th>
              <th className="text-right p-2">% Floresta</th>
              <th className="text-right p-2">Municípios</th>
            </tr>
          </thead>
          <tbody>
            {porClasse.map((c) => (
              <tr key={c.classe_prioridade} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 font-medium">{c.classe_prioridade}</td>
                <td className="p-2 text-right text-green-700">{c.area_floresta_ha.toLocaleString('pt-BR')}</td>
                <td className="p-2 text-right text-red-700">{c.area_desmat_ha.toLocaleString('pt-BR')}</td>
                <td className="p-2 text-right">{c.area_total_ha.toLocaleString('pt-BR')}</td>
                <td className="p-2 text-right">{c.pct_floresta_media.toFixed(1)}%</td>
                <td className="p-2 text-right">{c.n_municipios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function _adaptarClassesMunicipio(classes: ClasseMunicipio[]): ClasseResumo[] {
  return classes.map((c) => ({
    classe_prioridade:  c.classe_prioridade,
    area_floresta_ha:   c.area_floresta_ha,
    area_desmat_ha:     c.area_desmat_ha,
    area_total_ha:      c.area_total_ha,
    pct_floresta_media: c.pct_floresta,
    n_municipios:       1,
  }))
}
