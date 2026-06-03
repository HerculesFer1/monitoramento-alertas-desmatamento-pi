/**
 * AnaliseIADropdown.tsx — Botão "Analisar com IA" com submenu.
 *
 * Cada provedor (ChatGPT, Gemini, Claude):
 *   1. Constrói o briefing markdown
 *   2. Copia para a área de transferência
 *   3. Abre nova aba com a IA + prompt curto orientador
 *
 * "Copiar briefing" só copia sem abrir IA — útil para colar em outro
 * destino (Notion, doc, etc).
 *
 * Pontos críticos:
 *   - Limite prático de URL para query string ≈ 4 KB. O briefing pode ser
 *     maior — por isso a estratégia é: clipboard com briefing inteiro +
 *     prompt curto na URL pedindo para o usuário colar.
 *   - Fluxo `window.open` requer click do usuário (popup blocker).
 */
import { useState, useRef, useEffect } from 'react'
import { Sparkles, ChevronDown, Check, Copy, ExternalLink } from 'lucide-react'
import type { ReportSnapshot } from './types'
import { buildBriefingMarkdown, buildPromptOrientador } from './briefing'

interface Provedor {
  id:    'chatgpt' | 'gemini' | 'claude' | 'copy'
  nome:  string
  url?:  (prompt: string) => string
  cor:   string
}

const PROVEDORES: Provedor[] = [
  {
    id: 'chatgpt',
    nome: 'ChatGPT',
    url: (p) => `https://chat.openai.com/?q=${encodeURIComponent(p)}`,
    cor: '#10A37F',
  },
  {
    id: 'gemini',
    nome: 'Gemini',
    url: (p) => `https://gemini.google.com/app?text=${encodeURIComponent(p)}`,
    cor: '#4285F4',
  },
  {
    id: 'claude',
    nome: 'Claude',
    url: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
    cor: '#D97706',
  },
  {
    id: 'copy',
    nome: 'Copiar briefing',
    cor: '#6B7280',
  },
]

interface Props {
  snapshot: ReportSnapshot
}

export function AnaliseIADropdown({ snapshot }: Props) {
  const [open, setOpen]       = useState(false)
  const [copied, setCopied]   = useState<string | null>(null)
  const wrapRef               = useRef<HTMLDivElement>(null)

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

  async function acionar(p: Provedor) {
    const briefing = buildBriefingMarkdown(snapshot)
    try {
      await navigator.clipboard.writeText(briefing)
    } catch (err) {
      console.warn('Clipboard indisponível:', err)
    }
    setCopied(p.id)
    setTimeout(() => setCopied(null), 2200)

    if (p.url) {
      const prompt = buildPromptOrientador(snapshot)
      window.open(p.url(prompt), '_blank', 'noopener,noreferrer')
    }

    // Mantém menu aberto por 1.2s para o usuário ver o "Copiado".
    setTimeout(() => setOpen(false), 1200)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
          border: 'none',
          color: '#FFFFFF',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 2px 8px rgba(99,102,241,.35)',
          transition: 'transform .12s, box-shadow .12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform   = 'translateY(-1px)'
          e.currentTarget.style.boxShadow   = '0 4px 14px rgba(99,102,241,.45)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,.35)'
        }}
      >
        <Sparkles size={14} />
        <span>Analisar com IA</span>
        <ChevronDown size={12} style={{ opacity: .85, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Escolha o assistente de IA"
          style={{
            position: 'absolute', top: '100%', right: 0,
            marginTop: 8,
            minWidth: 240,
            padding: 6,
            background: 'var(--bg3)',
            border: '1px solid var(--sep)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08)',
            zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 2,
            animation: 'ia-pop-in .16s cubic-bezier(.2,.7,.2,1)',
          }}
        >
          <div style={{
            padding: '6px 10px 8px',
            fontSize: 10, color: 'var(--t3)',
            letterSpacing: '.06em', textTransform: 'uppercase',
          }}>
            Briefing → IA externa
          </div>

          {PROVEDORES.map(p => (
            <button
              key={p.id}
              role="menuitem"
              onClick={() => acionar(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px',
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
                e.currentTarget.style.background = 'rgba(99,102,241,.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: `${p.cor}22`, color: p.cor,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {p.id === 'copy' ? <Copy size={12} /> : <Sparkles size={12} />}
              </span>
              <span style={{ flex: 1 }}>{p.nome}</span>
              {copied === p.id ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 11 }}>
                  <Check size={12} />
                  <span>Copiado</span>
                </span>
              ) : p.url ? (
                <ExternalLink size={11} style={{ color: 'var(--t3)' }} />
              ) : null}
            </button>
          ))}

          <div style={{
            padding: '8px 10px 6px',
            fontSize: 10, color: 'var(--t3)', lineHeight: 1.5,
            borderTop: '1px solid var(--sep)', marginTop: 4,
          }}>
            O briefing é copiado para a área de transferência. Cole no chat da IA escolhida para iniciar a análise.
          </div>

          <style>{`
            @keyframes ia-pop-in {
              from { transform: translateY(-4px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
