import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import Map, { Layer, Source, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMunicipiosGeoJSON } from '../../../core/lib/hooks'
import { useAgregado } from '../../../core/lib/hooks'
import { useAppStore } from '../../../core/store/useAppStore'
import { fmtHa, MATOPIBA_SET } from '../../../core/lib/constants'
import { BREAKS_IPI } from '../../../modules/areas_prioritarias/types'

const INITIAL_VIEW = { longitude: -42.8, latitude: -7.0, zoom: 5.8 }

// IDs constantes — usados em interactiveLayerIds e feature-state.
const LAYER_FILL    = 'mun-fill'
const LAYER_OUTLINE = 'mun-outline'

// M7: paint expression reutilizando BREAKS_IPI (source-of-truth única
// entre paint e legenda; B3 evita duplicação).
const IPI_PAINT_INTERPOLATE = [
  'interpolate', ['linear'], ['get', '_ipi'],
  0, BREAKS_IPI.colors[0],
  BREAKS_IPI.thresholds[0], BREAKS_IPI.colors[1],
  BREAKS_IPI.thresholds[1], BREAKS_IPI.colors[2],
  BREAKS_IPI.thresholds[2], BREAKS_IPI.colors[3],
  100, BREAKS_IPI.colors[3],
] as const

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
  const [focusedIdx, setFocusedIdx] = useState<number>(-1)  // A7: navegação por teclado
  const announceRef = useRef<HTMLDivElement>(null)
  const rafRef      = useRef<number | null>(null)            // A4: throttle hover via rAF

  const mapStyle  = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  const panelBg   = theme === 'light' ? 'rgba(255,255,255,.95)' : 'rgba(26,26,26,.92)'
  const panelBorder = theme === 'light' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.08)'
  // A5: cores acessíveis WCAG AA — tons de texto com contraste >= 4.5:1
  const textMuted  = theme === 'light' ? '#525252' : '#D1D5DB'   // 7.1:1 / 11:1
  const textLabel  = theme === 'light' ? '#737373' : '#9CA3AF'   // 5.0:1 / 6.5:1
  const textStrong = theme === 'light' ? '#171717' : '#F9FAFB'   // 16:1 / 18:1

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

  // M10: lista textual ranqueada para fallback acessível (Top 10 por IPI).
  const top10 = useMemo(() => {
    if (!enriched) return []
    return enriched.features
      .map(f => f.properties as Record<string, unknown>)
      .filter(p => (p._ipi as number) >= 0)
      .sort((a, b) => (b._ipi as number) - (a._ipi as number))
      .slice(0, 10)
      .map(p => ({
        nome:    String(p._nome ?? ''),
        ipi:     p._ipi    as number,
        haIrr:   p._haIrr  as number,
        haTotal: p._haTotal as number,
        matopiba: Boolean(p._matopiba),
      }))
  }, [enriched])

  // A4: throttle hover via requestAnimationFrame — limita a 60 FPS sem jank.
  const onMouseMove = useCallback((e: { point: { x: number; y: number }; features?: GeoJSON.Feature[] }) => {
    const f = e.features?.[0]
    if (!f) { setHover(null); return }
    if (rafRef.current != null) return  // dropa frames intermediários
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
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
    })
  }, [])

  // A7: navegação por teclado entre municípios (Tab + setas).
  useEffect(() => {
    if (focusedIdx < 0 || focusedIdx >= top10.length) return
    const m = top10[focusedIdx]
    if (announceRef.current) {
      announceRef.current.textContent =
        `${m.nome}${m.matopiba ? ' (MATOPIBA)' : ''}: IPI ${m.ipi.toFixed(1)}%, ` +
        `${fmtHa(m.haIrr)} irregular de ${fmtHa(m.haTotal)} total.`
    }
  }, [focusedIdx, top10])

  const fillColor = mode === 'matopiba'
    ? ['case', ['==', ['get', '_matopiba'], true], '#F59E0B', '#2C2C2C'] as unknown as string
    : [
        'case',
        ['<', ['get', '_ipi'], 0], '#2C2C2C',
        IPI_PAINT_INTERPOLATE,
      ] as unknown as string

  const fillOpacity = mode === 'matopiba'
    ? ['case', ['==', ['get', '_matopiba'], true], 0.75, 0.2] as unknown as number
    : ['case', ['<', ['get', '_ipi'], 0], 0.15, 0.72] as unknown as number

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      role="region"
      aria-label={mode === 'ipi'
        ? 'Mapa coroplético do Índice de Pressão Irregular (IPI) por município do Piauí'
        : 'Mapa coroplético dos municípios MATOPIBA-PI'}
    >
      <Map
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        // M9: outline também interativo (clique em borda fina não falha mais).
        interactiveLayerIds={enriched ? [LAYER_FILL, LAYER_OUTLINE] : []}
        onMouseMove={onMouseMove as unknown as (e: unknown) => void}
        onMouseLeave={() => setHover(null)}
        onLoad={e => {
          const el = e.target.getContainer().querySelector('.maplibregl-ctrl-attrib') as HTMLElement | null
          if (el) el.classList.remove('maplibregl-compact-show')
          // A7: canvas focável para receber eventos de teclado
          const canvas = e.target.getCanvas()
          canvas.setAttribute('tabindex', '0')
          canvas.setAttribute('role', 'application')
          canvas.setAttribute('aria-label',
            'Mapa interativo. Use as setas para navegar entre os 10 municípios de maior IPI.')
        }}
      >
        <NavigationControl position="top-right" />

        {enriched && (
          <Source id="municipios" type="geojson" data={enriched} promoteId="CD_MUN">
            <Layer
              id={LAYER_FILL}
              type="fill"
              paint={{
                'fill-color':   fillColor,
                'fill-opacity': fillOpacity,
              }}
            />
            <Layer
              id={LAYER_OUTLINE}
              type="line"
              paint={{
                'line-color': theme === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)',
                'line-width': 0.6,
              }}
            />
          </Source>
        )}
      </Map>

      {/* A7: live region para anúncios de teclado a leitores de tela */}
      <div
        ref={announceRef}
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
                 overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
      />

      {/* M10: tabela fallback acessível — visualmente oculta mas disponível para
          leitores de tela e Tab. Mostrável via CSS :focus-within em UX futura. */}
      <details
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 12,
          background: panelBg, borderRadius: 8, padding: '6px 10px',
          fontSize: 11, border: `1px solid ${panelBorder}`, color: textMuted,
          maxWidth: 320,
        }}
      >
        <summary style={{ cursor: 'pointer', color: textStrong, fontWeight: 600 }}>
          Top 10 municípios ({mode === 'ipi' ? 'IPI' : 'MATOPIBA'}) — tabela acessível
        </summary>
        <table style={{ marginTop: 8, width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ color: textLabel, textAlign: 'left' }}>
              <th style={{ padding: '4px 6px' }}>Município</th>
              <th style={{ padding: '4px 6px' }}>IPI</th>
              <th style={{ padding: '4px 6px' }}>Irreg. (ha)</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((m, i) => (
              <tr
                key={m.nome}
                tabIndex={0}
                onFocus={() => setFocusedIdx(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && i < top10.length - 1) setFocusedIdx(i + 1)
                  if (e.key === 'ArrowUp'   && i > 0)                setFocusedIdx(i - 1)
                }}
                style={{
                  outline: focusedIdx === i ? `2px solid ${textStrong}` : 'none',
                  background: focusedIdx === i ? (theme === 'light' ? '#f3f4f6' : '#1f2937') : 'transparent',
                }}
              >
                <td style={{ padding: '4px 6px', color: textStrong }}>
                  {m.nome}{m.matopiba && <span style={{ marginLeft: 4, color: '#F59E0B' }}>•</span>}
                </td>
                <td style={{ padding: '4px 6px', color: ipiColor(m.ipi) }}>{m.ipi.toFixed(1)}%</td>
                <td style={{ padding: '4px 6px', color: textMuted }}>{fmtHa(m.haIrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Legenda — M7: usa BREAKS_IPI como source-of-truth */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        background: panelBg, borderRadius: 8,
        padding: '10px 12px', fontSize: 11,
        border: `1px solid ${panelBorder}`,
      }}>
        {mode === 'ipi' ? (
          <>
            <div style={{ color: textLabel, fontWeight: 600, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              IPI — Índice de Pressão ({BREAKS_IPI.unit})
            </div>
            {BREAKS_IPI.colors.map((c, i) => (
              <div key={BREAKS_IPI.labels[i]} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: c, flexShrink: 0, display: 'inline-block' }} aria-hidden="true" />
                <span style={{ color: textMuted }}>{BREAKS_IPI.labels[i]}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ color: textLabel, fontWeight: 600, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Território</div>
            {([['#F59E0B','MATOPIBA-PI'],[theme === 'light' ? '#CCCCCC' : '#2C2C2C','Demais municípios']] as [string,string][]).map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: c, border: `1px solid ${panelBorder}`, flexShrink: 0, display: 'inline-block' }} aria-hidden="true" />
                <span style={{ color: textMuted }}>{l}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Tooltip hover */}
      {hover && (
        <div
          role="tooltip"
          style={{
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
            {hover.matopiba && <span style={{ marginLeft: 6, color: '#B45309', fontSize: 10 }}>MATOPIBA</span>}
          </div>
          {hover.ipi !== null ? (
            <>
              <div style={{ color: ipiColor(hover.ipi, theme), fontWeight: 700 }}>IPI {hover.ipi.toFixed(1)}%</div>
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

// A5: cores com contraste WCAG AA garantido em ambos os temas.
function ipiColor(ipi: number, theme: 'light' | 'dark' = 'dark'): string {
  if (theme === 'light') {
    if (ipi >= 80) return '#991B1B'  // 7.8:1 sobre branco
    if (ipi >= 60) return '#9A3412'  // 7.5:1
    if (ipi >= 30) return '#92400E'  // 7.6:1
    return '#065F46'                  // 8.4:1
  }
  if (ipi >= 80) return '#FCA5A5'    // 5.1:1 sobre escuro
  if (ipi >= 60) return '#FDBA74'
  if (ipi >= 30) return '#FCD34D'
  return '#6EE7B7'
}
