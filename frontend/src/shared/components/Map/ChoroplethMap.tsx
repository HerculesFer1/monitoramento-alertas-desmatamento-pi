import { useMemo, useState, useCallback } from 'react'
import Map, { Layer, Source, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMunicipiosGeoJSON } from '../../../core/lib/hooks'
import { useAgregado } from '../../../core/lib/hooks'
import { useAppStore } from '../../../core/store/useAppStore'
import { fmtHa, MATOPIBA_SET } from '../../../core/lib/constants'

const INITIAL_VIEW = { longitude: -42.8, latitude: -7.0, zoom: 5.8 }

// Extrai nome do município das propriedades do GeoJSON IBGE
function munName(props: Record<string, unknown>): string {
  return ((props.NM_MUN ?? props.nome ?? props.name ?? props.NOME ?? '') as string)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

interface HoverInfo {
  x: number; y: number
  municipio: string
  ipi: number | null
  haIrr: number
  haTotal: number
  matopiba: boolean
}

interface Props {
  mode?: 'ipi' | 'matopiba'
}

export function ChoroplethMap({ mode = 'ipi' }: Props) {
  const { anoFiltro, theme } = useAppStore()
  const { data: municipiosRaw } = useMunicipiosGeoJSON()
  const { data: agregado }      = useAgregado()
  const [hover, setHover]       = useState<HoverInfo | null>(null)
  const mapStyle  = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  const panelBg   = theme === 'light' ? 'rgba(255,255,255,.95)' : 'rgba(26,26,26,.92)'
  const panelBorder = theme === 'light' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.08)'
  const textMuted = theme === 'light' ? '#666' : '#ABABAB'
  const textLabel = theme === 'light' ? '#888' : '#5A5A5A'
  const textStrong = theme === 'light' ? '#1A1A1A' : '#F2F2F2'

  // Constrói mapa { nomeNormalizado → { ipi, haIrr, haTotal } }
  const statsMap = useMemo(() => {
    if (!agregado?.length) return {}
    const acc: Record<string, { ipiSum: number; haIrr: number; haTotal: number; count: number }> = {}
    const anos = anoFiltro === 'all' ? [2022, 2023, 2024, 2025] : [anoFiltro as number]
    for (const r of agregado) {
      if (!anos.includes(r.ano)) continue
      const key = (r.municipio ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      if (!acc[key]) acc[key] = { ipiSum: 0, haIrr: 0, haTotal: 0, count: 0 }
      acc[key].ipiSum  += r.pct_irregular ?? 0
      acc[key].haIrr   += r.ha_irregular  ?? 0
      acc[key].haTotal += r.ha_total       ?? 0
      acc[key].count   += 1
    }
    return Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, {
        ipi:     v.count > 0 ? v.ipiSum / v.count : null,
        haIrr:   v.haIrr,
        haTotal: v.haTotal,
      }])
    )
  }, [agregado, anoFiltro])

  // Enriquece o GeoJSON com ipi e matopiba
  const enriched = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!municipiosRaw) return null
    return {
      ...municipiosRaw,
      features: municipiosRaw.features.map(f => {
        const props  = f.properties as Record<string, unknown>
        const nome   = munName(props)
        const stats  = statsMap[nome]
        const isMat  = MATOPIBA_SET.has(nome)
        return {
          ...f,
          properties: {
            ...props,
            _nome:     nome,
            _ipi:      stats?.ipi    ?? -1,
            _haIrr:    stats?.haIrr  ?? 0,
            _haTotal:  stats?.haTotal ?? 0,
            _matopiba: isMat,
          },
        }
      }),
    }
  }, [municipiosRaw, statsMap])

  const onMouseMove = useCallback((e: { point: { x: number; y: number }; features?: GeoJSON.Feature[] }) => {
    const f = e.features?.[0]
    if (!f) { setHover(null); return }
    const p = f.properties as Record<string, unknown>
    setHover({
      x:         e.point.x,
      y:         e.point.y,
      municipio: String(p._nome ?? ''),
      ipi:       (p._ipi as number) >= 0 ? (p._ipi as number) : null,
      haIrr:     p._haIrr  as number,
      haTotal:   p._haTotal as number,
      matopiba:  Boolean(p._matopiba),
    })
  }, [])

  const fillColor = mode === 'matopiba'
    ? ['case', ['==', ['get', '_matopiba'], true], '#F59E0B', '#2C2C2C'] as unknown as string
    : [
        'case',
        ['<', ['get', '_ipi'], 0], '#2C2C2C',
        [
          'interpolate', ['linear'], ['get', '_ipi'],
          0,   '#10B981',
          30,  '#6EBF8A',
          60,  '#F59E0B',
          80,  '#F97316',
          100, '#EF4444',
        ],
      ] as unknown as string

  const fillOpacity = mode === 'matopiba'
    ? ['case', ['==', ['get', '_matopiba'], true], 0.75, 0.2] as unknown as number
    : ['case', ['<', ['get', '_ipi'], 0], 0.15, 0.72] as unknown as number

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        interactiveLayerIds={enriched ? ['mun-fill'] : []}
        onMouseMove={onMouseMove as unknown as (e: unknown) => void}
        onMouseLeave={() => setHover(null)}
        onLoad={e => {
          const el = e.target.getContainer().querySelector('.maplibregl-ctrl-attrib') as HTMLElement | null
          if (el) el.classList.remove('maplibregl-compact-show')
        }}
      >
        <NavigationControl position="top-right" />

        {enriched && (
          <Source id="municipios" type="geojson" data={enriched}>
            <Layer
              id="mun-fill"
              type="fill"
              paint={{
                'fill-color':   fillColor,
                'fill-opacity': fillOpacity,
              }}
            />
            <Layer
              id="mun-outline"
              type="line"
              paint={{
                'line-color': 'rgba(255,255,255,0.08)',
                'line-width': 0.6,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        background: panelBg, borderRadius: 8,
        padding: '10px 12px', fontSize: 11,
        border: `1px solid ${panelBorder}`,
      }}>
        {mode === 'ipi' ? (
          <>
            <div style={{ color: textLabel, fontWeight: 600, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>IPI — Índice de Pressão</div>
            {[['#10B981','Baixo (0–30%)'],['#F59E0B','Médio (30–60%)'],['#F97316','Alto (60–80%)'],['#EF4444','Crítico (>80%)']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: c, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ color: textMuted }}>{l}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ color: textLabel, fontWeight: 600, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Território</div>
            {([['#F59E0B','MATOPIBA-PI'],[theme === 'light' ? '#CCCCCC' : '#2C2C2C','Demais municípios']] as [string,string][]).map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: c, border: `1px solid ${panelBorder}`, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ color: textMuted }}>{l}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Tooltip hover */}
      {hover && (
        <div style={{
          position: 'absolute',
          left:  Math.min(hover.x + 12, window.innerWidth  - 180),
          top:   Math.max(hover.y - 60, 8),
          background: panelBg, borderRadius: 8,
          padding: '8px 12px', fontSize: 11,
          border: `1px solid ${panelBorder}`,
          pointerEvents: 'none', zIndex: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.2)',
        }}>
          <div style={{ fontWeight: 700, color: textStrong, marginBottom: 4 }}>
            {hover.municipio}
            {hover.matopiba && <span style={{ marginLeft: 6, color: '#F59E0B', fontSize: 10 }}>MATOPIBA</span>}
          </div>
          {hover.ipi !== null ? (
            <>
              <div style={{ color: ipiColor(hover.ipi), fontWeight: 700 }}>IPI {hover.ipi.toFixed(1)}%</div>
              <div style={{ color: textMuted, marginTop: 2 }}>
                {fmtHa(hover.haIrr)} irr. · {fmtHa(hover.haTotal)} total
              </div>
            </>
          ) : (
            <div style={{ color: textLabel, fontStyle: 'italic' }}>Sem dados</div>
          )}
        </div>
      )}
    </div>
  )
}

function ipiColor(ipi: number): string {
  if (ipi >= 80) return '#EF4444'
  if (ipi >= 60) return '#F97316'
  if (ipi >= 30) return '#F59E0B'
  return '#10B981'
}
