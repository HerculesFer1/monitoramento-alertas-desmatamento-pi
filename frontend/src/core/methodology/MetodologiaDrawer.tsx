/**
 * MetodologiaDrawer.tsx — Sidebar lateral esquerda com lista dos módulos.
 *
 * Estilo: painel estreito (~260px), sem backdrop modal, fica encostado
 * ao rail. Clique em um módulo seleciona-o; o conteúdo da metodologia
 * é renderizado no <main> via MetodologiaPage. Mantém o sidebar aberto
 * para permitir trocas rápidas entre módulos.
 *
 * Acionado pelo botão de engrenagem no PrimaryRail.
 */
import { useEffect } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { METODOLOGIAS } from './content'
import { useMetodologia } from './useMetodologia'
import type { Module } from '../store/useAppStore'

interface Props {
  open:    boolean
  onClose: () => void
}

// Modulos de analise que aparecem no menu (ordem importa)
const MODULOS_ANALISE: Module[] = [
  'mapbiomas',
  'prodes',
  'matopiba',
  'areas_prioritarias',
  'queimadas_bdq',
]

export function MetodologiaDrawer({ open, onClose }: Props) {
  const { selectedModule, select, clearSelection } = useMetodologia()

  // Fecha com ESC. Se há módulo selecionado, primeiro ESC limpa a seleção,
  // segundo ESC fecha o sidebar.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedModule) clearSelection()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, selectedModule, clearSelection, onClose])

  if (!open) return null

  return (
    <aside
      role="complementary"
      aria-label="Menu de metodologias por módulo"
      className="metodologia-sidebar"
      style={{
        position: 'fixed', top: 0, bottom: 0,
        // Encostado ao rail (largura ~56px do rail) — fica à esquerda do <main>
        left: 56,
        width: 260,
        background: 'var(--bg2, #161616)',
        borderRight: '1px solid var(--sep)',
        boxShadow: '4px 0 18px rgba(0,0,0,.25)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        animation: 'meto-slide-in-left .22s cubic-bezier(.2,.7,.2,1)',
      }}
    >
      {/* Header */}
      <header style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--sep)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Metodologia
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginTop: 2 }}>
            Selecione um módulo
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar menu de metodologia"
          style={{
            background: 'transparent', border: '1px solid var(--sep)',
            color: 'var(--t2)', cursor: 'pointer',
            borderRadius: 6, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={14} />
        </button>
      </header>

      {/* Lista de módulos */}
      <div className="ranking-scroll" style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, margin: '4px 4px 8px 4px' }}>
          Veja como cada módulo é calculado, de onde vêm os dados e o que cada número significa.
        </p>
        {MODULOS_ANALISE.map(m => {
          const meto    = METODOLOGIAS[m]
          const isActive = selectedModule === m
          return (
            <button
              key={m}
              onClick={() => select(m)}
              aria-pressed={isActive}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px',
                background: isActive ? `${meto.cor}18` : 'transparent',
                border: '1px solid',
                borderColor: isActive ? `${meto.cor}55` : 'var(--sep)',
                borderRadius: 8,
                color: 'var(--t1)',
                cursor: 'pointer',
                transition: 'all .15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = `${meto.cor}0e`
                  e.currentTarget.style.borderColor = `${meto.cor}33`
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--sep)'
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: meto.cor,
                  boxShadow: `0 0 8px ${meto.cor}77`,
                }} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{meto.nomeModulo}</span>
              </div>
              <ChevronRight size={14} style={{ color: isActive ? meto.cor : 'var(--t3)' }} />
            </button>
          )
        })}
      </div>

      <footer style={{
        padding: '10px 16px', borderTop: '1px solid var(--sep)',
        fontSize: 10, color: 'var(--t3)',
        flexShrink: 0, lineHeight: 1.5,
      }}>
        ⚠ Estimativa exploratória — não substitui autuação ambiental institucional.
      </footer>

      <style>{`
        @keyframes meto-slide-in-left {
          from { transform: translateX(-12px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </aside>
  )
}
