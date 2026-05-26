import { useAppStore, type Module } from '../store/useAppStore'

interface RailItem {
  module:   Module
  label:    string
  disabled?: boolean
  icon:     React.ReactNode
}

const ITEMS: RailItem[] = [
  {
    module: 'mapbiomas',
    label: 'MapBiomas Alertas',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    module: 'prodes',
    label: 'PRODES / INPE',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    module: 'matopiba',
    label: 'MATOPIBA',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 000 20M12 2a14.5 14.5 0 010 20"/>
        <path d="M2 12h20"/>
      </svg>
    ),
  },
  {
    module: 'areas_prioritarias',
    label: 'Áreas Prioritárias',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22V12"/>
        <path d="M12 12C12 12 7 10 5 6c3 0 5.5 1 7 3 1.5-2 4-3 7-3-2 4-7 6-7 6z"/>
        <path d="M5 3h14"/>
      </svg>
    ),
  },
]

const FUTURE: { label: string; icon: React.ReactNode }[] = [
  {
    label: 'SINAFLOR / ASVs (em breve)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 9h6M9 12h6M9 15h4"/>
      </svg>
    ),
  },
]

function Tooltip({ label }: { label: string }) {
  return (
    <div style={{
      position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
      marginLeft: 10, background: '#222', border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 500,
      color: '#F2F2F2', whiteSpace: 'nowrap', zIndex: 999, pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,.4)',
    }}>
      {label}
      <div style={{
        position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
        borderWidth: '4px', borderStyle: 'solid',
        borderColor: 'transparent #222 transparent transparent',
      }} />
    </div>
  )
}

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

import React from 'react'

export function PrimaryRail() {
  const { activeModule, setActiveModule } = useAppStore()

  return (
    <nav className="rail">
      {/* Logo */}
      <div className="rail-top">
        <div className="rail-logo">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(16,185,129,.15)',
            border: '1px solid rgba(16,185,129,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#10B981', letterSpacing: '.02em',
          }}>
            PI
          </div>
        </div>

        <div className="rail-sep" />

        {/* Módulos ativos */}
        {ITEMS.map(item => (
          <RailBtn
            key={item.module}
            active={activeModule === item.module}
            label={item.label}
            onClick={() => setActiveModule(item.module)}
          >
            {item.icon}
          </RailBtn>
        ))}

        <div className="rail-sep" />

        {/* Módulos futuros */}
        {FUTURE.map(item => (
          <RailBtn key={item.label} disabled label={item.label}>
            {item.icon}
          </RailBtn>
        ))}
      </div>

      {/* Bottom */}
      <div className="rail-bottom">
        <div className="rail-sep" />
        <RailBtn
          active={activeModule === 'dados'}
          label="Gestão de Dados"
          onClick={() => setActiveModule('dados')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </RailBtn>
      </div>
    </nav>
  )
}
