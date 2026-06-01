/**
 * BiomassaView.tsx — Tab Biomassa (areas_prioritarias)
 * Responde: "Onde está o maior estoque de carbono florestal intacto?"
 *
 * Esquerda: mapa coroplético municipal por biomassa_floresta_tc
 * Direita:  heatmap AGB médio (tC/ha) por classe × top-15 municípios
 */
import { useRef, useEffect } from 'react'
import { Map as MapLibreMap, NavigationControl, Popup, GeoJSONSource } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }      from '../../../core/store/useAppStore'
import { useAreasGeoJson }  from '../hooks/useAreasData'
import { useBiomassaHeatmap } from '../hooks/useBiomassaData'
import type { HeatmapRow }  from '../hooks/useBiomassaData'
import { LAYER_IDS, CLASSE_LABELS } from '../types'
import type { ClassePrioridade }    from '../types'
import { fmtHa } from '../../../core/lib/constants'

const CLASSES: ClassePrioridade[] = [1, 2, 3, 4, 5]
const AGB_MIN = 0
const AGB_MAX = 130

// ── Color utilities ───────────────────────────────────────────────────────────

function agbToColor(agb: number | null): string {
  if (agb === null || agb <= 0) return 'rgba(255,255,255,.04)'
  const t = Math.min(Math.max((agb - AGB_MIN) / (AGB_MAX - AGB_MIN), 0), 1)
  // YlGn: amber → emerald → dark green
  const stops: [number, number, number][] = [[245, 158, 11], [16, 185, 129], [4, 120, 87]]
  let r: number, g: number, b: number
  if (t <= 0.5) {
    const u = t / 0.5
    r = Math.round(stops[0][0] + u * (stops[1][0] - stops[0][0]))
    g = Math.round(stops[0][1] + u * (stops[1][1] - stops[0][1]))
    b = Math.round(stops[0][2] + u * (stops[1][2] - stops[0][2]))
  } else {
    const u = (t - 0.5) / 0.5
    r = Math.round(stops[1][0] + u * (stops[2][0] - stops[1][0]))
    g = Math.round(stops[1][1] + u * (stops[2][1] - stops[1][1]))
    b = Math.round(stops[1][2] + u * (stops[2][2] - stops[1][2]))
  }
  return `rgb(${r},${g},${b})`
}

// ── BiomassaHeatmap ───────────────────────────────────────────────────────────

