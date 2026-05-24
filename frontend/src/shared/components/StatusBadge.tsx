import type { CSSProperties } from 'react'

interface Props {
  live: boolean
  liveLabel?: string
  staticLabel?: string
}

const BASE: CSSProperties = {
  fontSize: 9, padding: '1px 5px', borderRadius: 999, fontWeight: 700,
  letterSpacing: '.04em', marginLeft: 6, verticalAlign: 'middle',
}

export function StatusBadge({ live, liveLabel = 'AO VIVO', staticLabel = 'ESTÁTICO' }: Props) {
  return (
    <span style={{
      ...BASE,
      background: live ? 'var(--aut-bg)' : 'var(--bg3)',
      color:      live ? 'var(--aut)'    : 'var(--t3)',
    }}>
      {live ? liveLabel : staticLabel}
    </span>
  )
}
