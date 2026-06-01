/**
 * MunicipalView.tsx — queimadas_bdq
 * Mapa interativo + card lateral + seletor de mês.
 */
import { useState }                  from 'react'
import { useAppStore }               from '../../../core/store/useAppStore'
import { useQueimadasMunicipiosMes } from '../hooks/useQueimadasMunicipiosMes'
import { QueimadasMap }              from '../components/QueimadasMap'
import { QueimadasCard }             from '../components/QueimadasCard'
import { MesSeletor }                from '../components/MesSeletor'
import type { QueimadasMunicipio }   from '../types'

export function MunicipalView() {
  const anoFiltro  = useAppStore(s => s.anoFiltro)
  const selectedMes = useAppStore(s => s.selectedMes)
  const ano        = anoFiltro === 'all' ? 2025 : anoFiltro

  const [selectedMun, setSelectedMun] = useState<QueimadasMunicipio | null>(null)

  // useQueimadasMunicipiosMes: quando selectedMes está definido, busca dados
  // do mês via get_qb_municipios_mes (Migration 012); caso contrário usa dados anuais.
  const { data: muns, isLoading } = useQueimadasMunicipiosMes(ano, selectedMes ?? null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>
          Queimadas por município — {ano}
        </span>
        <MesSeletor />
        {selectedMes && (
          <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>
            Mês {selectedMes.toString().padStart(2, '0')}/{ano} — choropleth filtrado
          </span>
        )}
      </div>

      {/* Mapa + painel */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

        {/* Mapa */}
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative', minHeight: 400 }}>
          {isLoading
            ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--t3)' }}>
                Carregando…
              </div>
            : <QueimadasMap
                municipios={muns ?? []}
                selectedMes={selectedMes}
                onSelectMunicipio={setSelectedMun}
              />
          }
        </div>

        {/* Card lateral */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedMun
            ? <QueimadasCard
                municipio={selectedMun}
                onClose={() => setSelectedMun(null)}
              />
            : <div className="card" style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: 20 }}>
                Clique em um município no mapa para ver detalhes
              </div>
          }

          {/* Estatísticas gerais */}
          {!isLoading && muns && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Resumo PI</div>
              <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                <strong style={{ color: '#FC8D59' }}>
                  {muns.filter(m => m.area_queimada_total_ha > 0).length}
                </strong> municípios com queimada
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                <strong style={{ color: '#E34A33' }}>
                  {muns.filter(m => (m.pct_area_prioritaria ?? 0) > 50).length}
                </strong> com &gt;50% em classes 4+5
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
