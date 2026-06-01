/**
 * LayerTogglePanel.tsx
 * Painel de checkboxes para toggle de camadas MapLibre GL.
 * Operação instantânea via setLayoutProperty — sem re-render do mapa.
 */
import { LAYER_IDS, LAYER_CONFIG } from '../types'
import type { LayerId } from '../types'

interface Props {
  onToggle:  (id: LayerId) => void
  isVisible: (id: LayerId) => boolean
}

// Camadas exibidas no painel (SELECTED é automático — não expor)
const TOGGLEABLE_LAYERS: LayerId[] = [
  LAYER_IDS.PRIORIDADE_FILL,
  LAYER_IDS.MUNICIPIOS_LINE,
  LAYER_IDS.FLORESTA_FILL,
  LAYER_IDS.PRODES_FILL,
  LAYER_IDS.BIOMASSA_HEAT,
]

export function LayerTogglePanel({ onToggle, isVisible }: Props) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', color: 'var(--t3)',
        marginBottom: 10,
      }}>
        Camadas
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TOGGLEABLE_LAYERS.map((id) => {
          const cfg     = LAYER_CONFIG[id]
          const visible = isVisible(id)
          return (
            <label
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer',
              }}
            >
              {/* Custom checkbox */}
              <span
                onClick={() => onToggle(id)}
                style={{
                  width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                  border: `1px solid ${visible ? cfg.color : 'rgba(255,255,255,.15)'}`,
                  background: visible ? `${cfg.color}33` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all .15s',
                }}
                aria-role="checkbox"
                aria-checked={visible}
              >
                {visible && (
                  <span style={{
                    width: 6, height: 6, borderRadius: 2,
                    background: cfg.color, display: 'block',
                  }} />
                )}
              </span>

              {/* Color swatch */}
              <span style={{
                width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                background: cfg.color,
                opacity: visible ? 1 : 0.35,
              }} />

              {/* Label */}
              <span style={{
                fontSize: 11,
                color: visible ? 'var(--t1)' : 'var(--t3)',
                transition: 'color .15s',
              }}>
                {cfg.label}
              </span>
            </label>
          )
        })}
      </div>

      <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 10, lineHeight: 1.5 }}>
        Camadas pesadas (floresta, PRODES) carregam após selecionar município.
      </p>
    </div>
  )
}
