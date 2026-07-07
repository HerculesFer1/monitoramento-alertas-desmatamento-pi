import { useState, useCallback } from 'react'
import Map, { Layer, Source, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAlertasGeoJson } from '../../../core/lib/hooks'
import { useAppStore } from '../../../core/store/useAppStore'
import { CHART_COLORS, fmtHa, ANOS } from '../../../core/lib/constants'

// Ano mais recente disponível — vem do constants.json gerado pelo pipeline.
const ANO_MAIS_RECENTE = ANOS[ANOS.length - 1]

const COR_CLASSE: Record<string, string> = {
  IRREGULAR:               CHART_COLORS.irr,
  AUTORIZADO:              CHART_COLORS.aut,
  AUTORIZADO_PARCIALMENTE: CHART_COLORS.autp,
  REGULARIZADO:            CHART_COLORS.reg,
}

const LABEL_CLASSE: Record<string, string> = {
  IRREGULAR:               'Irregular',
  AUTORIZADO:              'Autorizado',
  AUTORIZADO_PARCIALMENTE: 'Aut. Parcialmente',
  REGULARIZADO:            'Regularizado',
}

const INITIAL_VIEW = { longitude: -42.8, latitude: -7.0, zoom: 5.8 }

interface HoverInfo { x: number; y: number; props: Record<string, unknown> }

export function MapView() {
  const { anoFiltro } = useAppStore()
  const [hover, setHover] = useState<HoverInfo | null>(null)

  // Quando "Todos", exibe o ano mais recente disponível com label indicativo
  const anoQuery = anoFiltro === 'all' ? ANO_MAIS_RECENTE : (anoFiltro as number)

  const { data: geojson, isLoading } = useAlertasGeoJson({
    ano:   anoQuery,
    limit: 3000,
  })

  const onMouseMove = useCallback((e: { point: { x: number; y: number }; features?: GeoJSON.Feature[] }) => {
    const f = e.features?.[0]
    if (!f) { setHover(null); return }
    setHover({ x: e.point.x, y: e.point.y, props: f.properties as Record<string, unknown> })
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,17,17,.7)' }}>
          <span style={{ color: '#ABABAB', fontSize: 13 }}>Carregando alertas...</span>
        </div>
      )}

      {anoFiltro === 'all' && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          background: 'rgba(26,26,26,.9)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#ABABAB',
        }}>
          Mapa · {ANO_MAIS_RECENTE} (mais recente)
        </div>
      )}

      <Map
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        interactiveLayerIds={geojson ? ['alertas-fill'] : []}
        onMouseMove={onMouseMove as unknown as (e: unknown) => void}
        onMouseLeave={() => setHover(null)}
      >
        <NavigationControl position="top-right" />

        {geojson && (
          <Source
            id="alertas"
            type="geojson"
            data={geojson}
            cluster={true}
            clusterMaxZoom={9}
            clusterRadius={40}
          >
            {/* Clusters */}
            <Layer
              id="clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color': '#374151',
                'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
                'circle-opacity': 0.85,
              }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size':  11,
              }}
              paint={{ 'text-color': '#ABABAB' }}
            />

            {/* Alertas individuais */}
            <Layer
              id="alertas-fill"
              type="fill"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'fill-color': [
                  'match', ['get', 'classificacao'],
                  'IRREGULAR',               COR_CLASSE.IRREGULAR,
                  'AUTORIZADO',              COR_CLASSE.AUTORIZADO,
                  'AUTORIZADO_PARCIALMENTE', COR_CLASSE.AUTORIZADO_PARCIALMENTE,
                  'REGULARIZADO',            COR_CLASSE.REGULARIZADO,
                  '#94A3B8',
                ],
                'fill-opacity': 0.78,
              }}
            />
            <Layer
              id="alertas-outline"
              type="line"
              filter={['!', ['has', 'point_count']]}
              paint={{ 'line-color': '#111111', 'line-width': 0.5 }}
            />
          </Source>
        )}
      </Map>

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        background: 'rgba(26,26,26,.92)', borderRadius: 8,
        padding: '10px 12px', fontSize: 11,
        border: '1px solid rgba(255,255,255,.08)',
      }}>
        {Object.entries(COR_CLASSE).map(([cls, cor]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: cor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#ABABAB' }}>{LABEL_CLASSE[cls]}</span>
          </div>
        ))}
      </div>

      {/* Tooltip hover */}
      {hover && (
        <div style={{
          position: 'absolute',
          left:  Math.min(hover.x + 12, window.innerWidth - 220),
          top:   Math.max(hover.y - 70, 8),
          background: 'rgba(26,26,26,.96)', borderRadius: 8,
          padding: '8px 12px', fontSize: 11,
          border: '1px solid rgba(255,255,255,.1)',
          pointerEvents: 'none', zIndex: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.4)',
        }}>
          <div style={{ fontWeight: 700, color: '#F2F2F2', marginBottom: 4 }}>
            {String(hover.props.municipio ?? '')}
          </div>
          <div style={{ color: COR_CLASSE[String(hover.props.classificacao ?? '')] ?? '#ABABAB', fontWeight: 600, marginBottom: 2 }}>
            {LABEL_CLASSE[String(hover.props.classificacao ?? '')] ?? String(hover.props.classificacao ?? '—')}
          </div>
          <div style={{ color: '#ABABAB' }}>
            {fmtHa(hover.props.area_ha as number)} · {String(hover.props.bioma ?? '')}
          </div>
          {hover.props.codealerta != null && (
            <div style={{ color: '#5A5A5A', marginTop: 2, fontSize: 10 }}>
              {String(hover.props.codealerta)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
