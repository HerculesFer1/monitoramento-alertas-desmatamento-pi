/**
 * useMunicipioSelect.ts
 * Encapsula a lógica de seleção de município:
 *   - Atualiza Zustand store
 *   - Aciona fitBounds no mapa MapLibre GL
 *   - Filtra features para mostrar só o selecionado
 */
import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { Map as MapLibreMap, LngLatBoundsLike } from 'maplibre-gl'
import { useAppStore } from '../../../core/store/useAppStore'
import type { MunicipioSelecionado } from '../types'
import { LAYER_IDS } from '../types'

export function useMunicipioSelect(mapRef: RefObject<MapLibreMap | null>) {
  const setSelectedMunicipio = useAppStore((s) => s.setSelectedMunicipio)
  const setActiveLayerIds    = useAppStore((s) => s.setActiveLayerIds)
  const activeLayerIds       = useAppStore((s) => s.activeLayerIds)

  const select = useCallback(
    (municipio: MunicipioSelecionado) => {
      const map = mapRef.current
      if (!map) return

      // 1. Atualizar store
      setSelectedMunicipio(municipio)

      // 2. Zoom fitBounds com animação
      map.fitBounds(municipio.bbox as LngLatBoundsLike, {
        padding:  { top: 60, bottom: 60, left: 60, right: 60 },
        duration: 800,
        maxZoom:  13,
      })

      // 3. Filtrar layer de preenchimento para mostrar só o selecionado
      if (map.getLayer(LAYER_IDS.MUNICIPIOS_FILL)) {
        map.setFilter(LAYER_IDS.MUNICIPIOS_FILL, ['==', ['get', 'cod'], municipio.cod])
      }

      // 4. Highlight layer do município selecionado
      if (map.getLayer(LAYER_IDS.SELECTED_FILL)) {
        map.setFilter(LAYER_IDS.SELECTED_FILL, ['==', ['get', 'cod'], municipio.cod])
        map.setLayoutProperty(LAYER_IDS.SELECTED_FILL, 'visibility', 'visible')
      }
    },
    [mapRef, setSelectedMunicipio, setActiveLayerIds, activeLayerIds],
  )

  const clear = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    setSelectedMunicipio(null)

    // Remover filtro → mostrar todos municípios
    if (map.getLayer(LAYER_IDS.MUNICIPIOS_FILL)) {
      map.setFilter(LAYER_IDS.MUNICIPIOS_FILL, null)
    }

    // Ocultar highlight
    if (map.getLayer(LAYER_IDS.SELECTED_FILL)) {
      map.setLayoutProperty(LAYER_IDS.SELECTED_FILL, 'visibility', 'none')
    }

    // Voltar ao extent do Piauí
    map.fitBounds(
      [[-45.9, -10.95], [-40.37, -2.74]] as LngLatBoundsLike,
      { padding: 40, duration: 600 },
    )
  }, [mapRef, setSelectedMunicipio])

  return { select, clear }
}
