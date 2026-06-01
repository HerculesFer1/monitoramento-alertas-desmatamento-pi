/**
 * VisaoGeralView.tsx
 * Panorama do estado: mapa coroplético das 5 classes de prioridade + KPIs.
 * Responde: "Onde está a floresta remanescente mais valiosa a proteger?"
 */
import { useRef, useEffect } from 'react'
import { Map as MapLibreMap, NavigationControl, GeoJSONSource, Popup } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore }                    from '../../../core/store/useAppStore'
import { useVisaoGeral, useAreasGeoJson } from '../hooks/useAreasData'
import { useMunicipioSelect }             from '../hooks/useMunicipioSelect'
import { ClasseBarChart }                 from '../components/ClasseBarChart'
import { PeriodBadge }                    from '../components/PeriodBadge'
import { LAYER_IDS, CLASSE_COLORS, CLASSE_LABELS } from '../types'
import type { MunicipioFeatureProps, ClassePrioridade } from '../types'
import { fmtHa } from '../../../core/lib/constants'

export function VisaoGeralView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MapLibreMap | null>(null)
  const geojsonRef   = useRef<FeatureCollection | null>(null)
  const popupRef     = useRef<Popup | null>(null)

  const anoFiltro         = useAppStore((s) => s.anoFiltro)
  const theme             = useAppStore((s) => s.theme)
  const selectedMunicipio = useAppStore((s) => s.selectedMunicipio)
  const { select, clear } = useMunicipioSelect(mapRef)

  const { data: visaoGeral, isLoading: loadingKpis } = useVisaoGeral(anoFiltro)
  const { data: geojson,    isLoading: loadingMap  } = useAreasGeoJson(anoFiltro)

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

    map.addLayer({
      id: LAYER_IDS.PRIORIDADE_FILL, type: 'fill', source: SRC,
      paint: {
        'fill-color': [
          'match', ['get', 'classe_max'],
          ...Object.entries(CLASSE_COLORS).flatMap(([k, v]) => [Number(k), v]),
          'rgba(255,255,255,.04)',
        ] as unknown as string,
        'fill-opacity': 0.78,
      },
    })
    map.addLayer({
      id: LAYER_IDS.MUNICIPIOS_LINE, type: 'line', source: SRC,
      paint: { 'line-color': 'rgba(255,255,255,0.12)', 'line-width': 0.5 },
    })

    map.on('click', LAYER_IDS.PRIORIDADE_FILL, (e) => {
      const props = e.features?.[0]?.properties as MunicipioFeatureProps
      if (!props?.cod) return
      const bbox = typeof props.bbox === 'string'
        ? JSON.parse(props.bbox) as [[number, number], [number, number]]
        : props.bbox
      select({ cod: props.cod, nome: props.nome, bbox })
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
          value={loadingKpis ? '…' : `${kpis?.pct_desmat_estado?.toFixed(1) ?? '—'}%`}
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

          {/* Legenda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {([1, 2, 3, 4, 5] as ClassePrioridade[]).map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: CLASSE_COLORS[c], display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: 'var(--t2)' }}>
                  {c} — {CLASSE_LABELS[c]}
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
