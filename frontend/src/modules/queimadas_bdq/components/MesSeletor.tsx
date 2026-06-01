import { useAppStore } from '../../../core/store/useAppStore'
import { MESES_LABELS } from '../types'

export function MesSeletor() {
  const selectedMes    = useAppStore(s => s.selectedMes)
  const setSelectedMes = useAppStore(s => s.setSelectedMes)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Mês:</span>
      <select
        value={selectedMes ?? ''}
        onChange={e => setSelectedMes(e.target.value ? Number(e.target.value) : null)}
        style={{
          background:   'var(--bg2)',
          border:       '1px solid rgba(255,255,255,.1)',
          borderRadius: 6,
          color:        'var(--t1)',
          fontSize:     11,
          padding:      '3px 8px',
          cursor:       'pointer',
          outline:      'none',
        }}
      >
        <option value="">Todos</option>
        {Object.entries(MESES_LABELS).map(([num, label]) => (
          <option key={num} value={num}>{label}</option>
        ))}
      </select>
    </div>
  )
}
