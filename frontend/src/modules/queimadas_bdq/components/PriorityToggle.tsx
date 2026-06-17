/**
 * PriorityToggle.tsx — queimadas_bdq
 * Toggle flutuante "Prioridade alta" — destaca municípios em alta pressão
 * de fogo dentro de áreas prioritárias (classe_max_queimada ∈ {4,5} E
 * pct_area_prioritaria > 50%). Reutilizado em VisaoGeral e Municipal.
 */
import { AlertTriangle } from 'lucide-react'

export function PriorityToggle({ active, disabled, count, onToggle }: {
  active:   boolean
  disabled: boolean
  count:    number
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      title={active
        ? `${count} municípios em alta prioridade — clique para ver todos`
        : 'Destacar apenas municípios em alta prioridade (AHP 4-5)'}
      style={{
        position: 'absolute', top: 10, left: 10, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 7,
        fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'rgba(239, 68, 68, 0.92)' : 'var(--bg3)',
        color: active ? '#FFFFFF' : 'var(--t2)',
        border: `1px solid ${active ? '#EF4444' : 'var(--sep)'}`,
        boxShadow: active
          ? '0 2px 8px rgba(239,68,68,.35), 0 1px 0 rgba(0,0,0,.05)'
          : '0 2px 8px rgba(0,0,0,.12)',
        opacity: disabled ? 0.5 : 1,
        transition: 'all .15s',
      }}
    >
      <AlertTriangle size={12} strokeWidth={2} />
      <span>{active ? `Atenção · ${count}` : 'Prioridade alta'}</span>
    </button>
  )
}
