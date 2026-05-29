// @ts-nocheck
/**
 * VisaoGeralView.tsx
 * Panorama do estado: mapa coroplético das 5 classes de prioridade por município + KPIs.
 * Mapa leve — sem rasters, só GeoJSON municipal simplificado.
 */
import React, { useRef, useEffect } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }    from '../../../core/store/useAppStore'
import { useVisaoGeral, useAreasGeoJson } from '../hooks/useAreasData'
import { useMunicipioSelect }             from '../hooks/useMunicipioSelect'
import { ClasseBarChart }  from '../components/ClasseBarChart'
import { PeriodBadge }     from '../components/PeriodBadge'
import {
  LAYER_IDS,
  CLASSE_COLORS,
  type MunicipioFeatureProps,
} from '../types'

export function VisaoGeralView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)

  const anoFiltro          = useAppStore((s) => s.anoFiltro)
  const selectedMunicipio  = useAppStore((s) => s.selectedMunicipio)
  const { select, clear }  = useMunicipioSelect(mapRef)

  const { data: visaoGeral, isLoading: loadingKpis } = useVisaoGeral(anoFiltro)
  const { data: geojson,    isLoading: loadingMap  } = useAreasGeoJson(anoFiltro)

  // ── Inicializar mapa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    mapRef.current = new MapLibreMap({
      container:  mapContainer.current,
      style:      'https://demotiles.maplibre.org/style.json',
      bounds:     [[-45.9, -10.95], [-40.37, -2.74]],  // Piauí
      fitBoundsOptions: { padding: 40 },
    })

    mapRef.current.addControl(new NavigationControl(), 'top-right')

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Carregar GeoJSON no mapa ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return

    if (!map.isStyleLoaded()) {
      map.once('load', () => addLayers(map, geojson))
    } else {
      addLayers(map, geojson)
    }
  }, [geojson])

  function addLayers(map: MapLibreMap, data: any) {
    const sourceId = 'municipios-source'

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as any).setData(data)
    } else {
      map.addSource(sourceId, { type: 'geojson', data })

      // Choropleth por classe_max
      map.addLayer({
        id:     LAYER_IDS.PRIORIDADE_FILL,
        type:   'fill',
        source: sourceId,
        paint:  {
          'fill-color': [
            'match', ['get', 'classe_max'],
            ...Object.entries(CLASSE_COLORS).flatMap(([k, v]) => [Number(k), v]),
            '#cccccc',
          ],
          'fill-opacity': 0.75,
        },
      })

      // Bordas municipais
      map.addLayer({
        id:     LAYER_IDS.MUNICIPIOS_LINE,
        type:   'line',
        source: sourceId,
        paint:  { 'line-color': '#374151', 'line-width': 0.5 },
      })

      // Click handler
      map.on('click', LAYER_IDS.PRIORIDADE_FILL, (e) => {
        const props = e.features?.[0]?.properties as MunicipioFeatureProps
        if (!props) return
        select({ cod: props.cod, nome: props.nome, bbox: props.bbox })
      })

      map.on('mouseenter', LAYER_IDS.PRIORIDADE_FILL, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', LAYER_IDS.PRIORIDADE_FILL, () => {
        map.getCanvas().style.cursor = ''
      })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  // RPC retorna kpis.prodes (INPE confirmado) e kpis.deter (alertas gap)
  const kpis      = visaoGeral?.kpis?.prodes
  const kipsDeter = visaoGeral?.kpis?.deter

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Floresta remanescente"
          value={loadingKpis ? '...' : `${kpis?.area_floresta_total_ha?.toLocaleString('pt-BR')} ha`}
        />
        <KpiCard
          label="Desmatado (PRODES 2025)"
          value={loadingKpis ? '...' : `${kpis?.area_desmat_total_ha?.toLocaleString('pt-BR')} ha`}
        />
        <KpiCard
          label="% Desmatamento PI"
          value={loadingKpis ? '...' : `${kpis?.pct_desmat_estado?.toFixed(2)}%`}
          sub="do total de floresta"
        />
        <KpiCard
          label="Municípios Classe 5"
          value={loadingKpis ? '...' : `${kpis?.n_municipios_classe_max ?? '—'}`}
          sub="com floresta em área muito alta"
        />
        <KpiCard
          label="Alertas DETER gap"
          value={loadingKpis ? '...' : (kipsDeter?.disponivel
            ? `${kipsDeter.area_alertas_ha?.toLocaleString('pt-BR')} ha`
            : '—')}
          sub={loadingKpis ? undefined : (kipsDeter?.disponivel
            ? `${kipsDeter.n_municipios_com_alerta} municípios`
            : 'Não disponível')}
        />
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Mapa — sempre renderizado para evitar tela preta */}
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 relative">
          <div ref={mapContainer} className="w-full h-full" />
          {loadingMap && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 text-xs text-gray-500">
              Carregando mapa…
            </div>
          )}
          {selectedMunicipio && (
            <button
              onClick={clear}
              className="absolute top-2 left-2 z-10 bg-white px-2 py-1 text-xs rounded shadow"
            >
              ← Voltar ao estado
            </button>
          )}
          <PeriodBadge ano={anoFiltro} className="absolute bottom-4 right-4 z-10" />
        </div>

        {/* Gráfico por classe */}
        <div className="w-80 flex flex-col gap-3">
          {selectedMunicipio && (
            <div className="text-sm font-medium text-gray-700">
              {selectedMunicipio.nome}
            </div>
          )}
          <ClasseBarChart
            data={visaoGeral?.por_classe ?? []}
            height={300}
          />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-800 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
