/**
 * MetodologiaDrawer.tsx — Painel suspenso lateral com a metodologia de cada modulo.
 *
 * Acionado pelo icone de engrenagem no PrimaryRail. Exibe um menu inicial com
 * os 5 modulos de analise; clique seleciona o modulo e abre o conteudo.
 *
 * Linguagem: deliberadamente acessivel — alvo institucional CGEO/SEMARH-PI.
 *
 * Conteudo vem de content.ts e pode ser editado sem mexer no componente.
 */
import { useState, useEffect } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { METODOLOGIAS } from './content'
import type { Module } from '../store/useAppStore'

interface Props {
  open:  boolean
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
  const [selecionado, setSelecionado] = useState<Module | null>(null)

  // Fecha com ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selecionado) setSelecionado(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, selecionado, onClose])

  // Reseta selecao ao fechar
  useEffect(() => {
    if (!open) setSelecionado(null)
  }, [open])

  if (!open) return null

  const meto = selecionado ? METODOLOGIAS[selecionado] : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.45)',
          zIndex: 9990,
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />

      {/* Drawer lateral */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Metodologia dos modulos de analise"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(520px, 92vw)',
          background: 'var(--bg1, #161616)',
          borderLeft: '1px solid rgba(255,255,255,.08)',
          boxShadow: '-12px 0 32px rgba(0,0,0,.4)',
          zIndex: 9991,
          display: 'flex', flexDirection: 'column',
          animation: 'meto-slide-in .22s cubic-bezier(.2,.7,.2,1)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selecionado && (
              <button
                onClick={() => setSelecionado(null)}
                aria-label="Voltar"
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--t2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  transform: 'rotate(180deg)',
                }}
              >
                <ChevronRight size={18} />
              </button>
            )}
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                Metodologia
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
                {meto ? meto.nomeModulo : 'Selecione um módulo'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar metodologia"
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,.08)',
              color: 'var(--t2)', cursor: 'pointer',
              borderRadius: 6, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </header>

        {/* Conteudo */}
        <div className="ranking-scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {!selecionado && <MenuModulos onSelect={setSelecionado} />}
          {meto && <ConteudoMetodologia meto={meto} />}
        </div>

        <footer style={{
          padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,.06)',
          fontSize: 10, color: 'var(--t3)',
          flexShrink: 0,
        }}>
          ⚠ Estimativa exploratória — não substitui autuação ambiental institucional.
        </footer>
      </aside>

      <style>{`
        @keyframes meto-slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ── Menu inicial ───────────────────────────────────────────────────────────

function MenuModulos({ onSelect }: { onSelect: (m: Module) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6, marginTop: 0, marginBottom: 10 }}>
        Escolha um módulo de análise para ver como ele funciona, de onde vêm os
        dados e o que cada número significa. Conteúdo em linguagem simples.
      </p>
      {MODULOS_ANALISE.map(m => {
        const meto = METODOLOGIAS[m]
        return (
          <button
            key={m}
            onClick={() => onSelect(m)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 13px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 8,
              color: 'var(--t1)',
              cursor: 'pointer',
              transition: 'all .15s',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${meto.cor}11`
              e.currentTarget.style.borderColor = `${meto.cor}44`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,.03)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: meto.cor,
                boxShadow: `0 0 8px ${meto.cor}77`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{meto.nomeModulo}</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--t3)' }} />
          </button>
        )
      })}
    </div>
  )
}

// ── Conteudo de um modulo ──────────────────────────────────────────────────

function ConteudoMetodologia({ meto }: { meto: typeof METODOLOGIAS[Module] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Secao corDestaque={meto.cor} secao={meto.pergunta} />
      <Secao corDestaque={meto.cor} secao={meto.fontes} />
      <Secao corDestaque={meto.cor} secao={meto.como_calcula} />
      <Secao corDestaque={meto.cor} secao={meto.simbologia} />
      <Secao corDestaque={meto.cor} secao={meto.limitacoes} />
    </div>
  )
}

function Secao({ secao, corDestaque }: { secao: { titulo: string; paragrafos: string[] }; corDestaque: string }) {
  return (
    <section>
      <h3 style={{
        fontSize: 12, fontWeight: 700,
        margin: '0 0 8px 0',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: corDestaque,
        borderLeft: `3px solid ${corDestaque}`,
        paddingLeft: 8,
      }}>
        {secao.titulo}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {secao.paragrafos.map((p, i) => (
          <p key={i} style={{
            fontSize: 12.5, lineHeight: 1.65, color: 'var(--t2)',
            margin: 0,
          }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  )
}
