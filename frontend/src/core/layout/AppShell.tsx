import React, { Suspense } from 'react'
import { useAppStore, type AnoFiltro } from '../store/useAppStore'
import { PrimaryRail }    from './PrimaryRail'
import { SecondaryPanel } from './SecondaryPanel'
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

const ANOS: AnoFiltro[] = ['all', 2022, 2023, 2024, 2025]

export function AppShell() {
  const { activeModule, activeView, anoFiltro, setAnoFiltro } = useAppStore()

  return (
    <div className="app-shell">
      <PrimaryRail />
      <SecondaryPanel />

      <div className="app-content">
        {/* ── Topbar ─────────────────────────────────────────────────── */}
        <header className="app-topbar">
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F2F2F2', lineHeight: 1.2 }}>
              Monitoramento de Alertas de{' '}
              <span style={{ color: '#F59E0B' }}>Desmatamento</span>
            </div>
            <div style={{ fontSize: 10, color: '#5A5A5A', fontWeight: 500 }}>
              CGEO / SEMARH-PI
            </div>
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.07)', flexShrink: 0 }} />

          {/* Year pills */}
          <div className="year-pills">
            {ANOS.map(v => (
              <button
                key={String(v)}
                className={`year-pill${anoFiltro === v ? ' active' : ''}`}
                onClick={() => setAnoFiltro(v)}
              >
                {v === 'all' ? 'Todos' : String(v)}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />
          <DataStatusBadge />
        </header>

        {/* ── Conteúdo ────────────────────────────────────────────────── */}
        <main className="app-main">
          <Suspense fallback={<ViewFallback />}>
            {activeModule === 'mapbiomas' && activeView === 'executiva'   && <ExecutivaView />}
            {activeModule === 'mapbiomas' && activeView === 'temporal'    && <TemporalView />}
            {activeModule === 'mapbiomas' && activeView === 'municipal'   && <MunicipalView />}
            {activeModule === 'mapbiomas' && activeView === 'comparativa' && <ComparativaView />}
            {activeModule === 'prodes'    && <ProdesView />}
            {activeModule === 'matopiba'  && <MatopibaView />}
            {activeModule === 'dados'     && <DadosView />}
          </Suspense>
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="app-footer">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'center', maxWidth: 860, margin: '0 auto' }}>
            <span style={{ color: '#F59E0B', fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
            <span style={{ fontSize: 11, color: '#5A5A5A', lineHeight: 1.5 }}>
              DERADSAs indisponíveis para 2022–2023. Fontes: MapBiomas Alerta · SINAFLOR+/IBAMA · SEMARH-PI · IBGE · INPE.{' '}
              <strong style={{ color: '#ABABAB' }}>Estimativa exploratória — não substitui autuação ambiental.</strong>
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
