// @ts-nocheck
/**
 * useLayerToggle.ts
 * Toggle de visibilidade das camadas MapLibre GL sem re-render do mapa.
 * Usa setLayoutProperty — operação instantânea, sem recarregar source.
 */
import { useCallback } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useAppStore } from '../../../core/store/useAppStore'
import type { LayerId } from '../types'

export function useLayerToggle(mapRef: React.RefObject<MapLibreMap | null>) {
  const activeLayerIds    = useAppStore((s) => s.activeLayerIds)
  const toggleLayerStore  = useAppStore((s) => s.toggleLayer)

  const toggle = useCallback(
    (layerId: LayerId) => {
      const map = mapRef.current
      if (!map || !map.getLayer(layerId)) return

      const current = map.getLayoutProperty(layerId, 'visibility') ?? 'visible'
      const next    = current === 'visible' ? 'none' : 'visible'

      map.setLayoutProperty(layerId, 'visibility', next)
      toggleLayerStore(layerId)
    },
    [mapRef, toggleLayerStore],
  )

  const isVisible = useCallback(
    (layerId: LayerId): boolean => activeLayerIds.includes(layerId),
    [activeLayerIds],
  )

  const showAll = useCallback(
    (layerIds: LayerId[]) => {
      const map = mapRef.current
      if (!map) return
      layerIds.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'visible')
        }
      })
      // Não usa store aqui — sincronizado no componente pai
    },
    [mapRef],
  )

  const hideAll = useCallback(
    (layerIds: LayerId[]) => {
      const map = mapRef.current
      if (!map) return
      layerIds.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none')
        }
      })
    },
    [mapRef],
  )

  return { toggle, isVisible, showAll, hideAll }
}
