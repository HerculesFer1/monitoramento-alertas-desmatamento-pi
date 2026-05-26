import { useState, useCallback } from 'react'
import Map, { Layer, Source, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAlertasGeoJson } from '../../../core/lib/hooks'
import { useAppStore } from '../../../core/store/useAppStore'
import { fmtHa } from '../../../core/lib/constants'

const INITIAL_VIEW = { longitude: -42.8, latitude: -7.0, zoom: 5.8 }

const FLAG_COLORS: Record<string, string> = {
  CONCORDANTE:             '#10B981',
  DISCORDANTE:             '#EF4444',
  SEM_PRODES_NO_CICLO:     '#64748B',
  NAO_DISPONIVEL_CAATINGA: '#374151',
  DADOS_PENDENTES:         '#6B7280',
}

const FLAG_LABELS: Record<string, string> = {
  CONCORDANTE:             'Concordante',
  DISCORDANTE:             'Discordante',
  SEM_PRODES_NO_CICLO:     'Sem PRODES no ciclo',
  NAO_DISPONIVEL_CAATINGA: 'Caatinga (s/ PRODES)',
}

interface HoverInfo { x: number; y: number; props: Record<string, unknown> }

export function ConcordanciaMap() {
  const { anoFiltro } = useAppStore()
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const { data: geojson, isLoading } = useAlertasGeoJson({
    ano:   anoFiltro === 'all' ? undefined : (anoFiltro as number),
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
          <Source id="alertas" type="geojson" data={geojson}>
            <Layer
              id="alertas-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'match', ['get', 'flag_validacao_externa'],
                  'CONCORDANTE',             FLAG_COLORS.CONCORDANTE,
                  'DISCORDANTE',             FLAG_COLORS.DISCORDANTE,
                  'SEM_PRODES_NO_CICLO',     FLAG_COLORS.SEM_PRODES_NO_CICLO,
                  'NAO_DISPONIVEL_CAATINGA', FLAG_COLORS.NAO_DISPONIVEL_CAATINGA,
                  FLAG_COLORS.DADOS_PENDENTES,
                ],
                'fill-opacity': 0.75,
              }}
            />
            <Layer
              id="alertas-outline"
              type="line"
              paint={{ 'line-color': '#111111', 'line-width': 0.4 }}
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
        <div style={{ color: '#5A5A5A', fontWeight: 600, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Validação PRODES</div>
        {Object.entries(FLAG_LABELS).map(([flag, label]) => (
          <div key={flag} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: FLAG_COLORS[flag], flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: '#ABABAB' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip hover */}
      {hover && (
        <div style={{
          position: 'absolute',
          left:  Math.min(hover.x + 12, window.innerWidth - 200),
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
          <div style={{ color: flagColor(String(hover.props.flag_validacao_externa ?? '')), fontWeight: 600, marginBottom: 2 }}>
            {FLAG_LABELS[String(hover.props.flag_validacao_externa ?? '')] ?? String(hover.props.flag_validacao_externa ?? '—')}
          </div>
          <div style={{ color: '#ABABAB' }}>
            {fmtHa(hover.props.area_ha as number)} · {String(hover.props.classificacao ?? '')}
          </div>
          {hover.props.concordancia_prodes_pct !== null && (
            <div style={{ color: '#5A5A5A', marginTop: 2 }}>
              Cobertura PRODES: {Number(hover.props.concordancia_prodes_pct ?? 0).toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function flagColor(flag: string): string {
  return FLAG_COLORS[flag] ?? '#ABABAB'
}
