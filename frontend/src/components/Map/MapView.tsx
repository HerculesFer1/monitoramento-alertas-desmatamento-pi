import Map, { Layer, Source, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAlertasGeoJson } from '../../lib/hooks'
import { useAppStore } from '../../store/useAppStore'
import { CHART_COLORS } from '../../lib/constants'

const COR_CLASSE: Record<string, string> = {
  IRREGULAR:               CHART_COLORS.irr,
  AUTORIZADO:              CHART_COLORS.aut,
  AUTORIZADO_PARCIALMENTE: CHART_COLORS.autp,
  REGULARIZADO:            CHART_COLORS.reg,
}

const INITIAL_VIEW = { longitude: -42.8, latitude: -7.0, zoom: 6 }

export function MapView() {
  const { anoFiltro, biomaFiltro, matopibaFiltro } = useAppStore()

  const { data: geojson, isLoading } = useAlertasGeoJson({
    ano:      anoFiltro === 'all' ? 2025 : anoFiltro,
    bioma:    biomaFiltro    ?? undefined,
    matopiba: matopibaFiltro ?? undefined,
    limit:    3000,
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}>
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.7)' }}>
          <span style={{ color: 'var(--t2)', fontSize: 13 }}>Carregando alertas...</span>
        </div>
      )}

      {anoFiltro === 'all' && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: 'rgba(15,23,42,.85)', border: '1px solid var(--sep)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--t2)' }}>
          Mapa · 2025
        </div>
      )}

      <Map
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <NavigationControl position="top-right" />

        {geojson && (
          <Source id="alertas" type="geojson" data={geojson}>
            <Layer
              id="alertas-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'match', ['get', 'classificacao'],
                  'IRREGULAR',              COR_CLASSE.IRREGULAR,
                  'AUTORIZADO',             COR_CLASSE.AUTORIZADO,
                  'AUTORIZADO_PARCIALMENTE',COR_CLASSE.AUTORIZADO_PARCIALMENTE,
                  'REGULARIZADO',           COR_CLASSE.REGULARIZADO,
                  '#94A3B8',
                ],
                'fill-opacity': 0.75,
              }}
            />
            <Layer
              id="alertas-outline"
              type="line"
              paint={{
                'line-color': '#1E293B',
                'line-width': 0.5,
              }}
            />
          </Source>
        )}
      </Map>

      <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(15,23,42,.9)', borderRadius: 8, padding: 12, fontSize: 11 }}>
        {Object.entries(COR_CLASSE).map(([cls, cor], i) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < Object.keys(COR_CLASSE).length - 1 ? 4 : 0 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: cor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--t2)' }}>{cls.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
