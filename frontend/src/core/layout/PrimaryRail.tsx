import React from 'react'
import { BookOpen, Database, ChevronRight } from 'lucide-react'
import { useAppStore, type Module } from '../store/useAppStore'
import { useMetodologia } from '../methodology/useMetodologia'
import { METODOLOGIAS } from '../methodology/content'

interface RailItem {
  module:      Module
  label:       string
  disabled?:   boolean
  icon:        React.ReactNode
  iconActive?: React.ReactNode
}

const mkImg = (src: string, cls: string, w: number | string = 30, h: number | string = 30) => (
  <img src={src} alt="" className={cls} style={{ width: w, height: h, display: 'block', objectFit: 'contain' }} />
)

const ITEMS: RailItem[] = [
  {
    module:     'mapbiomas',
    label:      'MapBiomas Alertas',
    icon:       mkImg('/icon-mapbiomas.svg',        'rail-module-icon-inactive', '60%', '60%'),
    iconActive: mkImg('/icon-mapbiomas-active.svg', 'rail-module-icon-active',   '60%', '60%'),
  },
  {
    module:     'prodes',
    label:      'PRODES / INPE',
    icon:       mkImg('/icon-prodes.svg',        'rail-module-icon-inactive', '95%', '95%'),
    iconActive: mkImg('/icon-prodes-active.svg', 'rail-module-icon-active',   '95%', '95%'),
  },
  {
    module:     'matopiba',
    label:      'MATOPIBA',
    icon:       mkImg('/icon-matopiba.svg',        'rail-module-icon-inactive', '90%', '90%'),
    iconActive: mkImg('/icon-matopiba-active.svg', 'rail-module-icon-active',   '90%', '90%'),
  },
  {
    module:     'areas_prioritarias',
    label:      'Áreas Prioritárias',
    icon:       mkImg('/icon-redd-inactive.svg', 'rail-module-icon-inactive', '76%', '76%'),
    iconActive: mkImg('/icon-redd-active.svg',   'rail-module-icon-active',   '76%', '76%'),
  },
  {
    module:     'queimadas_bdq',
    label:      'Queimadas BD-INPE',
    icon:       mkImg('/icon-queimadas.svg',        'rail-module-icon-inactive', '94%', '94%'),
    iconActive: mkImg('/icon-queimadas-active.svg', 'rail-module-icon-active',   '94%', '94%'),
  },
]

/* ── Tooltip ──────────────────────────────────────────────────────────── */
function Tooltip({ label }: { label: string }) {
  return (
    <div style={{
      position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
      marginLeft: 10,
      background: '#0A0A0A',
      border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 500,
      color: '#F2F2F2', whiteSpace: 'nowrap', zIndex: 999, pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)',
    }}>
      {label}
      <div style={{
        position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
        borderWidth: '4px', borderStyle: 'solid',
        borderColor: 'transparent #0A0A0A transparent transparent',
      }} />
    </div>
  )
}

