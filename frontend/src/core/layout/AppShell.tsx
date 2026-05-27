import React, { Suspense, useState, useRef, useEffect } from 'react'
import { useAppStore, type AnoFiltro, type Module } from '../store/useAppStore'
import { PrimaryRail }    from './PrimaryRail'
import { DataStatusBadge } from '../../shared/components/DataStatusBadge'

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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F2F2F2', lineHeight: 1.2 }}>
              Monitoramento de Alertas de{' '}
              <span style={{ color: '#F59E0B' }}>Desmatamento</span>
            </div>
            <div style={{ fontSize: 10, color: '#888888', fontWeight: 500, letterSpacing: '.02em' }}>
              CGEO / SEMARH-PI
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,.2)', flexShrink: 0 }} />

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

          {/* Direita: dropdown de ano + status */}
          <AnoDropdown />
          <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,.2)', flexShrink: 0 }} />
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'center', maxWidth: 860, margin: '0 auto' }}>
            <span style={{ color: '#F59E0B', fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
            <span style={{ fontSize: 11, color: '#888888', lineHeight: 1.6 }}>
              DERADSAs indisponíveis para 2022–2023. Fontes: MapBiomas Alerta SINAFLOR+/IBAMA SEMARH-PI IBGE INPE.<br />
              <strong style={{ color: '#ABABAB' }}>Estimativa exploratória — não substitui autuação ambiental.</strong>
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
