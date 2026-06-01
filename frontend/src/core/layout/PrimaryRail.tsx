import React from 'react'
import { useAppStore, type Module } from '../store/useAppStore'

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
    icon:       mkImg('/icon-prodes.svg',        'rail-module-icon-inactive', '84%', '84%'),
    iconActive: mkImg('/icon-prodes-active.svg', 'rail-module-icon-active',   '84%', '84%'),
  },
  {
    module:     'matopiba',
    label:      'MATOPIBA',
    icon:       mkImg('/icon-matopiba.svg',        'rail-module-icon-inactive', '84%', '84%'),
    iconActive: mkImg('/icon-matopiba-active.svg', 'rail-module-icon-active',   '84%', '84%'),
  },
  {
    module:     'areas_prioritarias',
    label:      'Áreas Prioritárias',
    icon:       mkImg('/icon-redd-inactive.svg', 'rail-module-icon-inactive', '76%', '76%'),
    iconActive: mkImg('/icon-redd-active.svg',   'rail-module-icon-active',   '76%', '76%'),
  },
  {
    module: 'queimadas_bdq',
    label:  'Queimadas BD-INPE',
    icon: (
      <span style={{ fontSize: 24, lineHeight: 1, opacity: .55 }}>🔥</span>
    ),
    iconActive: (
      <span style={{ fontSize: 24, lineHeight: 1 }}>🔥</span>
    ),
  },
]

const FUTURE: { label: string; icon: React.ReactNode }[] = [
  {
    label: 'SINAFLOR / ASVs (em breve)',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    label: 'SEMARH / DERADSAs (em breve)',
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 9h6M9 12h6M9 15h4"/>
      </svg>
    ),
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
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

        {FUTURE.map(item => (
          <RailBtn key={item.label} disabled label={item.label}>
            {item.icon}
          </RailBtn>
        ))}

        <div className="rail-sep" />
      </div>

      {/* ③ Bottom — dados + settings + avatar (fixo no rodapé) */}
      <div className="rail-bottom">

        <RailBtn
          active={activeModule === 'dados'}
          label="Gestão de Dados"
          onClick={() => setActiveModule('dados')}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </RailBtn>

        <div className="rail-sep" />

        <button className="rail-btn disabled" title="Configurações (em breve)" style={{ opacity: .22, cursor: 'default' }}>
          <SettingsIcon />
        </button>

        <div className="rail-avatar" title="CGEO / SEMARH-PI">CG</div>

      </div>
    </nav>
  )
}
