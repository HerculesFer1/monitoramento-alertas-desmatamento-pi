/**
 * MunicipioCard.tsx
 * Cards de stats do município selecionado: área por classe + resumo.
 */
import React from 'react'
import type { ClasseMunicipio, MunicipioResumo } from '../types'
import { CLASSE_COLORS } from '../types'

interface Props {
  nome:      string
  classes:   ClasseMunicipio[]
  resumo:    MunicipioResumo | null
  isLoading: boolean
}

export function MunicipioCard({ nome, classes, resumo, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-full mb-1" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-800 truncate">{nome}</div>
        {resumo && (
          <div className="text-xs text-gray-500 mt-0.5">
            Classe máx.: <strong>{resumo.classe_max_prioridade ?? '—'}</strong>
            {' · '}
            {resumo.pct_floresta_estado?.toFixed(2)}% da floresta do PI
          </div>
        )}
      </div>

      {/* Resumo total */}
      {resumo && (
        <div className="grid grid-cols-2 gap-0 border-b border-gray-100">
          <StatCell label="Floresta"   value={`${resumo.area_floresta_ha?.toLocaleString('pt-BR')} ha`} color="text-green-700" />
          <StatCell label="Desmatado" value={`${resumo.area_desmat_ha?.toLocaleString('pt-BR')} ha`}  color="text-red-700" />
        </div>
      )}

      {/* Por classe */}
      <div className="p-2 max-h-64 overflow-y-auto">
        <div className="text-xs text-gray-500 mb-1.5 font-medium">Por classe de prioridade</div>
        {classes.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-2">Sem dados</div>
        )}
        {classes.map((c) => (
          <div key={c.classe_prioridade} className="mb-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: CLASSE_COLORS[c.classe_prioridade] }}
                />
                <span className="text-xs text-gray-600">Classe {c.classe_prioridade}</span>
              </div>
              <span className="text-xs font-mono text-gray-500">
                {c.pct_floresta.toFixed(1)}% floresta
              </span>
            </div>
            {/* Barra proporcional */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 float-left"
                style={{ width: `${c.pct_floresta}%` }}
              />
              <div
                className="h-full bg-red-400 float-left"
                style={{ width: `${c.pct_desmat}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>{c.area_floresta_ha.toLocaleString('pt-BR')} ha</span>
              <span className="text-red-400">{c.area_desmat_ha.toLocaleString('pt-BR')} ha</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  )
}