function BiomassaHeatmap({ data }: { data: HeatmapRow[] }) {
  if (!data.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, fontSize: 11, color: 'var(--t3)' }}>
        Sem dados de biomassa disponíveis
      </div>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', paddingRight: 8, paddingBottom: 6, color: 'var(--t3)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', minWidth: 100, maxWidth: 110 }}>
            Município
          </th>
          {CLASSES.map((cls) => (
            <th key={cls} style={{ textAlign: 'center', paddingBottom: 6, paddingLeft: 2, paddingRight: 2, color: 'var(--t3)', fontWeight: 600 }}>
              <div>Cl. {cls}</div>
              <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--t3)', opacity: .7 }}>
                {CLASSE_LABELS[cls].replace('Muito ', 'M.')}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.municipio_cod}>
            <td
              title={row.municipio_nome}
              style={{ paddingRight: 8, paddingTop: 2, paddingBottom: 2, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, fontWeight: 500 }}
            >
              {row.municipio_nome}
            </td>
            {CLASSES.map((cls) => {
              const cell = row.agb_por_classe[cls]
              const agb  = cell?.agb ?? null
              const bg   = agbToColor(agb)
              const dark = agb !== null && agb > 65
              return (
                <td key={cls} style={{ padding: '2px 2px' }}>
                  <div
                    className="ap-heatmap-cell"
                    style={{
                      background: bg,
                      color: dark ? 'rgba(255,255,255,.95)' : (agb !== null ? 'rgba(0,0,0,.85)' : 'var(--t3)'),
                      minWidth: 40,
                    }}
                    title={agb !== null
                      ? `${row.municipio_nome} — Cl. ${cls}: ${agb.toFixed(1)} tC/ha`
                      : `${row.municipio_nome} — Cl. ${cls}: sem dados`}
                  >
                    {agb !== null ? agb.toFixed(0) : '—'}
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── BiomassaView ──────────────────────────────────────────────────────────────

export function BiomassaView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)
  const popupRef     = useRef<Popup | null>(null)
  const geojsonRef   = useRef<FeatureCollection | null>(null)

  const anoFiltro = useAppStore((s) => s.anoFiltro)
  const theme     = useAppStore((s) => s.theme)

  const { data: geojson,  isLoading: loadingMap  } = useAreasGeoJson(anoFiltro)
  const { data: heatmap,  isLoading: loadingHeat } = useBiomassaHeatmap(anoFiltro)

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
    mapRef.current = map

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive theme
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    popupRef.current?.remove()
    map.setStyle(mapStyle)
    map.once('styledata', () => {
      if (geojsonRef.current) _addLayers(map, geojsonRef.current)
    })
  }, [mapStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (geojson) geojsonRef.current = geojson }, [geojson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return
    const load = () => _addLayers(map, geojson)
    map.isStyleLoaded() ? load() : map.once('styledata', load)
  }, [geojson]) // eslint-disable-line react-hooks/exhaustive-deps

  function _addLayers(map: MapLibreMap, data: FeatureCollection) {
    const SRC = 'biomassa-source'
    const src = map.getSource(SRC)
    if (src) { (src as GeoJSONSource).setData(data); return }

    map.addSource(SRC, { type: 'geojson', data })

    // Choropleth por biomassa_total_tc
    map.addLayer({
      id: LAYER_IDS.BIOMASSA_HEAT, type: 'fill', source: SRC,
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'biomassa_total_tc'], 0],
          0,          '#111111',
          500_000,    '#064e3b',
          2_000_000,  '#065f46',
          8_000_000,  '#10B981',
          20_000_000, '#6EE7B7',
        ],
        'fill-opacity': 0.85,
      },
    })
    map.addLayer({
      id: LAYER_IDS.MUNICIPIOS_LINE, type: 'line', source: SRC,
      paint: { 'line-color': 'rgba(255,255,255,0.1)', 'line-width': 0.5 },
    })

    map.on('mousemove', LAYER_IDS.BIOMASSA_HEAT, (e) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      map.getCanvas().style.cursor = 'pointer'

      const biomTotal = fmtHa(Number(props.biomassa_total_tc ?? 0))
      const agbMed    = Number(props.agb_medio_tc_ha ?? 0).toFixed(1)
      const floresta  = fmtHa(Number(props.area_floresta_ha  ?? 0))
      const nome      = String(props.nome ?? '')

      const html = `
        <div class="tt-premium" style="min-width:190px;pointer-events:none">
          <div class="tt-title">${nome}</div>
          <div class="tt-row">
            <span class="tt-label">Biomassa total</span>
            <span class="tt-val" style="color:#10B981">${biomTotal}</span>
          </div>
          <div class="tt-row">
            <span class="tt-label">AGB médio</span>
            <span class="tt-val" style="color:#F59E0B">${agbMed} tC/ha</span>
          </div>
          <div class="tt-sep"></div>
          <div class="tt-row">
            <span class="tt-label">Floresta remanescente</span>
            <span class="tt-val">${floresta}</span>
          </div>
        </div>`

      if (!popupRef.current) {
        popupRef.current = new Popup({ closeButton: false, closeOnClick: false, className: 'ap-maplibre-popup' })
      }
      popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map)
    })

    map.on('mouseleave', LAYER_IDS.BIOMASSA_HEAT, () => {
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

        {loadingMap && <div className="ap-map-overlay">Carregando mapa…</div>}

        {/* Title chip */}
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
          padding: '5px 12px', fontSize: 11, color: 'rgba(242,242,242,.9)',
        }}>
          Estoque de carbono florestal (tC)
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 30, right: 10, zIndex: 10,
          background: 'rgba(10,10,10,.85)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,.09)', borderRadius: 10,
          padding: '10px 12px', fontSize: 10,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 9 }}>
            Biomassa florestal
          </div>
          {[
            { color: '#6EE7B7', label: '> 20 MtC' },
            { color: '#10B981', label: '8 – 20 MtC' },
            { color: '#065f46', label: '2 – 8 MtC' },
            { color: '#064e3b', label: '500k – 2 MtC' },
            { color: '#111111', label: '< 500k tC' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, border: '1px solid rgba(255,255,255,.08)', display: 'inline-block' }} />
              <span style={{ color: 'var(--t2)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap panel */}
      <div className="card" style={{ width: 440, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', padding: 0 }}>
        {/* Header */}
        <div className="ap-panel-hdr">
          <div className="ap-panel-hdr-title">AGB por classe de prioridade</div>
          <div className="ap-panel-hdr-sub">tC/ha — Top 15 municípios por biomassa total</div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {loadingHeat ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, fontSize: 11, color: 'var(--t3)' }}>
              Carregando dados…
            </div>
          ) : (
            <BiomassaHeatmap data={heatmap ?? []} />
          )}
        </div>

        {/* Color scale footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--sep)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--t3)' }}>
            <span>0</span>
            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: `linear-gradient(to right, rgba(255,255,255,.04), #F59E0B, #10B981, #047857)`,
              border: '1px solid rgba(255,255,255,.06)',
            }} />
            <span>130 tC/ha</span>
          </div>
        </div>
      </div>
    </div>
  )
}