/* ── Rail Button ──────────────────────────────────────────────────────── */
function RailBtn({
  active, disabled, label, onClick, children,
}: {
  active?: boolean; disabled?: boolean; label: string
  onClick?: () => void; children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`rail-btn${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
        onClick={disabled ? undefined : onClick}
        title=""
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </button>
      {hovered && !disabled && <Tooltip label={label} />}
    </div>
  )
}

/* ── Settings icon ────────────────────────────────────────────────────── */
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

/* ── PrimaryRail ──────────────────────────────────────────────────────── */
export function PrimaryRail() {
  const { activeModule, setActiveModule, theme } = useAppStore()

  return (
    <nav className="rail">

      {/* ① Logo — topo fixo */}
      <div className="rail-logo-area">
        <div className="rail-logo">
          <img
            src={theme === 'light' ? '/logo-light.svg' : '/logo-dark.svg'}
            alt="CGEO"
            style={{ width: 44, height: 'auto', display: 'block' }}
          />
        </div>
      </div>

      {/* ② Módulos — zona central (expande do centro) */}
      <div className="rail-modules">
        <div className="rail-sep" />

        {ITEMS.map(item => {
          const isActive = activeModule === item.module
          return (
            <RailBtn
              key={item.module}
              active={isActive}
              label={item.label}
              onClick={() => setActiveModule(item.module)}
            >
              {(isActive && item.iconActive) ? item.iconActive : item.icon}
            </RailBtn>
          )
        })}

        <div className="rail-sep" />
      </div>

      {/* ③ Bottom — settings (popover) + avatar (fixo no rodapé) */}
      <div className="rail-bottom">

        <div className="rail-sep" />

        <SettingsButton />

        <div className="rail-avatar" title="CGEO / SEMARH-PI">CG</div>

      </div>
    </nav>
  )
}

/* ── Settings popover (Metodologia + Gestão de Dados) ───────────────────── */
const METODOLOGIA_MODULES: Module[] = ['mapbiomas', 'prodes', 'matopiba', 'areas_prioritarias', 'queimadas_bdq']

function SettingsButton() {
  const { selectOnly: selectMetodologia } = useMetodologia()
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const activeModule    = useAppStore(s => s.activeModule)
  const [open, setOpen] = React.useState(false)
  const [metoOpen, setMetoOpen] = React.useState(false)
  const btnRef          = React.useRef<HTMLButtonElement>(null)
  const popRef          = React.useRef<HTMLDivElement>(null)
  const metoItemRef     = React.useRef<HTMLButtonElement>(null)
  const metoSubRef      = React.useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = React.useState(false)
  const [pos, setPos]   = React.useState<{ left: number; top: number } | null>(null)
  const [metoPos, setMetoPos] = React.useState<{ left: number; top: number } | null>(null)

  // Calcula posição do popover usando o rect do botão (position:fixed escapa
  // do overflow:hidden do rail).
  const recompute = React.useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    // Aparece à direita do botão, alinhado pelo topo.
    setPos({ left: r.right + 8, top: r.top })
  }, [])

  // Posicao do submenu Metodologia (a direita do PopoverItem).
  const recomputeMeto = React.useCallback(() => {
    const el = metoItemRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMetoPos({ left: r.right + 6, top: r.top })
  }, [])

  React.useLayoutEffect(() => {
    if (!open) return
    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [open, recompute])

  React.useLayoutEffect(() => {
    if (!metoOpen) return
    recomputeMeto()
    window.addEventListener('resize', recomputeMeto)
    window.addEventListener('scroll', recomputeMeto, true)
    return () => {
      window.removeEventListener('resize', recomputeMeto)
      window.removeEventListener('scroll', recomputeMeto, true)
    }
  }, [metoOpen, recomputeMeto])

  // Fecha ao clicar fora, ESC, ou em qualquer outro botão do rail
  // (módulos do menu principal). Garante que a janela suspensa nunca fica
  // sobreposta após o usuário escolher uma opção ou navegar.
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      // Clique no proprio botao de settings, popover ou submenu: ignora.
      if (btnRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      if (metoSubRef.current?.contains(t)) return
      // Qualquer outro clique (inclui rail-btn dos módulos): fecha.
      setOpen(false)
      setMetoOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (metoOpen) setMetoOpen(false)
        else setOpen(false)
      }
    }
    // mousedown roda antes do click — garante que setOpen(false) já está
    // refletido quando o handler de click do destino dispara.
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, metoOpen])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        className={`rail-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Configurações"
      >
        <SettingsIcon />
      </button>
      {hovered && !open && <Tooltip label="Configurações" />}

      {open && pos && (
        <div
          ref={popRef}
          role="menu"
          aria-label="Configurações"
          className="settings-popover"
          style={{
            // position:fixed escapa do overflow:hidden do .rail.
            // Subimos para que a base do popover fique alinhada com a base
            // do botão (popover cresce para cima).
            position: 'fixed',
            left: pos.left,
            top:  Math.max(8, pos.top - 76),
            minWidth: 200,
            padding: 6,
            background: 'var(--bg2, #161616)',
            border: '1px solid var(--sep)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.18)',
            zIndex: 1000,
            display: 'flex', flexDirection: 'column', gap: 2,
            animation: 'settings-pop-in .16s cubic-bezier(.2,.7,.2,1)',
          }}
        >
          <PopoverItem
            ref={metoItemRef}
            icon={<BookOpen size={14} strokeWidth={1.7} />}
            label="Metodologia"
            active={metoOpen}
            trailing={<ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
            onClick={() => setMetoOpen(v => !v)}
          />
          <PopoverItem
            icon={<Database size={14} strokeWidth={1.7} />}
            label="Gestão de Dados"
            active={activeModule === 'dados'}
            onClick={() => { setActiveModule('dados'); setOpen(false); setMetoOpen(false) }}
          />
          <style>{`
            @keyframes settings-pop-in {
              from { transform: translateY(4px); opacity: 0; }
              to   { transform: translateY(0);   opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {open && metoOpen && metoPos && (
        <div
          ref={metoSubRef}
          role="menu"
          aria-label="Metodologia — selecione um módulo"
          className="settings-popover settings-submenu"
          style={{
            position: 'fixed',
            left: metoPos.left,
            top:  Math.max(8, metoPos.top - 6),
            minWidth: 220,
            padding: 6,
            background: 'var(--bg2, #161616)',
            border: '1px solid var(--sep)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.18)',
            zIndex: 1001,
            display: 'flex', flexDirection: 'column', gap: 2,
            animation: 'settings-pop-in .16s cubic-bezier(.2,.7,.2,1)',
          }}
        >
          {METODOLOGIA_MODULES.map(m => {
            const meto = METODOLOGIAS[m]
            return (
              <PopoverItem
                key={m}
                icon={<span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: meto.cor, boxShadow: `0 0 6px ${meto.cor}88`,
                }} />}
                label={meto.nomeModulo}
                onClick={() => {
                  selectMetodologia(m)
                  setOpen(false)
                  setMetoOpen(false)
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface PopoverItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  trailing?: React.ReactNode
}

const PopoverItem = React.forwardRef<HTMLButtonElement, PopoverItemProps>(
  function PopoverItem({ icon, label, onClick, active, trailing }, ref) {
    return (
      <button
        ref={ref}
        role="menuitem"
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px',
          background: active ? 'rgba(16,185,129,.10)' : 'transparent',
          border: 'none',
          borderRadius: 7,
          color: active ? 'var(--aut)' : 'var(--t1)',
          cursor: 'pointer',
          fontSize: 12.5, fontWeight: 500,
          textAlign: 'left',
          transition: 'background .12s',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.06)'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <span style={{ display: 'inline-flex', color: active ? 'var(--aut)' : 'var(--t2)' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {trailing}
      </button>
    )
  }
)
