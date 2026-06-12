/**
 * AnaliseIADropdown.tsx — Botão "Copiar briefing para IA".
 *
 * Antes oferecia abertura direta no ChatGPT via `?q=`. Removido porque o
 * briefing (3-8 KB) estourava o limite de header do servidor (HTTP 431
 * Request Header Fields Too Large), e o caminho de "abrir ChatGPT só com
 * orientador" também era frágil dependendo da sessão do usuário.
 *
 * Fluxo simplificado:
 *   1. Usuário clica em "Copiar briefing"
 *   2. Briefing inteiro vai para o clipboard
 *   3. Usuário abre o ChatGPT/Claude/Gemini de sua preferência e cola (Ctrl+V)
 */
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { ReportSnapshot } from './types'
import { buildBriefingMarkdown } from './briefing'

interface Props {
  snapshot: ReportSnapshot
}

export function AnaliseIADropdown({ snapshot }: Props) {
  const [copied, setCopied] = useState(false)

  async function copiarBriefing() {
    const briefing = buildBriefingMarkdown(snapshot)
    try {
      await navigator.clipboard.writeText(briefing)
    } catch (err) {
      console.warn('Clipboard indisponível:', err)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <button
      onClick={copiarBriefing}
      aria-label="Copiar briefing para análise por IA"
      title="Copia o briefing inteiro para o clipboard. Cole em ChatGPT/Claude/Gemini para análise."
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: copied
          ? 'linear-gradient(135deg, #10B981 0%, #34D399 100%)'
          : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
        border: 'none',
        color: '#FFFFFF',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13, fontWeight: 600,
        boxShadow: copied
          ? '0 2px 8px rgba(16,185,129,.35)'
          : '0 2px 8px rgba(99,102,241,.35)',
        transition: 'transform .12s, box-shadow .12s, background .25s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Briefing copiado · cole no ChatGPT' : 'Copiar briefing para IA'}</span>
    </button>
  )
}
