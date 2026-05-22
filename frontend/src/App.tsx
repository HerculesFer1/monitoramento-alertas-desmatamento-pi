import React, { Suspense } from 'react'
import { useAppStore, type Tab } from './store/useAppStore'
import { ErrorBoundary } from './components/ErrorBoundary'

const ExecutivaPage = React.lazy(() => import('./pages/ExecutivaPage').then(m => ({ default: m.ExecutivaPage })))
const MunicipalPage = React.lazy(() => import('./pages/MunicipalPage').then(m => ({ default: m.MunicipalPage })))
const TemporalPage  = React.lazy(() => import('./pages/TemporalPage').then(m => ({ default: m.TemporalPage })))
const ProdesPage    = React.lazy(() => import('./pages/ProdesPage').then(m => ({ default: m.ProdesPage })))
const MatopibaPage  = React.lazy(() => import('./pages/MatopibaPage').then(m => ({ default: m.MatopibaPage })))
const DadosPage     = React.lazy(() => import('./pages/DadosPage').then(m => ({ default: m.DadosPage })))

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'executiva', label: 'Visão Geral',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg>,
  },
  {
    id: 'municipal', label: 'Panorama Municipal',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
  },
  {
    id: 'temporal', label: 'Evolução Temporal',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
  {
    id: 'prodes', label: 'Validação PRODES',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  },
  {
    id: 'matopiba', label: 'MATOPIBA',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14.93V15a1 1 0 00-2 0v1.93A8.001 8.001 0 014.07 13H6a1 1 0 000-2H4.07A8.001 8.001 0 0111 4.07V6a1 1 0 002 0V4.07A8.001 8.001 0 0119.93 11H18a1 1 0 000 2h1.93A8.001 8.001 0 0113 16.93z"/></svg>,
  },
  {
    id: 'dados', label: 'Gestão de Dados',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  },
]

function TabFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--t3)', fontSize: 13 }}>
      Carregando...
    </div>
  )
}

export default function App() {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg1)' }}>

      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header style={{
        height: 56, background: 'var(--bg2)', borderBottom: '1px solid var(--sep)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Logo + Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            background: 'var(--aut-bg)', border: '1px solid rgba(16,185,129,.25)',
            borderRadius: 8, padding: '3px 10px',
            fontSize: 12, fontWeight: 800, color: 'var(--aut)', letterSpacing: '.06em',
          }}>CGEO</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2 }}>
              Monitoramento de Alertas de{' '}
              <span style={{ color: 'var(--mat)' }}>Desmatamento</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>GCGEO / SEMARH-PI · 2022–2025</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--aut-bg)', border: '1px solid rgba(16,185,129,.2)',
            borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 600, color: 'var(--aut)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aut)', display: 'inline-block' }} />
            Ativo
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--sep)', flexShrink: 0 }} />

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 13px', borderRadius: 8, cursor: 'pointer',
                border: activeTab === t.id ? '1px solid var(--sep)' : '1px solid transparent',
                background: activeTab === t.id ? 'var(--bg3)' : 'transparent',
                color: activeTab === t.id ? 'var(--t1)' : 'var(--t3)',
                fontSize: 12, fontWeight: 500, transition: 'all .15s',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
          Pipeline v2 · 9/9 ✓
        </div>
      </header>

      {/* ── Conteúdo ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'executiva' && <ErrorBoundary label="Visão Geral"><ExecutivaPage /></ErrorBoundary>}
          {activeTab === 'municipal' && <ErrorBoundary label="Panorama Municipal"><MunicipalPage /></ErrorBoundary>}
          {activeTab === 'temporal'  && <ErrorBoundary label="Evolução Temporal"><TemporalPage /></ErrorBoundary>}
          {activeTab === 'prodes'    && <ErrorBoundary label="Validação PRODES"><ProdesPage /></ErrorBoundary>}
          {activeTab === 'matopiba'  && <ErrorBoundary label="MATOPIBA"><MatopibaPage /></ErrorBoundary>}
          {activeTab === 'dados'     && <ErrorBoundary label="Gestão de Dados"><DadosPage /></ErrorBoundary>}
        </Suspense>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--bg3)', borderTop: '1px solid var(--sep)', padding: '10px 20px' }}>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>
          <strong style={{ color: 'var(--t2)' }}>CGEO — Centro de Geotecnologia Fundiária e Ambiental</strong>
          {' · '}Fontes: MapBiomas Alerta · SINAFLOR+/IBAMA · SEMARH-PI · IBGE/Malha Municipal · 2022–2025
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'center',
          background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.18)',
          borderRadius: 8, padding: '6px 14px', maxWidth: 900, margin: '0 auto',
        }}>
          <span style={{ color: 'var(--mat)', fontSize: 13, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>
            DERADSAs indisponíveis para 2022 e 2023 — Regularizado zerado nesses anos.
            As classificações são estimativas baseadas nos dados disponíveis.{' '}
            <strong style={{ color: 'var(--mat)' }}>Estimativa exploratória — não substitui autuação ambiental.</strong>
          </span>
        </div>
      </footer>
    </div>
  )
}
