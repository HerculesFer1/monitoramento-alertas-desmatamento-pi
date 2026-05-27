import React, { Suspense, useState, useRef, useEffect } from 'react'
import { useAppStore, type AnoFiltro, type Module } from '../store/useAppStore'
import { PrimaryRail }    from './PrimaryRail'
import { DataStatusBadge } from '../../shared/components/DataStatusBadge'

function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore()
  const isDark = theme === 'dark'
  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? (
        /* Sun icon */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        /* Moon icon */
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}

// ── Lazy views ─────────────────────────────────────────────────────────────
const ExecutivaView   = React.lazy(() => import('../../modules/alertas_mapbiomas/ExecutivaView').then(m => ({ default: m.ExecutivaView })))
const MunicipalView   = React.lazy(() => import('../../modules/alertas_mapbiomas/MunicipalView').then(m => ({ default: m.MunicipalView })))
const TemporalView    = React.lazy(() => import('../../modules/alertas_mapbiomas/TemporalView').then(m => ({ default: m.TemporalView })))
const ComparativaView = React.lazy(() => import('../../modules/alertas_mapbiomas/ComparativaView').then(m => ({ default: m.ComparativaView })))
const ProdesView      = React.lazy(() => import('../../modules/prodes_cerrado/ProdesView').then(m => ({ default: m.ProdesView })))
const MatopibaView    = React.lazy(() => import('../../modules/alertas_mapbiomas/MatopibaView').then(m => ({ default: m.MatopibaView })))
const DadosView       = React.lazy(() => import('../../modules/dados/DadosView').then(m => ({ default: m.DadosView })))

function ViewFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#5A5A5A', fontSize: 13 }}>
      Carregando...
    </div>
  )
}

// ── Sub-visões por módulo ──────────────────────────────────────────────────
const MODULE_VIEWS: Record<Module, { id: string; label: string }[]> = {
  mapbiomas: [
    { id: 'executiva',   label: 'Visão Geral' },
    { id: 'temporal',    label: 'Evolução Temporal' },
    { id: 'municipal',   label: 'Panorama Municipal' },
    { id: 'comparativa', label: 'Análise Comparativa' },
  ],
  prodes:   [{ id: 'concordancia', label: 'Concordância PRODES' }],
  matopiba: [{ id: 'territorial',  label: 'Visão Territorial' }],
  dados:    [],
}

const ANOS: AnoFiltro[] = ['all', 2022, 2023, 2024, 2025]

// ── Dropdown de ano ────────────────────────────────────────────────────────
function AnoDropdown() {
  const { anoFiltro, setAnoFiltro } = useAppStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label     = anoFiltro === 'all' ? 'Todos' : String(anoFiltro)
  const hasFilter = anoFiltro !== 'all'

  return (
    <div className="ano-dropdown" ref={ref}>
      <button
        className={`ano-btn${hasFilter ? ' has-filter' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Filtrar por ano"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="1" y="2" width="10" height="9" rx="1.5"/>
          <path d="M4 1v2M8 1v2M1 5h10"/>
        </svg>
        <span>{label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          style={{ opacity: .6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M1 2.5l3 3 3-3"/>
        </svg>
      </button>

      {open && (
        <div className="ano-panel">
          <div className="ano-panel-label">Período de análise</div>
          {ANOS.map(v => (
            <button
              key={String(v)}
              className={`ano-option${anoFiltro === v ? ' active' : ''}`}
              onClick={() => { setAnoFiltro(v); setOpen(false) }}
            >
              {v === 'all' ? 'Todos os anos' : String(v)}
              {anoFiltro === v && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1.5 5l2.5 2.5L8.5 2"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AppShell ───────────────────────────────────────────────────────────────
export function AppShell() {
  const { activeModule, activeView, setActiveView } = useAppStore()
  const views = MODULE_VIEWS[activeModule]

  return (
    <div className="app-shell">
      <PrimaryRail />

      <div className="app-content">
        {/* ── Topbar ─────────────────────────────────────────────────── */}
        <header className="app-topbar">

          {/* Esquerda: marca */}
          <div className="topbar-brand">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2 }}>
              Monitoramento de Alertas de{' '}
              <span style={{ color: '#F59E0B' }}>Desmatamento</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 500, letterSpacing: '.02em' }}>
              CGEO / SEMARH-PI
            </div>
          </div>

          <div className="topbar-sep" />

          {/* Centro: tabs do módulo ativo */}
          <nav className="topbar-tabs">
            {views.map(v => (
              <button
                key={v.id}
                className={`topbar-tab${activeView === v.id ? ' active' : ''}`}
                onClick={() => setActiveView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>

          {/* Direita: theme toggle + dropdown de ano + status */}
          <ThemeToggle />
          <div className="topbar-sep" />
          <AnoDropdown />
          <div className="topbar-sep" />
          <DataStatusBadge />
        </header>

        {/* ── Conteúdo com transição lateral ──────────────────────── */}
        <main className="app-main">
          <Suspense fallback={<ViewFallback />}>
            <div key={`${activeModule}-${activeView}`} className="view-slide">
              {activeModule === 'mapbiomas' && activeView === 'executiva'   && <ExecutivaView />}
              {activeModule === 'mapbiomas' && activeView === 'temporal'    && <TemporalView />}
              {activeModule === 'mapbiomas' && activeView === 'municipal'   && <MunicipalView />}
              {activeModule === 'mapbiomas' && activeView === 'comparativa' && <ComparativaView />}
              {activeModule === 'prodes'    && <ProdesView />}
              {activeModule === 'matopiba'  && <MatopibaView />}
              {activeModule === 'dados'     && <DadosView />}
            </div>
          </Suspense>
        </main>

        {/* ── Footer — integrado ao corpo, sem separador ──────────── */}
        <footer className="app-footer">
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            <span style={{ color: '#F59E0B' }}>⚠ </span>
            DERADSAs indisponíveis para 2022–2023. Fontes: MapBiomas Alerta SINAFLOR+/IBAMA SEMARH-PI IBGE INPE.<br />
            <strong style={{ color: 'var(--t1)' }}>Estimativa exploratória — não substitui autuação ambiental.</strong>
          </div>
        </footer>
      </div>
    </div>
  )
}
