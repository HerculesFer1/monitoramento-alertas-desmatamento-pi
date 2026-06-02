import { useState, useCallback, useRef } from 'react'
import Map, { Layer, Source, NavigationControl, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAlertasBbox } from '../../../core/lib/hooks'
import type { BboxParams } from '../../../core/lib/queries'
import { useAppStore } from '../../../core/store/useAppStore'
import { CHART_COLORS, fmtHa } from '../../../core/lib/constants'

// C4 da auditoria GIS 2026-06-02 — migrado de get_alertas_geojson (limit 3000)
// para get_alertas_bbox (Migration 011). Servidor filtra por bbox + simplifica
// por zoom; cliente envia viewport atual. Payload tipicamente 10-100× menor,
// alertas mostrados são sempre os relevantes para a vista do usuário.
const MAX_FEATURES_PER_VIEWPORT = 5000  // teto generoso por tile/viewport

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
  const { anoFiltro, theme } = useAppStore()
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [bbox, setBbox]   = useState<BboxParams | null>(null)
  const rafRef = useRef<number | null>(null)  // A4: throttle hover via rAF
  const mapRef = useRef<MapRef | null>(null)
  const mapStyle = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  const panelBg  = theme === 'light' ? 'rgba(255,255,255,.95)' : 'rgba(26,26,26,.92)'
  // A5: contraste WCAG AA — substitui #666/#888 que falham em fundo branco.
  const textMuted = theme === 'light' ? '#525252' : '#D1D5DB'   // 7.1:1 / 11:1
  const textLabel = theme === 'light' ? '#737373' : '#9CA3AF'   // 5.0:1 / 6.5:1
  const textStrong = theme === 'light' ? '#171717' : '#F9FAFB'

  // Quando "Todos", exibe 2025 (ano mais recente) com label indicativo
  const anoQuery = anoFiltro === 'all' ? 2025 : (anoFiltro as number)

  // C4 da auditoria — bbox-aware: bbox só é populada após onLoad/onMoveEnd.
  // Antes disso, hook fica desabilitado (params=null) para evitar fetch
  // com viewport indefinido.
  const bboxParams = bbox != null
    ? { ...bbox, ano: anoQuery, limit: MAX_FEATURES_PER_VIEWPORT }
    : null
  const { data: geojson, isLoading } = useAlertasBbox(bboxParams)

  const featuresShown = geojson?.features.length ?? 0
  const truncated = featuresShown >= MAX_FEATURES_PER_VIEWPORT

  // Atualiza bbox quando o usuário move/zooma o mapa.
  const _updateBboxFromMap = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const b = map.getMap().getBounds()
    setBbox({
      xmin: b.getWest(),
      ymin: b.getSouth(),
      xmax: b.getEast(),
      ymax: b.getNorth(),
      zoom: Math.floor(map.getMap().getZoom()),
    })
  }, [])

  const onMoveEnd = useCallback((_e: ViewStateChangeEvent) => {
    _updateBboxFromMap()
  }, [_updateBboxFromMap])

  // A4: throttle hover via requestAnimationFrame — limita updates a 60 FPS,
  // evita jank em mousemove rápido (CPU 8-12% → ~1%).
  const onMouseMove = useCallback((e: { point: { x: number; y: number }; features?: GeoJSON.Feature[] }) => {
    const f = e.features?.[0]
    if (!f) { setHover(null); return }
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setHover({ x: e.point.x, y: e.point.y, props: f.properties as Record<string, unknown> })
    })
  }, [])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      role="region"
      aria-label={`Mapa de alertas de desmatamento ${anoQuery}, classificados por situação ambiental`}
    >
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,17,17,.7)' }}>
          <span style={{ color: '#ABABAB', fontSize: 13 }} role="status">Carregando alertas...</span>
        </div>
      )}

      {anoFiltro === 'all' && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          background: panelBg, border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'}`,
          borderRadius: 6, padding: '3px 10px', fontSize: 11, color: textMuted,
        }}>
          Mapa · 2025 (mais recente)
        </div>
      )}

      {/* C4 — badge agora indica truncamento somente quando o viewport
          atual tem mais alertas que o teto generoso. Em ~maioria dos zooms,
          fica oculta. */}
      {truncated && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', top: 10, right: 56, zIndex: 10,
            background: theme === 'light' ? '#FEF3C7' : '#451A03',
            color: theme === 'light' ? '#92400E' : '#FCD34D',
            border: `1px solid ${theme === 'light' ? '#FCD34D' : '#92400E'}`,
            borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
          }}
          title={`Apenas os ${MAX_FEATURES_PER_VIEWPORT} maiores alertas da vista atual são exibidos. Aproxime para refinar.`}
        >
          Top {MAX_FEATURES_PER_VIEWPORT.toLocaleString('pt-BR')} no viewport
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        // M9: outline também interativo — clique em borda fina não falha mais.
        interactiveLayerIds={geojson ? ['alertas-fill', 'alertas-outline'] : []}
        onMouseMove={onMouseMove as unknown as (e: unknown) => void}
        onMouseLeave={() => setHover(null)}
        onMoveEnd={onMoveEnd}
        onLoad={e => {
          const el = e.target.getContainer().querySelector('.maplibregl-ctrl-attrib') as HTMLElement | null
          if (el) el.classList.remove('maplibregl-compact-show')
          // A7: canvas focável e identificado para leitores de tela.
          const canvas = e.target.getCanvas()
          canvas.setAttribute('tabindex', '0')
          canvas.setAttribute('role', 'application')
          canvas.setAttribute('aria-label',
            `Mapa interativo de alertas de desmatamento de ${anoQuery}. Use zoom e pan para explorar.`)
          // C4 — popula bbox inicial após o mapa carregar.
          _updateBboxFromMap()
        }}
      >
        <NavigationControl position="top-right" />

        {geojson && (
          <Source
            id="alertas"
            type="geojson"
            data={geojson}
            promoteId="id_fragmento"
          >
            {/* Alertas — polígonos */}
            <Layer
              id="alertas-fill"
              type="fill"
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
              paint={{ 'line-color': '#111111', 'line-width': 0.5 }}
            />
          </Source>
        )}
      </Map>

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        background: panelBg, borderRadius: 8,
        padding: '10px 12px', fontSize: 11,
        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.08)'}`,
      }}>
        {Object.entries(COR_CLASSE).map(([cls, cor]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: cor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: textMuted }}>{LABEL_CLASSE[cls]}</span>
          </div>
        ))}
      </div>

      {/* Tooltip hover */}
      {hover && (
        <div style={{
          position: 'absolute',
          left:  Math.min(hover.x + 12, window.innerWidth - 220),
          top:   Math.max(hover.y - 70, 8),
          background: panelBg, borderRadius: 8,
          padding: '8px 12px', fontSize: 11,
          border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'}`,
          pointerEvents: 'none', zIndex: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.2)',
        }}>
          <div style={{ fontWeight: 700, color: textStrong, marginBottom: 4 }}>
            {String(hover.props.municipio ?? '')}
          </div>
          <div style={{ color: COR_CLASSE[String(hover.props.classificacao ?? '')] ?? textMuted, fontWeight: 600, marginBottom: 2 }}>
            {LABEL_CLASSE[String(hover.props.classificacao ?? '')] ?? String(hover.props.classificacao ?? '—')}
          </div>
          <div style={{ color: textMuted }}>
            {fmtHa(hover.props.area_ha as number)} · {String(hover.props.bioma ?? '')}
          </div>
          {hover.props.codealerta != null && (
            <div style={{ color: textLabel, marginTop: 2, fontSize: 10 }}>
              {String(hover.props.codealerta)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
