/**
 * QueimadasMap.tsx — queimadas_bdq
 * Mapa choropleth: intensidade de área queimada por município.
 * Escala logarítmica: 0 → neutro | >10.000 ha → crítico (#B30000).
 */
import { useRef, useEffect } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import type { LngLatBoundsLike, MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }               from '../../../core/store/useAppStore'
import type { QueimadasMunicipio }   from '../types'
import { QUEIMADA_LAYER_IDS, QUEIMADA_SCALE } from '../types'

interface Props {
  municipios:        QueimadasMunicipio[]
  selectedMes?:      number | null
  onSelectMunicipio: (m: QueimadasMunicipio) => void
}

const PI_BOUNDS: LngLatBoundsLike = [[-45.9, -10.95], [-40.37, -2.74]]

function buildFillColor() {
  // MapLibre interpolate expression — escala logarítmica simulada por steps
  const steps: unknown[] = ['step', ['get', 'area_ha']]
  steps.push(QUEIMADA_SCALE[0][1])  // default
  for (let i = 1; i < QUEIMADA_SCALE.length; i++) {
    steps.push(QUEIMADA_SCALE[i][0], QUEIMADA_SCALE[i][1])
  }
  return steps
}

function toGeoJSON(municipios: QueimadasMunicipio[], mes: number | null) {
  const features = municipios
    .filter(m => m.geom != null)
    .map(m => {
      let area = m.area_queimada_total_ha ?? 0
      // Filtro no cliente para mês selecionado
      if (mes != null && m.area_ha_por_classe) {
        // area_ha_por_classe está por classe; para filtro mensal precisaríamos dados por mês
        // Fallback: usar total (dados mensais não estão no municipios endpoint)
        area = m.area_queimada_total_ha ?? 0
      }
      return {
        type:       'Feature' as const,
        geometry:   m.geom as object,
        properties: {
          cod:         m.municipio_cod,
          nome:        m.municipio_nome,
          area_ha:     area,
          n_cicatrizes: m.n_cicatrizes_total,
          mes_pico:    m.mes_pico,
          pct_prior:   m.pct_area_prioritaria,
        },
      }
    })
  return { type: 'FeatureCollection' as const, features }
}

