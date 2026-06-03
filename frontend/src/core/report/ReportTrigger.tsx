/**
 * ReportTrigger.tsx — Botão "Relatório" no topbar de cada módulo.
 *
 * Acessa o módulo ativo via useAppStore e abre o modal de pré-visualização.
 */
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { ReportPreviewModal } from './ReportPreviewModal'

export function ReportTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Gerar relatório do módulo ativo"
        aria-label="Gerar relatório"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 11px', borderRadius: 7,
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
          border: '1px solid rgba(0,0,0,.25)',
          background: 'rgba(0,0,0,.2)',
          color: 'var(--t2)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(99, 102, 241, .12)'
          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, .35)'
          e.currentTarget.style.color = '#A5B4FC'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,.2)'
          e.currentTarget.style.borderColor = 'rgba(0,0,0,.25)'
          e.currentTarget.style.color = 'var(--t2)'
        }}
      >
        <FileText size={12} strokeWidth={1.8} />
        <span>Relatório</span>
      </button>

      <ReportPreviewModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
