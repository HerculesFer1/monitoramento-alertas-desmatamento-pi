/**
 * VisaoGeralView.tsx
 * Panorama do estado: mapa coroplético das 5 classes de prioridade + KPIs.
 * Responde: "Onde está a floresta remanescente mais valiosa a proteger?"
 */
import { useRef, useEffect, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, GeoJSONSource, Popup } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }                    from '../../../core/store/useAppStore'
import { useVisaoGeral, useAreasGeoJson } from '../hooks/useAreasData'
import type { BboxState } from '../hooks/useAreasData'
import { useMunicipioSelect }             from '../hooks/useMunicipioSelect'
import { ClasseBarChart }                 from '../components/ClasseBarChart'
import { PeriodBadge }                    from '../components/PeriodBadge'
import { LAYER_IDS } from '../types'
import type { MunicipioFeatureProps } from '../types'
import { fmtHa } from '../../../core/lib/constants'
import { hideNonCapitalLabels } from '../../../shared/components/Map/basemapLabels'

export function VisaoGeralView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)
  const geojsonRef   = useRef<FeatureCollection | null>(null)
  const popupRef     = useRef<Popup | null>(null)
  const [mapBbox, setMapBbox] = useState<BboxState | null>(null)

  const anoFiltro         = useAppStore((s) => s.anoFiltro)
  const theme             = useAppStore((s) => s.theme)
  const selectedMunicipio = useAppStore((s) => s.selectedMunicipio)
  const { select, clear } = useMunicipioSelect(mapRef)

  const { data: visaoGeral, isLoading: loadingKpis } = useVisaoGeral(anoFiltro)
  const { data: geojson,    isLoading: loadingMap  } = useAreasGeoJson(anoFiltro, mapBbox)

  const mapStyle = theme === 'light'
    ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

  // ── Init map (once) ──────────────────────────────────────────────────────
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

    // Esconde rótulos de cidades pequenas (re-aplica em troca de tema).
    map.on('style.load', () => hideNonCapitalLabels(map))

    // Rastreia viewport para bbox-aware GeoJSON (Migration 011)
    const trackBbox = () => {
      const b = map.getBounds()
      setMapBbox({ xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth(), zoom: Math.floor(map.getZoom()) })
    }
    map.on('load',    trackBbox)
    map.on('moveend', trackBbox)

    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactive theme → update map style ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    popupRef.current?.remove()
    map.setStyle(mapStyle)
    map.once('styledata', () => {
      if (geojsonRef.current) _addLayers(map, geojsonRef.current)
    })
  }, [mapStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync geojsonRef ──────────────────────────────────────────────────────
  useEffect(() => { if (geojson) geojsonRef.current = geojson }, [geojson])

  // ── Add/update GeoJSON layers ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return
    const load = () => _addLayers(map, geojson)
    map.isStyleLoaded() ? load() : map.once('styledata', load)
  }, [geojson]) // eslint-disable-line react-hooks/exhaustive-deps

  function _addLayers(map: MapLibreMap, data: FeatureCollection) {
    const SRC = 'municipios-source'
    const src = map.getSource(SRC)
    if (src) { (src as GeoJSONSource).setData(data); return }

    map.addSource(SRC, { type: 'geojson', data })

    // Choropleth por pressão de desmatamento PRODES (area_desmat_ha).
    // Razão: classe_max_prioridade = 5 para todos os 224 municípios (sem variação espacial).
    // area_desmat_ha discrimina hotspots reais e responde "onde avança o desmatamento?".
    map.addLayer({
      id: LAYER_IDS.PRIORIDADE_FILL, type: 'fill', source: SRC,
      paint: {
        'fill-color': [
          'step', ['coalesce', ['get', 'area_desmat_ha'], 0],
          '#1a9850',  // 0 ha        → verde (sem desmatamento detectado)
          1,   '#fee08b',  // 1–50 ha    → amarelo
          50,  '#fdae61',  // 50–100 ha  → laranja claro
          100, '#f46d43',  // 100–200 ha → laranja
          200, '#d73027',  // ≥ 200 ha   → vermelho
        ] as unknown as string,
        'fill-opacity': 0.82,
      },
    })
    map.addLayer({
      id: LAYER_IDS.MUNICIPIOS_LINE, type: 'line', source: SRC,
      paint: { 'line-color': 'rgba(255,255,255,0.12)', 'line-width': 0.5 },
    })

    map.on('click', LAYER_IDS.PRIORIDADE_FILL, (e) => {
      const props = e.features?.[0]?.properties as MunicipioFeatureProps
      if (!props?.cod) return
      // bbox já é array tupla — normalizado em getApGeojsonBbox (M4 da auditoria).
      select({ cod: props.cod, nome: props.nome, bbox: props.bbox })
    })

    // Hover tooltip
    map.on('mousemove', LAYER_IDS.PRIORIDADE_FILL, (e) => {
      const props = e.features?.[0]?.properties as MunicipioFeatureProps | undefined
      if (!props?.nome) return
      map.getCanvas().style.cursor = 'pointer'
      const html = `
        <div class="tt-premium" style="min-width:170px;pointer-events:none">
          <div class="tt-title">${props.nome}</div>
          <div class="tt-row">
            <span class="tt-label">Floresta</span>
            <span class="tt-val" style="color:#10B981">${fmtHa(Number(props.area_floresta_ha ?? 0))}</span>
          </div>
          <div class="tt-row">
            <span class="tt-label">Desmatado</span>
            <span class="tt-val" style="color:#EF4444">${fmtHa(Number(props.area_desmat_ha ?? 0))}</span>
          </div>
          ${props.classe_max ? `<div class="tt-row"><span class="tt-label">Prioridade máx.</span><span class="tt-val">Classe ${props.classe_max}</span></div>` : ''}
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

  const kpis      = visaoGeral?.kpis?.prodes
  const kpisDeter = visaoGeral?.kpis?.deter

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, padding: 14, overflow: 'hidden' }}>

      {/* KPI row */}
      <div className="grid-5" style={{ flexShrink: 0 }}>
        <KpiCard
          label="Floresta remanescente"
          value={loadingKpis ? '…' : fmtHa(kpis?.area_floresta_total_ha ?? 0)}
          sub="áreas prioritárias ativas"
          accent="#10B981"
          accentClass="card-aut"
          loading={loadingKpis}
        />
        <KpiCard
          label="Desmatado PRODES"
          value={loadingKpis ? '…' : fmtHa(kpis?.area_desmat_total_ha ?? 0)}
          sub="acumulado no período"
          accent="#EF4444"
          accentClass="card-irr"
          loading={loadingKpis}
        />
        <KpiCard
          label="% Desmatamento"
          value={loadingKpis ? '…' : (() => {
            const v = kpis?.pct_desmat_estado
            if (v == null) return '—%'
            // Precisão adaptativa: valores < 0.1% mostram 2 casas; ≥ 0.1% mostram 1
            return `${v < 0.1 ? v.toFixed(2) : v.toFixed(1)}%`
          })()}
          sub="do total florestal PI"
          accent="#F59E0B"
          accentClass="card-mat"
          loading={loadingKpis}
        />
        <KpiCard
          label="Municípios Classe 5"
          value={loadingKpis ? '…' : String(kpis?.n_municipios_classe_max ?? '—')}
          sub="urgência máxima de proteção"
          accent="#F97316"
          accentClass="card-reg"
          loading={loadingKpis}
        />
        <KpiCard
          label="Alertas DETER"
          value={loadingKpis ? '…' : (kpisDeter?.disponivel ? fmtHa(kpisDeter.area_alertas_ha ?? 0) : '—')}
          sub={!loadingKpis
            ? (kpisDeter?.disponivel
                ? `${kpisDeter.n_municipios_com_alerta} municípios afetados`
                : 'Dados não disponíveis')
            : undefined}
          accent="#6366F1"
          accentClass="card-indigo"
          loading={loadingKpis}
          live={kpisDeter?.disponivel}
        />
      </div>

      {/* Map + chart */}
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>

        {/* Map */}
        <div className="ap-map-wrap">
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

          {loadingMap && (
            <div className="ap-map-overlay">Carregando mapa…</div>
          )}

          {selectedMunicipio && (
            <button className="ap-back-btn" onClick={clear}>← Estado</button>
          )}

          {!selectedMunicipio && !loadingMap && (
            <div className="ap-hint-pill">Clique em um município para detalhar</div>
          )}

          <PeriodBadge
            ano={anoFiltro}
            className="absolute bottom-4 right-4 z-10"
          />
        </div>

        {/* Chart panel */}
        <div className="card" style={{ width: 284, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)', marginBottom: 3 }}>
              Por classe de prioridade
            </div>
            {selectedMunicipio && (
              <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>
                {selectedMunicipio.nome}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <ClasseBarChart data={visaoGeral?.por_classe ?? []} height={220} />
          </div>

          {/* Legenda — pressão de desmatamento PRODES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)', marginBottom: 2 }}>
              Desmat. PRODES (ha)
            </div>
            {([
              { color: '#1a9850', label: 'Sem desmatamento' },
              { color: '#fee08b', label: '1 – 50 ha' },
              { color: '#fdae61', label: '50 – 100 ha' },
              { color: '#f46d43', label: '100 – 200 ha' },
              { color: '#d73027', label: '≥ 200 ha' },
            ]).map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: 'var(--t2)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KpiCard local — premium version ──────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = 'var(--aut)', accentClass = '', loading = false, live,
}: {
  label:       string
  value:       string
  sub?:        string
  accent?:     string
  accentClass?: string
  loading?:    boolean
  live?:       boolean
}) {
  return (
    <div className={`kpi-card ${accentClass}`}>
      {/* Label row */}
      <div className="kpi-label" style={{ gap: 5 }}>
        {live
          ? <span className="dot-live" />
          : <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, display: 'inline-block' }} />
        }
        <span style={{ fontSize: 10, letterSpacing: '.04em' }}>{label}</span>
      </div>

      {/* Value */}
      {loading
        ? <div className="skeleton" style={{ height: 24, width: '70%', marginTop: 4 }} />
        : (
          <div className="kpi-value" style={{ fontSize: 22, color: accent, letterSpacing: '-.01em', lineHeight: 1.1, marginTop: 2 }}>
            {value}
          </div>
        )
      }

      {/* Sub-label */}
      {sub && !loading && (
        <div className="kpi-sub" style={{ fontSize: 10, marginTop: 2, color: 'var(--t3)' }}>{sub}</div>
      )}
    </div>
  )
}
