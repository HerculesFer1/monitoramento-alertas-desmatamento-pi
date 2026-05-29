// @ts-nocheck
/**
 * BiomassaView.tsx — Tab Biomassa (areas_prioritarias)
 *
 * Responde à Questão 3: "Onde está o maior estoque de carbono florestal intacto?"
 *
 * Layout:
 *   Esquerda: mapa coroplético municipal colorido por biomassa_floresta_tc
 *   Direita:  heatmap AGB médio (tC/ha) por classe × top-15 municípios
 */
import React, { useRef, useEffect } from 'react'
import { Map as MapLibreMap, NavigationControl, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }  from '../../../core/store/useAppStore'
import { useAreasGeoJson } from '../hooks/useAreasData'
import { useBiomassaHeatmap, type HeatmapRow } from '../hooks/useBiomassaData'
import { LAYER_IDS, CLASSE_LABELS, type ClassePrioridade } from '../types'

const CLASSES: ClassePrioridade[] = [1, 2, 3, 4, 5]

// Escala de cor para o heatmap de AGB (tC/ha) — YlGn
const AGB_MIN = 0
const AGB_MAX = 130

function agbToColor(agb: number | null): string {
  if (agb === null || agb === 0) return '#f3f4f6'
  const t = Math.min(Math.max((agb - AGB_MIN) / (AGB_MAX - AGB_MIN), 0), 1)
  // Interpolação YlGn: #ffffcc → #78c679 → #006837
  const stops: [number, number, number][] = [
    [255, 255, 204],  // t=0
    [120, 198, 121],  // t=0.5
    [0,   104,  55],  // t=1
  ]
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
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        Sem dados de biomassa disponíveis
      </div>
    )
  }

  return (
    <table className="w-full border-collapse" style={{ fontSize: 10 }}>
      <thead>
        <tr>
          <th
            className="text-left font-medium text-gray-600 pb-1 pr-2"
            style={{ minWidth: 100, maxWidth: 120 }}
          >
            Município
          </th>
          {CLASSES.map((cls) => (
            <th key={cls} className="text-center font-medium text-gray-600 pb-1 px-0.5">
              <div>Cl. {cls}</div>
              <div className="text-gray-400 font-normal" style={{ fontSize: 8 }}>
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
              className="pr-2 py-0.5 text-gray-700 truncate font-medium"
              title={row.municipio_nome}
              style={{ maxWidth: 120 }}
            >
              {row.municipio_nome}
            </td>
            {CLASSES.map((cls) => {
              const cell = row.agb_por_classe[cls]
              const agb  = cell?.agb ?? null
              const dark = agb !== null && agb > 60
              return (
                <td key={cls} className="px-0.5 py-0.5">
                  <div
                    className="rounded text-center"
                    style={{
                      backgroundColor: agbToColor(agb),
                      color:           dark ? 'white' : '#374151',
                      padding:         '2px 0',
                      minWidth:        44,
                      fontSize:        9,
                    }}
                    title={
                      agb !== null
                        ? `${row.municipio_nome} – Classe ${cls}: ${agb.toFixed(1)} tC/ha`
                        : `${row.municipio_nome} – Classe ${cls}: sem dados`
                    }
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

  const anoFiltro = useAppStore((s) => s.anoFiltro)

  const { data: geojson,  isLoading: loadingMap  } = useAreasGeoJson(anoFiltro)
  const { data: heatmap,  isLoading: loadingHeat } = useBiomassaHeatmap(anoFiltro)

  // ── Inicializar mapa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    mapRef.current = new MapLibreMap({
      container:        mapContainer.current,
      style:            'https://demotiles.maplibre.org/style.json',
      bounds:           [[-45.9, -10.95], [-40.37, -2.74]],
      fitBoundsOptions: { padding: 40 },
    })
    mapRef.current.addControl(new NavigationControl(), 'top-right')

    return () => {
      popupRef.current?.remove()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Carregar GeoJSON → camada coroplética ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return
    if (!map.isStyleLoaded()) {
      map.once('load', () => _addLayers(map, geojson))
    } else {
      _addLayers(map, geojson)
    }
  }, [geojson])

  function _addLayers(map: MapLibreMap, data: any) {
    const SRC = 'biomassa-source'

    if (map.getSource(SRC)) {
      ;(map.getSource(SRC) as any).setData(data)
      return
    }

    map.addSource(SRC, { type: 'geojson', data })

    // Choropleth por biomassa_total_tc (tC)
    map.addLayer({
      id:     LAYER_IDS.BIOMASSA_HEAT,
      type:   'fill',
      source: SRC,
      paint:  {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'biomassa_total_tc'],
          0,         '#f7fcf5',
          500_000,   '#c7e9c0',
          2_000_000, '#74c476',
          8_000_000, '#31a354',
          20_000_000,'#006d2c',
        ],
        'fill-opacity': 0.82,
      },
    })

    // Bordas municipais
    map.addLayer({
      id:     LAYER_IDS.MUNICIPIOS_LINE,
      type:   'line',
      source: SRC,
      paint:  { 'line-color': '#374151', 'line-width': 0.5 },
    })

    // Tooltip ao passar o mouse
    map.on('mousemove', LAYER_IDS.BIOMASSA_HEAT, (e) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      map.getCanvas().style.cursor = 'pointer'

      const bio_m = props.biomassa_total_tc ?? 0
      const agb   = props.agb_medio_tc_ha  ?? 0
      const html  = `
        <div style="font-size:11px;min-width:160px">
          <strong>${props.nome}</strong><br/>
          Biomassa total: <b>${Number(bio_m).toLocaleString('pt-BR')} tC</b><br/>
          AGB médio: <b>${Number(agb).toFixed(1)} tC/ha</b><br/>
          Floresta: <b>${Number(props.area_floresta_ha ?? 0).toLocaleString('pt-BR')} ha</b>
        </div>`

      if (!popupRef.current) {
        popupRef.current = new Popup({ closeButton: false, closeOnClick: false })
      }
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    })

    map.on('mouseleave', LAYER_IDS.BIOMASSA_HEAT, () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-3 p-4">

      {/* Mapa coroplético */}
      <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {loadingMap && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 text-xs text-gray-500">
            Carregando mapa…
          </div>
        )}

        {/* Legenda */}
        <div className="absolute bottom-8 right-2 bg-white/95 rounded shadow px-2 py-1.5 text-xs space-y-0.5">
          <div className="font-semibold text-gray-700 mb-1 text-xs">Biomassa florestal (tC)</div>
          {[
            { color: '#006d2c', label: '> 20 MtC' },
            { color: '#31a354', label: '8 – 20 MtC' },
            { color: '#74c476', label: '2 – 8 MtC' },
            { color: '#c7e9c0', label: '500 k – 2 MtC' },
            { color: '#f7fcf5', label: '< 500 ktC' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Título */}
        <div className="absolute top-2 left-2 bg-white/90 rounded px-2 py-1 text-xs font-medium text-gray-700 shadow">
          Estoque de carbono florestal por município
        </div>
      </div>

      {/* Heatmap AGB por classe */}
      <div className="w-[420px] flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-800">AGB por classe de prioridade</div>
          <div className="text-xs text-gray-500 mt-0.5">
            tC/ha — Top 15 municípios por biomassa total
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loadingHeat ? (
            <div className="flex items-center justify-center h-32 text-xs text-gray-400">
              Carregando dados…
            </div>
          ) : (
            <BiomassaHeatmap data={heatmap ?? []} />
          )}
        </div>

        {/* Barra de cor */}
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>0</span>
            <div
              className="flex-1 h-2 rounded"
              style={{
                background:
                  'linear-gradient(to right, #ffffcc, #78c679, #006837)',
              }}
            />
            <span>130 tC/ha</span>
          </div>
        </div>
      </div>
    </div>
  )
}
