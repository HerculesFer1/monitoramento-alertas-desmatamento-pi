import { CLASSE_COLORS, CLASSE_LABELS } from '../types'
import type { ClassePrioridade } from '../types'

interface Props {
  classe: number | null
  size?:  'sm' | 'md'
}

export function PrioridadeBadge({ classe, size = 'md' }: Props) {
  if (!classe || !(classe in CLASSE_COLORS)) return null

  const cls    = classe as ClassePrioridade
  const color  = CLASSE_COLORS[cls]
  const label  = CLASSE_LABELS[cls]
  const fSize  = size === 'sm' ? 9 : 10
  const px     = size === 'sm' ? '4px 7px' : '4px 9px'

  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           4,
      background:    `${color}22`,
      border:        `1px solid ${color}55`,
      borderRadius:  4,
      padding:       px,
      fontSize:      fSize,
      fontWeight:    600,
      color,
      whiteSpace:    'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}
