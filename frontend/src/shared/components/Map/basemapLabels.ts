/**
 * basemapLabels.ts — Helpers compartilhados de basemap.
 *
 * hideNonCapitalLabels — esconde rótulos de cidades pequenas nos estilos
 * CartoCDN Positron / Dark Matter, mantendo capitais, estados e país.
 *
 * Estratégia: a CartoCDN usa nomes de layer previsíveis com o sufixo da
 * `class` OpenMapTiles (`place_town`, `place_village_z14`, etc). Em vez de
 * mexer no `filter` — que mistura legacy e expression nas layers da Carto
 * e gera erros de validação — escondemos as layers inteiras via
 * `setLayoutProperty('visibility', 'none')`. Mais cirúrgico, sem efeitos
 * colaterais.
 *
 * Renomeado para "basemapLabels" (em vez de "basemap") para evitar colisão
 * case-insensitive no Windows com BaseMap.tsx (que exporta `MapView`).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'

// Substrings em IDs de layer que indicam cidade pequena / bairro.
const PADROES_OCULTAR = ['town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood']

/**
 * Esconde layers de rótulo de cidades pequenas no basemap atual.
 * Idempotente — deve ser pendurado em `style.load` para reaplicar quando
 * o tema é trocado (light/dark recarrega o style por completo).
 */
export function hideNonCapitalLabels(map: MapLibreMap): void {
  const style = map.getStyle()
  if (!style?.layers) return

  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const id = layer.id.toLowerCase()
    if (!id.startsWith('place_')) continue
    if (!PADROES_OCULTAR.some(p => id.includes(p))) continue
    try {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    } catch {
      // alguns estilos podem rejeitar — ignora silenciosamente
    }
  }
}
