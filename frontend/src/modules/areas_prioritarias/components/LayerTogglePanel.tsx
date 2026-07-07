/**
 * LayerTogglePanel.tsx
 * Painel de checkboxes para toggle de camadas MapLibre GL.
 * Operação instantânea via setLayoutProperty — sem re-render do mapa.
 */
import { LAYER_IDS, LAYER_CONFIG, type LayerId } from '../types'

interface Props {
  onToggle:  (id: LayerId) => void
  isVisible: (id: LayerId) => boolean
}

// Camadas exibidas no painel (excluir SELECTED que é automático)
const TOGGLEABLE_LAYERS: LayerId[] = [
  LAYER_IDS.PRIORIDADE_FILL,
  LAYER_IDS.MUNICIPIOS_LINE,
  LAYER_IDS.FLORESTA_FILL,
  LAYER_IDS.PRODES_FILL,
  LAYER_IDS.BIOMASSA_HEAT,
]

export function LayerTogglePanel({ onToggle, isVisible }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
        <span>🗂</span> Camadas
      </div>
      <div className="space-y-1.5">
        {TOGGLEABLE_LAYERS.map((id) => {
          const cfg     = LAYER_CONFIG[id]
          const visible = isVisible(id)
          return (
            <label
              key={id}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggle(id)}
                className="w-3.5 h-3.5 rounded"
              />
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: cfg.color }}
              />
              <span className={`text-xs ${visible ? 'text-gray-700' : 'text-gray-400'}`}>
                {cfg.label}
              </span>
            </label>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2 leading-tight">
        Camadas pesadas (floresta, PRODES) carregam só após selecionar um município.
      </p>
    </div>
  )
}
