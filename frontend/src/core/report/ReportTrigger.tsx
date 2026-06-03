/**
 * ReportTrigger.tsx — Dropdown "Relatório" no topbar.
 *
 * Três opções:
 *   1. Abrir relatório web   — abre ReportPage no <main> (rota interna).
 *   2. Baixar PDF             — abre o modal de preview e gera jsPDF.
 *   3. Analisar com IA        — copia briefing + abre ChatGPT/Gemini/Claude.
 *
 * O PDF permanece intacto (fluxo legado preservado).
 */
import { useState, useRef, useEffect } from 'react'
import { FileText, ChevronDown, FileBarChart, Download, Sparkles, Copy, Check, ExternalLink } from 'lucide-react'
import { ReportPreviewModal } from './ReportPreviewModal'
import { useReportData }      from './useReportData'
import { useReportPage }      from './useReportPage'
import { buildBriefingMarkdown, buildPromptOrientador } from './briefing'

const PROVEDORES = [
  { id: 'chatgpt' as const, nome: 'ChatGPT', url: (p: string) => `https://chat.openai.com/?q=${encodeURIComponent(p)}`,    cor: '#10A37F' },
  { id: 'gemini'  as const, nome: 'Gemini',  url: (p: string) => `https://gemini.google.com/app?text=${encodeURIComponent(p)}`, cor: '#4285F4' },
  { id: 'claude'  as const, nome: 'Claude',  url: (p: string) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,         cor: '#D97706' },
]

export function ReportTrigger() {
  const [open,     setOpen]      = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [copied,   setCopied]    = useState<string | null>(null)
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
  async function acionarIA(prov: typeof PROVEDORES[number] | 'copy') {
    if (!snapshot) return
    const briefing = buildBriefingMarkdown(snapshot)
    try {
      await navigator.clipboard.writeText(briefing)
    } catch (err) { console.warn('Clipboard indisponível:', err) }
    const tag = prov === 'copy' ? 'copy' : prov.id
    setCopied(tag)
    setTimeout(() => setCopied(null), 2200)
    if (prov !== 'copy') {
      const prompt = buildPromptOrientador(snapshot)
      window.open(prov.url(prompt), '_blank', 'noopener,noreferrer')
    }
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
          <ChevronDown size={10} strokeWidth={1.8} style={{ opacity: .7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
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
              Analisar com IA externa
            </div>

            {PROVEDORES.map(p => (
              <Item
                key={p.id}
                icon={<Sparkles size={13} strokeWidth={1.8} />}
                label={p.nome}
                hint="Copia briefing + abre nova aba"
                onClick={() => acionarIA(p)}
                accent={p.cor}
                trailing={
                  copied === p.id
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 10 }}>
                        <Check size={11} /><span>Copiado</span>
                      </span>
                    : <ExternalLink size={11} style={{ color: 'var(--t3)' }} />
                }
              />
            ))}
            <Item
              icon={<Copy size={13} strokeWidth={1.8} />}
              label="Copiar briefing"
              hint="Para colar em outro destino"
              onClick={() => acionarIA('copy')}
              accent="#6B7280"
              trailing={copied === 'copy'
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
