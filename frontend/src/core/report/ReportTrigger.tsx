/**
 * ReportTrigger.tsx — Dropdown "Relatório" no topbar.
 *
 * Três opções:
 *   1. Abrir relatório web   — abre ReportPage no <main> (rota interna).
 *   2. Baixar PDF             — abre o modal de preview e gera jsPDF.
 *   3. ChatGPT                — abre nova aba com o briefing inteiro no
 *                               campo de prompt (via ?q=); clipboard
 *                               serve como fallback caso a URL trunque.
 *   4. Copiar briefing        — só copia, sem abrir IA.
 *
 * O PDF permanece intacto (fluxo legado preservado).
 */
import { useState, useRef, useEffect } from 'react'
import { FileText, FileBarChart, Download, Copy, Check } from 'lucide-react'
import { ReportPreviewModal } from './ReportPreviewModal'
import { useReportData }      from './useReportData'
import { useReportPage }      from './useReportPage'
import { buildBriefingMarkdown } from './briefing'

export function ReportTrigger() {
  const [open,     setOpen]      = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [copied,   setCopied]    = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { snapshot } = useReportData()
  const { openReport } = useReportPage()

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function abrirWeb() {
    openReport()
    setOpen(false)
  }
  function abrirPdf() {
    setPdfModalOpen(true)
    setOpen(false)
  }
  async function copiarBriefing() {
    if (!snapshot) return
    const briefing = buildBriefingMarkdown(snapshot)
    try {
      await navigator.clipboard.writeText(briefing)
    } catch (err) { console.warn('Clipboard indisponível:', err) }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
    setTimeout(() => setOpen(false), 900)
  }

  return (
    <>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Opções de relatório"
          aria-label="Relatório"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 28, borderRadius: 7,
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
          <FileText size={14} strokeWidth={1.8} />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Opções de relatório"
            style={{
              position: 'absolute', top: '100%', right: 0,
              marginTop: 6,
              minWidth: 260,
              padding: 6,
              background: 'var(--bg3)',
              border: '1px solid var(--sep)',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.10)',
              zIndex: 9500,
              display: 'flex', flexDirection: 'column', gap: 2,
              animation: 'rep-pop-in .16s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            <Item
              icon={<FileBarChart size={13} strokeWidth={1.8} />}
              label="Abrir relatório web"
              hint="Visão interativa com gráficos e drill-down"
              onClick={abrirWeb}
              accent="#6366F1"
            />
            <Item
              icon={<Download size={13} strokeWidth={1.8} />}
              label="Baixar PDF"
              hint="Documento formal para arquivamento"
              onClick={abrirPdf}
              accent="#10B981"
            />

            <div style={{
              padding: '8px 10px 4px',
              fontSize: 9, color: 'var(--t3)',
              letterSpacing: '.08em', textTransform: 'uppercase',
              borderTop: '1px solid var(--sep)', marginTop: 4,
            }}>
              Briefing para IA
            </div>

            <Item
              icon={<Copy size={13} strokeWidth={1.8} />}
              label="Copiar briefing"
              hint="Cole em ChatGPT/Claude/Gemini para análise"
              onClick={copiarBriefing}
              accent="#10A37F"
              trailing={copied
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 10 }}>
                    <Check size={11} /><span>Copiado</span>
                  </span>
                : null}
            />

            <style>{`
              @keyframes rep-pop-in {
                from { transform: translateY(-4px); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
              }
            `}</style>
          </div>
        )}
      </div>

      <ReportPreviewModal open={pdfModalOpen} onClose={() => setPdfModalOpen(false)} />
    </>
  )
}

function Item({ icon, label, hint, onClick, accent, trailing }: {
  icon:     React.ReactNode
  label:    string
  hint?:    string
  onClick:  () => void
  accent:   string
  trailing?: React.ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 7,
        color: 'var(--t1)',
        cursor: 'pointer',
        fontSize: 12.5, fontWeight: 500,
        textAlign: 'left',
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${accent}10`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 7,
        background: `${accent}1A`, color: accent,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>{hint}</span>}
      </span>
      {trailing}
    </button>
  )
}
