/**
 * MunicipalView.tsx
 * Mapa interativo com click→zoom→detalhamento municipal.
 * Responde: "Onde o desmatamento avança sobre zonas prioritárias?"
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, GeoJSONSource, Popup } from 'maplibre-gl'
import type { MapMouseEvent, LngLatBoundsLike } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }            from '../../../core/store/useAppStore'
import { useMunicipioDetalhe, useAreasGeoJson } from '../hooks/useAreasData'
import type { BboxState } from '../hooks/useAreasData'
import { useMunicipioSelect }     from '../hooks/useMunicipioSelect'
import { useLayerToggle }         from '../hooks/useLayerToggle'
import { LayerTogglePanel }       from '../components/LayerTogglePanel'
import { MunicipioCard }          from '../components/MunicipioCard'
import { PeriodBadge }            from '../components/PeriodBadge'
import { LAYER_IDS, DEFAULT_VISIBLE_LAYERS, CLASSE_COLORS } from '../types'
import type { MunicipioFeatureProps } from '../types'
import { hideNonCapitalLabels } from '../../../shared/components/Map/basemapLabels'

export function MunicipalView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)
  const geojsonRef   = useRef<FeatureCollection | null>(null)
  const popupRef     = useRef<Popup | null>(null)
  const [mapBbox, setMapBbox] = useState<BboxState | null>(null)

  const anoFiltro         = useAppStore((s) => s.anoFiltro)
  const theme             = useAppStore((s) => s.theme)
  const selectedMunicipio = useAppStore((s) => s.selectedMunicipio)
  const setActiveLayerIds = useAppStore((s) => s.setActiveLayerIds)

  const { select, clear }      = useMunicipioSelect(mapRef)
  const { toggle, isVisible }  = useLayerToggle(mapRef)

  const { data: geojson }              = useAreasGeoJson(anoFiltro, mapBbox)
  const { data: detalhe, isLoading }   = useMunicipioDetalhe(
    selectedMunicipio?.cod ?? null,
    anoFiltro,
  )

  const mapStyle = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new MapLibreMap({
      container:        mapContainer.current,
      style:            mapStyle,
      bounds:           [[-45.9, -10.95], [-40.37, -2.74]] as LngLatBoundsLike,
      fitBoundsOptions: { padding: 40 },
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.once('load', () => setActiveLayerIds(DEFAULT_VISIBLE_LAYERS))
    map.on('style.load', () => hideNonCapitalLabels(map))
    mapRef.current = map

    const trackBbox = () => {
      const b = map.getBounds()
      setMapBbox({ xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth(), zoom: Math.floor(map.getZoom()) })
    }
    map.on('load',    trackBbox)
    map.on('moveend', trackBbox)

    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive theme
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(mapStyle)
    map.once('styledata', () => {
      if (geojsonRef.current) _addBaseLayers(map, geojsonRef.current)
    })
  }, [mapStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (geojson) geojsonRef.current = geojson }, [geojson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return
    const load = () => {
      if (!map.getSource('municipios-source')) {
        _addBaseLayers(map, geojson)
      }
    }
    map.isStyleLoaded() ? load() : map.once('styledata', load)
  }, [geojson]) // eslint-disable-line react-hooks/exhaustive-deps

  const _handleClick = useCallback((e: MapMouseEvent & { features?: { properties: unknown }[] }) => {
    const props = e.features?.[0]?.properties as MunicipioFeatureProps
    if (!props?.cod) return
    // bbox já é array tupla — normalizado em getApGeojsonBbox (M4 da auditoria).
    select({ cod: props.cod, nome: props.nome, bbox: props.bbox })
  }, [select])

  function _addBaseLayers(map: MapLibreMap, data: FeatureCollection) {
    const SRC = 'municipios-source'
    const src = map.getSource(SRC)
    if (src) { (src as GeoJSONSource).setData(data); return }

    map.addSource(SRC, { type: 'geojson', data })

    map.addLayer({
      id: LAYER_IDS.PRIORIDADE_FILL, type: 'fill', source: SRC,
      paint: {
        'fill-color': [
          'match', ['get', 'classe_max'],
          ...Object.entries(CLASSE_COLORS).flatMap(([k, v]) => [Number(k), v]),
          'rgba(255,255,255,.04)',
        ] as unknown as string,
        'fill-opacity': 0.72,
      },
    })
    map.addLayer({
      id: LAYER_IDS.MUNICIPIOS_LINE, type: 'line', source: SRC,
      paint: { 'line-color': 'rgba(255,255,255,0.12)', 'line-width': 0.5 },
    })
    map.addLayer({
      id: LAYER_IDS.SELECTED_FILL, type: 'fill', source: SRC,
      layout: { visibility: 'none' },
      filter: ['==', ['get', 'cod'], ''],
      paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 },
    })

    map.on('click', LAYER_IDS.PRIORIDADE_FILL, _handleClick as (e: MapMouseEvent) => void)

    // Hover tooltip — mostra nome + classe antes do clique
    map.on('mousemove', LAYER_IDS.PRIORIDADE_FILL, (e) => {
      const props = e.features?.[0]?.properties as MunicipioFeatureProps | undefined
      if (!props?.nome) return
      map.getCanvas().style.cursor = 'pointer'

      const classeMax = props.classe_max != null ? `Cl. ${props.classe_max}` : ''
      const html = `
        <div class="tt-premium" style="min-width:160px;pointer-events:none">
          <div class="tt-title" style="margin-bottom:4px">${props.nome}</div>
          ${classeMax ? `<div class="tt-row"><span class="tt-label">Prioridade máx.</span><span class="tt-val">${classeMax}</span></div>` : ''}
          <div style="margin-top:5px;font-size:9px;color:var(--t3)">Clique para detalhes →</div>
        </div>`

      if (!popupRef.current) {
        popupRef.current = new Popup({ closeButton: false, closeOnClick: false, className: 'ap-maplibre-popup' })
      }
      popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map)
    })
    map.on('mouseleave', LAYER_IDS.PRIORIDADE_FILL, () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', gap: 12, padding: 14, overflow: 'hidden' }}>

      {/* Map */}
      <div className="ap-map-wrap">
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {selectedMunicipio && (
          <button className="ap-back-btn" onClick={clear}>← Piauí</button>
        )}

        {!selectedMunicipio && (
          <div className="ap-hint-pill">Clique em um município para detalhar</div>
        )}

        <PeriodBadge ano={anoFiltro} className="absolute bottom-4 right-4 z-10" />
      </div>

      {/* Side panel */}
      <div style={{ width: 272, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flexShrink: 0 }}>
        <LayerTogglePanel onToggle={toggle} isVisible={isVisible} />

        {selectedMunicipio ? (
          <MunicipioCard
            nome={selectedMunicipio.nome}
            classes={detalhe?.classes ?? []}
            resumo={detalhe?.municipio ?? null}
            isLoading={isLoading}
          />
        ) : (
          <div style={{
            borderRadius: 'var(--r)',
            border: '1px dashed rgba(255,255,255,.08)',
            padding: '16px 14px',
            fontSize: 12, color: 'var(--t3)', textAlign: 'center',
            lineHeight: 1.6,
          }}>
            Selecione um município no mapa para ver os detalhes das classes de prioridade.
          </div>
        )}
      </div>
    </div>
  )
}