export function QueimadasMap({ municipios, selectedMes, onSelectMunicipio }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)
  // A3 — refs evitam closure stale: o click handler é registrado uma vez
  // no addLayer, mas precisa enxergar `municipios` e `onSelectMunicipio`
  // sempre atuais (sem rebind a cada render).
  const municipiosRef       = useRef<QueimadasMunicipio[]>(municipios)
  const onSelectMunicipioRef = useRef<(m: QueimadasMunicipio) => void>(onSelectMunicipio)
  const theme        = useAppStore(s => s.theme)

  const mapStyle = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

  // A3 — mantém refs sincronizadas para o click handler ler sempre o valor atual.
  useEffect(() => { municipiosRef.current = municipios }, [municipios])
  useEffect(() => { onSelectMunicipioRef.current = onSelectMunicipio }, [onSelectMunicipio])

  // Helper que adiciona/atualiza source + camadas (idempotente).
  const _ensureLayers = (map: MapLibreMap) => {
    const geojson = toGeoJSON(municipiosRef.current, selectedMes ?? null)
    const srcId = QUEIMADA_LAYER_IDS.QUEIMADAS_FILL + '-src'
    const src   = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined

    if (src) {
      src.setData(geojson as GeoJSON.FeatureCollection)
      return
    }

    map.addSource(srcId, { type: 'geojson', data: geojson as GeoJSON.FeatureCollection })

    map.addLayer({
      id:     QUEIMADA_LAYER_IDS.QUEIMADAS_FILL,
      type:   'fill',
      source: srcId,
      paint:  {
        'fill-color':   buildFillColor() as maplibregl.ExpressionSpecification,
        'fill-opacity': 0.75,
      },
    })

    map.addLayer({
      id:     QUEIMADA_LAYER_IDS.MUNICIPIOS_LINE,
      type:   'line',
      source: srcId,
      paint:  {
        'line-color': 'rgba(255,255,255,.15)',
        'line-width': 0.5,
      },
    })

    // A6 — filtro defensivo contra null: `['has', 'pct_prior']` antes da
    // comparação. Sem isso, em qualquer regressão que deixe pct_prior null,
    // a expressão `>` retornaria silenciosamente false ou erro.
    map.addLayer({
      id:     QUEIMADA_LAYER_IDS.PRIORITARIAS_LINE,
      type:   'line',
      source: srcId,
      filter: ['all', ['has', 'pct_prior'], ['>', ['get', 'pct_prior'], 50]],
      paint:  {
        'line-color':     '#B30000',
        'line-width':     1.5,
        'line-dasharray': [3, 2],
      },
    })

    // A3 — click lê SEMPRE refs atuais (não closures de quando foi registrado).
    map.on('click', QUEIMADA_LAYER_IDS.QUEIMADAS_FILL, (e: MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      const found = municipiosRef.current.find(m => m.municipio_cod === props.cod)
      if (found) onSelectMunicipioRef.current(found)
    })

    map.on('mouseenter', QUEIMADA_LAYER_IDS.QUEIMADAS_FILL, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', QUEIMADA_LAYER_IDS.QUEIMADAS_FILL, () => {
      map.getCanvas().style.cursor = ''
    })
  }

  // Init — uma única vez. Re-adicionar layers vira responsabilidade dos
  // effects abaixo (dados + tema).
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new MapLibreMap({
      container:        mapContainer.current,
      style:            mapStyle,
      bounds:           PI_BOUNDS,
      fitBoundsOptions: { padding: 30 },
    })
    map.addControl(new NavigationControl(), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A2 — reagir a mudança de tema: troca basemap e re-adiciona camadas.
  // Sem isso, alternar light/dark deixava o mapa fora do tema até reload.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(mapStyle)
    const onStyleData = () => _ensureLayers(map)
    map.once('styledata', onStyleData)
    return () => { map.off('styledata', onStyleData) }
  }, [mapStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Adicionar/atualizar camadas quando dados mudam
  useEffect(() => {
    const map = mapRef.current
    if (!map || !municipios.length) return

    const tryAdd = () => {
      if (!map.isStyleLoaded()) { map.once('load', tryAdd); return }
      _ensureLayers(map)
    }
    tryAdd()
  }, [municipios, selectedMes]) // eslint-disable-line react-hooks/exhaustive-deps

  // A2 — paleta de legenda reativa ao tema (era hardcoded para escuro).
  const isLight   = theme === 'light'
  const legendBg  = isLight ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.65)'
  const legendBorder = isLight ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.10)'
  const titleColor   = isLight ? '#525252' : 'rgba(255,255,255,.5)'   // WCAG AA
  const labelColor   = isLight ? '#374151' : 'rgba(255,255,255,.65)'  // WCAG AA
  const hintColor    = isLight ? '#737373' : 'rgba(255,255,255,.45)'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 8 }} />

      {/* Legenda — reativa ao tema (A2) */}
      <div style={{
        position:   'absolute', bottom: 28, left: 8,
        background: legendBg,
        backdropFilter: 'blur(6px)',
        borderRadius: 6, padding: '6px 10px',
        border: `1px solid ${legendBorder}`,
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        <div style={{ fontSize: 9, color: titleColor, marginBottom: 2 }}>Área queimada</div>
        {QUEIMADA_SCALE.map(([threshold, color]) => (
          <div key={threshold} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, border: `1px solid ${legendBorder}` }} />
            <span style={{ fontSize: 9, color: labelColor }}>
              {threshold === 0 ? '0 ha' :
               threshold >= 1000 ? `>${(threshold/1000).toFixed(0)}k ha` :
               `>${threshold} ha`}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <span style={{ width: 10, height: 4, borderRadius: 1, background: 'repeating-linear-gradient(90deg,#B30000 0,#B30000 3px,transparent 3px,transparent 5px)' }} />
          <span style={{ fontSize: 9, color: hintColor }}>&gt;50% em classes 4+5</span>
        </div>
      </div>
    </div>
  )
}
