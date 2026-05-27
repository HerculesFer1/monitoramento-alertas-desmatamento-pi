// @ts-nocheck
/**
 * MunicipalView.tsx
 * Mapa interativo com click→zoom→toggle de camadas.
 * Click no município: fitBounds + carrega camadas do município + atualiza stats.
 * LayerTogglePanel: visibilidade por camada sem re-render do mapa.
 */
import React, { useRef, useEffect, useCallback } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }           from '../../../core/store/useAppStore'
import { useMunicipioDetalhe, useAreasGeoJson } from '../hooks/useAreasData'
import { useMunicipioSelect }    from '../hooks/useMunicipioSelect'
import { useLayerToggle }        from '../hooks/useLayerToggle'
import { LayerTogglePanel }      from '../components/LayerTogglePanel'
import { MunicipioCard }         from '../components/MunicipioCard'
import { ClasseBarChart }        from '../components/ClasseBarChart'
import { PeriodBadge }           from '../components/PeriodBadge'
import {
  LAYER_IDS,
  DEFAULT_VISIBLE_LAYERS,
  CLASSE_COLORS,
  type MunicipioFeatureProps,
} from '../types'

export function MunicipalView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)

  const anoFiltro         = useAppStore((s) => s.anoFiltro)
  const selectedMunicipio = useAppStore((s) => s.selectedMunicipio)
  const setActiveLayerIds = useAppStore((s) => s.setActiveLayerIds)

  const { select, clear } = useMunicipioSelect(mapRef)
  const { toggle, isVisible } = useLayerToggle(mapRef)

  const { data: geojson }    = useAreasGeoJson(anoFiltro)
  const { data: detalhe, isLoading } = useMunicipioDetalhe(
    selectedMunicipio?.cod ?? null,
    anoFiltro,
  )

  // ── Inicializar mapa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new MapLibreMap({
      container:  mapContainer.current,
      style:      'https://demotiles.maplibre.org/style.json',
      bounds:     [[-45.9, -10.95], [-40.37, -2.74]],
      fitBoundsOptions: { padding: 40 },
    })

    map.addControl(new NavigationControl(), 'top-right')

    map.once('load', () => {
      // Inicializar camadas padrão visíveis
      setActiveLayerIds(DEFAULT_VISIBLE_LAYERS)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Carregar source GeoJSON ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return

    const load = () => {
      if (!map.getSource('municipios-source')) {
        map.addSource('municipios-source', { type: 'geojson', data: geojson })
        _addBaseLayers(map)
        map.on('click', LAYER_IDS.PRIORIDADE_FILL, _handleClick)
        map.on('mouseenter', LAYER_IDS.PRIORIDADE_FILL, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_IDS.PRIORIDADE_FILL, () => {
          map.getCanvas().style.cursor = ''
        })
      }
    }

    map.isStyleLoaded() ? load() : map.once('load', load)
  }, [geojson])

  const _handleClick = useCallback((e: any) => {
    const props = e.features?.[0]?.properties as MunicipioFeatureProps
    if (!props?.cod) return
    select({ cod: props.cod, nome: props.nome, bbox: props.bbox })
  }, [select])

  function _addBaseLayers(map: MapLibreMap) {
    map.addLayer({
      id: LAYER_IDS.PRIORIDADE_FILL, type: 'fill',
      source: 'municipios-source',
      paint: {
        'fill-color': [
          'match', ['get', 'classe_max'],
          ...Object.entries(CLASSE_COLORS).flatMap(([k, v]) => [Number(k), v]),
          '#cccccc',
        ],
        'fill-opacity': 0.7,
      },
    })
    map.addLayer({
      id: LAYER_IDS.MUNICIPIOS_LINE, type: 'line',
      source: 'municipios-source',
      paint: { 'line-color': '#374151', 'line-width': 0.5 },
    })
    map.addLayer({
      id: LAYER_IDS.SELECTED_FILL, type: 'fill',
      source: 'municipios-source',
      layout: { visibility: 'none' },
      filter: ['==', ['get', 'cod'], ''],
      paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.2 },
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-3 p-4">
      {/* Mapa */}
      <div className="flex-1 relative rounded-lg overflow-hidden border border-gray-200">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Botão voltar */}
        {selectedMunicipio && (
          <button
            onClick={clear}
            className="absolute top-2 left-2 z-10 bg-white px-3 py-1 text-xs rounded-md shadow border border-gray-200 hover:bg-gray-50"
          >
            ← Piauí
          </button>
        )}

        {/* Instrução */}
        {!selectedMunicipio && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 px-3 py-1.5 text-xs rounded-full shadow text-gray-600">
            Clique em um município para detalhar
          </div>
        )}

        <PeriodBadge ano={anoFiltro} className="absolute bottom-4 right-4 z-10" />
      </div>

      {/* Painel lateral */}
      <div className="w-72 flex flex-col gap-3 overflow-y-auto">
        {/* Toggle de camadas */}
        <LayerTogglePanel
          onToggle={toggle}
          isVisible={isVisible}
        />

        {/* Stats do município */}
        {selectedMunicipio && (
          <MunicipioCard
            nome={selectedMunicipio.nome}
            classes={detalhe?.classes ?? []}
            resumo={detalhe?.municipio ?? null}
            isLoading={isLoading}
          />
        )}

        {/* Placeholder sem seleção */}
        {!selectedMunicipio && (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-400 text-center">
            Selecione um município no mapa para ver os detalhes das classes de prioridade.
          </div>
        )}
      </div>
    </div>
  )
}
