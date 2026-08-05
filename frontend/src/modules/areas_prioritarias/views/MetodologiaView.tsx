/**
 * MetodologiaView.tsx
 * Documentação da metodologia AHP, fontes de dados e notas técnicas.
 * Conteúdo estático — não requer queries ao Supabase.
 */
import React from 'react'

export function MetodologiaView() {
  return (
    <div className="max-w-3xl mx-auto p-6 overflow-y-auto h-full">
      <h1 className="text-lg font-bold text-gray-800 mb-1">Metodologia — Áreas Prioritárias REDD+</h1>
      <p className="text-xs text-gray-500 mb-6">
        Programa Jurisdicional de REDD+ do Piauí — Mapa Preliminar (abril/2026)
      </p>

      <Section title="Objetivo">
        <p>
          Identificar espacialmente as áreas prioritárias para apoiar as Ações de
          Monitoramento e Controle do Desmatamento no estado do Piauí, cruzando dados
          PRODES com o raster de 5 classes de prioridade gerado por AHP.
        </p>
      </Section>

      <Section title="Metodologia AHP">
        <p className="mb-3">
          Integração de variáveis de pressão e valor ambiental com ponderação por
          <strong> AHP (Analytic Hierarchy Process)</strong> — método que transforma
          opiniões de importância relativa em pesos numéricos consistentes.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <WeightTable
            title="Índice de Pressão (83%)"
            rows={[
              ['PRODES Recente', '30,76%'],
              ['Alertas MapBiomas', '20,99%'],
              ['TOPODATA (declividade)', '13,40%'],
              ['PRODES Acumulado', '13,47%'],
              ['DETER', '11,30%'],
              ['Rodovias', '5,61%'],
              ['Embargos', '4,46%'],
            ]}
          />
          <WeightTable
            title="Índice de Valor (17%)"
            rows={[['AGB (Biomassa/Carbono)', '17,00%']]}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          <strong>Interpretação:</strong> Áreas de maior prioridade não significam
          necessariamente maior desmatamento consolidado. Indicam zonas onde a
          combinação de pressão e valor ambiental é mais crítica.
        </p>
      </Section>

      <Section title="Fontes de Dados">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border border-gray-200">Dado</th>
              <th className="text-left p-2 border border-gray-200">Fonte</th>
              <th className="text-left p-2 border border-gray-200">Resolução/Data</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Raster 5 classes de prioridade', 'Programa REDD+ PI (Luciane Sato, Graciela Tejada, Isabela Noronha)', 'Abr/2026'],
              ['Máscara florestal 2025', 'FREL — Programa REDD+ PI', '2025'],
              ['Biomassa AGB/BGB/DW/Litter', 'Rasterização mapa vegetação antiga — FREL', '2025'],
              ['PRODES 2024 — Cerrado', 'INPE / TerraBrasilis', '2024'],
              ['Municípios Piauí', 'IBGE Malhas Municipais', '2022'],
            ].map(([dado, fonte, data]) => (
              <tr key={dado} className="border-b border-gray-100">
                <td className="p-2 border border-gray-200 font-medium">{dado}</td>
                <td className="p-2 border border-gray-200">{fonte}</td>
                <td className="p-2 border border-gray-200">{data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Notas Técnicas">
        <ul className="text-xs space-y-1.5 list-disc list-inside text-gray-600">
          <li>Cruzamento realizado pixel-a-pixel com reprojeção para SIRGAS 2000 / EPSG:4674.</li>
          <li>Área calculada por contagem de pixels × área unitária do pixel (ha).</li>
          <li>
            Biomassa exibida como enriquecimento informativo — os rasters locais usam
            máscara FREL (diferente do AGB que entrou no AHP). Não usar para cálculos
            de emissões sem validação com a equipe técnica.
          </li>
          <li>Dados PRODES: desmatamento acumulado até 2024. Fonte: INPE/TerraBrasilis.</li>
          <li>Total de municípios analisados: 224 (Piauí completo).</li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
    </div>
  )
}

function WeightTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="border border-gray-200 rounded p-2">
      <div className="font-semibold text-gray-700 mb-2">{title}</div>
      {rows.map(([label, pct]) => (
        <div key={label} className="flex justify-between py-0.5">
          <span>{label}</span>
          <span className="font-mono font-medium">{pct}</span>
        </div>
      ))}
    </div>
  )
}
