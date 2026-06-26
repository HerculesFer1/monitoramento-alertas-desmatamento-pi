import React, { Suspense, useState, useRef, useEffect } from 'react'
import { Sun, Moon, Calendar, Check } from 'lucide-react'
import { useAppStore, type AnoFiltro, type Module } from '../store/useAppStore'
import { PrimaryRail }       from './PrimaryRail'
import { DataStatusBadge }   from '../../shared/components/DataStatusBadge'
import { ErrorBoundary }     from '../../shared/components/ErrorBoundary'
import { MetodologiaDrawer } from '../methodology/MetodologiaDrawer'
import { MetodologiaPage }   from '../methodology/MetodologiaPage'
import { useMetodologia }    from '../methodology/useMetodologia'
import { ReportTrigger }     from '../report/ReportTrigger'
import { ReportPage }        from '../report/ReportPage'
import { useReportPage }     from '../report/useReportPage'
import { YEARS_AVAILABLE }   from '../lib/constants'

// ── Lazy views — alertas_mapbiomas ─────────────────────────────────────────
const ExecutivaView   = React.lazy(() => import('../../modules/alertas_mapbiomas/ExecutivaView').then(m => ({ default: m.ExecutivaView })))
const MunicipalView   = React.lazy(() => import('../../modules/alertas_mapbiomas/MunicipalView').then(m => ({ default: m.MunicipalView })))
const TemporalView    = React.lazy(() => import('../../modules/alertas_mapbiomas/TemporalView').then(m => ({ default: m.TemporalView })))
const ComparativaView = React.lazy(() => import('../../modules/alertas_mapbiomas/ComparativaView').then(m => ({ default: m.ComparativaView })))
const ProdesView         = React.lazy(() => import('../../modules/prodes_cerrado/ProdesView').then(m => ({ default: m.ProdesView })))
const ProdesVisaoGeral   = React.lazy(() => import('../../modules/prodes_cerrado/views/VisaoGeralView').then(m => ({ default: m.VisaoGeralView })))
const ProdesTemporal     = React.lazy(() => import('../../modules/prodes_cerrado/views/TemporalView').then(m => ({ default: m.TemporalView })))
const ProdesMunicipal    = React.lazy(() => import('../../modules/prodes_cerrado/views/MunicipalView').then(m => ({ default: m.MunicipalView })))
const ProdesComparativa  = React.lazy(() => import('../../modules/prodes_cerrado/views/ComparativaView').then(m => ({ default: m.ComparativaView })))
const ProdesRanking      = React.lazy(() => import('../../modules/prodes_cerrado/views/RankingView').then(m => ({ default: m.RankingView })))
const DadosView       = React.lazy(() => import('../../modules/dados/DadosView').then(m => ({ default: m.DadosView })))

// ── Lazy views — matopiba (panorama transversal) ───────────────────────────
const MAT_VisaoGeral         = React.lazy(() => import('../../modules/matopiba').then(m => ({ default: m.VisaoGeralView })))
const MAT_Alertas            = React.lazy(() => import('../../modules/matopiba').then(m => ({ default: m.AlertasView })))
const MAT_Prodes             = React.lazy(() => import('../../modules/matopiba').then(m => ({ default: m.ProdesView })))
const MAT_Queimadas          = React.lazy(() => import('../../modules/matopiba').then(m => ({ default: m.QueimadasView })))
const MAT_AreasPrioritarias  = React.lazy(() => import('../../modules/matopiba').then(m => ({ default: m.AreasPrioritariasView })))

// ── Lazy views — queimadas_bdq ─────────────────────────────────────────────
const QB_VisaoGeralView  = React.lazy(() => import('../../modules/queimadas_bdq/views/VisaoGeralView').then(m => ({ default: m.VisaoGeralView })))
const QB_ClassesView     = React.lazy(() => import('../../modules/queimadas_bdq/views/ClassesView').then(m => ({ default: m.ClassesView })))
const QB_MunicipalView   = React.lazy(() => import('../../modules/queimadas_bdq/views/MunicipalView').then(m => ({ default: m.MunicipalView })))
const QB_TemporalView    = React.lazy(() => import('../../modules/queimadas_bdq/views/TemporalView').then(m => ({ default: m.TemporalView })))
const QB_SerieAnualView  = React.lazy(() => import('../../modules/queimadas_bdq/views/SerieAnualView').then(m => ({ default: m.SerieAnualView })))
const QB_RecorrenciaView = React.lazy(() => import('../../modules/queimadas_bdq/views/RecorrenciaView').then(m => ({ default: m.RecorrenciaView })))
// Aba "Metodologia" do queimadas foi removida em 2026-06-03 — conteudo
// migrado para o drawer global de Metodologia (acessivel pelo gear).

// ── Lazy views — areas_prioritarias (cada view em chunk próprio) ───────────
const VisaoGeralView       = React.lazy(() => import('../../modules/areas_prioritarias/views/VisaoGeralView').then(m => ({ default: m.VisaoGeralView })))
const MunicipalView_AP     = React.lazy(() => import('../../modules/areas_prioritarias/views/MunicipalView').then(m => ({ default: m.MunicipalView })))
const ProdesPrioridadeView = React.lazy(() => import('../../modules/areas_prioritarias/views/ProdesPrioridadeView').then(m => ({ default: m.ProdesPrioridadeView })))
const RankingView_AP       = React.lazy(() => import('../../modules/areas_prioritarias/views/RankingView').then(m => ({ default: m.RankingView })))
const BiomassaView_AP      = React.lazy(() => import('../../modules/areas_prioritarias/views/BiomassaView').then(m => ({ default: m.BiomassaView })))

function ViewFallback() {
  return (
    <div className="view-skeleton-wrap">
      <div className="skeleton-row">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-body">
        <div className="skeleton-map" />
        <div className="skeleton-panel" />
      </div>
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
  prodes: [
    { id: 'visao_geral',  label: 'Visão Geral' },
    { id: 'temporal',     label: 'Evolução Temporal' },
    { id: 'municipal',    label: 'Panorama Municipal' },
    { id: 'comparativa',  label: 'Análise Comparativa' },
    { id: 'ranking',      label: 'Top Municípios' },
    { id: 'concordancia', label: 'PRODES vs MapBiomas' },
  ],
  matopiba: [
    { id: 'visao_geral',         label: 'Visão Geral' },
    { id: 'alertas',             label: 'Alertas MapBiomas' },
    { id: 'prodes',              label: 'PRODES Cerrado' },
    { id: 'queimadas',           label: 'Queimadas BD-INPE' },
    { id: 'areas_prioritarias',  label: 'Áreas Prioritárias' },
  ],
  dados:    [],
  areas_prioritarias: [
    { id: 'visao_geral',       label: 'Visão Geral' },
    { id: 'municipal',         label: 'Municipal' },
    { id: 'prodes_prioridade', label: 'PRODES × Prioridade' },
    { id: 'ranking',           label: 'Ranking' },
    { id: 'biomassa',          label: 'Biomassa' },
  ],
  queimadas_bdq: [
    { id: 'visao_geral',  label: 'Visão Geral' },
    { id: 'classes',      label: 'Por Classe' },
    { id: 'municipal',    label: 'Municipal' },
    { id: 'temporal',     label: 'Evolução Mensal' },
    { id: 'serie_anual',  label: 'Série Anual' },
    { id: 'recorrencia',  label: 'Recorrência' },
    // Metodologia removida — agora disponivel pelo drawer global (gear)
  ],
}

const ANOS: AnoFiltro[] = ['all', ...YEARS_AVAILABLE]

// ── Títulos por módulo ────────────────────────────────────────────────────
// `key` recebe destaque temático (caixa alta + cor). O título completo é
// composto como: `${prefix} ${KEY}${suffix ?? ''}`.
const MODULE_TITLES: Record<Module, { prefix: string; key: string; suffix?: string; color: string }> = {
  mapbiomas:          { prefix: 'Monitoramento de Alertas',                 key: 'MAPBIOMAS', color: '#F59E0B' }, // âmbar
  prodes:             { prefix: 'Monitoramento de Alertas',                 key: 'PRODES',    color: '#10B981' }, // esmeralda INPE
  matopiba:           { prefix: 'Panorama',                                  key: 'MATOPIBA',  color: '#D97706' }, // âmbar escuro Cerrado
  areas_prioritarias: { prefix: 'Análise de Áreas Prioritárias',             key: 'REDD+',     color: '#10B981' }, // verde REDD+
  queimadas_bdq:      { prefix: 'Análise de',                                key: 'QUEIMADAS', suffix: ' em Áreas Prioritárias', color: '#EF4444' }, // vermelho fogo
  dados:              { prefix: 'Gestão de',                                 key: 'DADOS',     color: '#94A3B8' }, // cinza neutro
}

// ── Theme toggle ───────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore()
  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {theme === 'dark'
        ? <Sun  size={15} strokeWidth={1.8} />
        : <Moon size={14} strokeWidth={1.8} />
      }
    </button>
  )
}

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
        className={`ano-btn ano-btn-compact${hasFilter ? ' has-filter' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={`Filtrar por ano · ${label}`}
        aria-label={`Filtrar por ano · ${label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Calendar size={14} strokeWidth={1.6} />
        {hasFilter && (
          <span
            aria-hidden="true"
            style={{
              fontSize: 10, fontWeight: 700, lineHeight: 1,
              padding: '2px 4px', borderRadius: 4,
              background: 'var(--mat, #F59E0B)', color: '#111',
              marginLeft: 2,
            }}
          >
            {label}
          </span>
        )}
      </button>

      {open && (
        <div className="ano-panel" role="listbox" aria-label="Filtrar por período">
          <div className="ano-panel-label">Período de análise</div>
          {ANOS.map(v => (
            <button
              key={String(v)}
              className={`ano-option${anoFiltro === v ? ' active' : ''}`}
              role="option"
              aria-selected={anoFiltro === v}
              onClick={() => { setAnoFiltro(v); setOpen(false) }}
            >
              {v === 'all' ? 'Todos os anos' : String(v)}
              {anoFiltro === v && <Check size={10} strokeWidth={2} />}
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
  const title = MODULE_TITLES[activeModule]
  const { isMetodologiaOpen, close: closeMetodologia, selectedModule: metoSelected, clearSelection } = useMetodologia()
  const { isReportOpen } = useReportPage()

  // Migracao: se vier rota antiga `metodologia` do queimadas, redireciona
  // para a primeira view do modulo (a metodologia agora esta no drawer).
  React.useEffect(() => {
    if (activeModule === 'queimadas_bdq' && activeView === 'metodologia') {
      setActiveView('visao_geral')
    }
    // Migracao: MATOPIBA deixou de ter uma unica view `territorial` e virou
    // panorama transversal com 5 abas. Aponta o usuario para a Visao Geral.
    if (activeModule === 'matopiba' && activeView === 'territorial') {
      setActiveView('visao_geral')
    }
  }, [activeModule, activeView, setActiveView])

  // Limpa a selecao de Metodologia quando o usuario troca de modulo
  // ou de aba — corrige o "travamento" em que a pagina de metodologia
  // continuava visivel mesmo apos navegacao no rail/topbar.
  React.useEffect(() => {
    if (metoSelected) clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule, activeView])

  return (
    <div className="app-shell">
      <MetodologiaDrawer open={isMetodologiaOpen} onClose={closeMetodologia} />
      <PrimaryRail />

      <div className="app-content">
        {/* ── Topbar ─────────────────────────────────────────────────── */}
        <header className="app-topbar">
          <div className="topbar-brand" aria-label={`${title.prefix} ${title.key}${title.suffix ?? ''}`}>
            <div
              className="topbar-title"
              style={{ color: 'var(--t1)', lineHeight: 1.15 }}
            >
              {title.prefix}{' '}
              <span
                className="topbar-title-key"
                style={{ color: title.color, fontWeight: 800, letterSpacing: '.02em' }}
              >
                {title.key}
              </span>
              {title.suffix ? <span style={{ color: 'var(--t1)' }}>{title.suffix}</span> : null}
            </div>
          </div>

          {/* Spacer empurra os controles para a direita; os tabs ficam
              flutuando no centro via position absolute (.topbar-tabs). */}
          <div style={{ flex: 1, minWidth: 0 }} aria-hidden="true" />

          <nav className="topbar-tabs" role="tablist" aria-label="Visualizações">
            {views.map(v => (
              <button
                key={v.id}
                className={`topbar-tab${activeView === v.id ? ' active' : ''}`}
                role="tab"
                aria-selected={activeView === v.id}
                onClick={() => setActiveView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>

          <ThemeToggle />
          <div className="topbar-sep" />
          <AnoDropdown />
          {activeModule !== 'dados' && (
            <>
              <div className="topbar-sep" />
              <ReportTrigger />
            </>
          )}
          <div className="topbar-sep" />
          <DataStatusBadge />
        </header>

        {/* ── Conteúdo ────────────────────────────────────────────────── */}
        <main className="app-main" role="main">
          {isReportOpen && <ReportPage />}
          {!isReportOpen && metoSelected && <MetodologiaPage />}
          {!isReportOpen && !metoSelected && (
          <Suspense fallback={<ViewFallback />}>
            <ErrorBoundary label={`${activeModule} › ${activeView}`}>
              <div key={`${activeModule}-${activeView}`} className="view-slide">
                {activeModule === 'mapbiomas' && activeView === 'executiva'   && <ExecutivaView />}
                {activeModule === 'mapbiomas' && activeView === 'temporal'    && <TemporalView />}
                {activeModule === 'mapbiomas' && activeView === 'municipal'   && <MunicipalView />}
                {activeModule === 'mapbiomas' && activeView === 'comparativa' && <ComparativaView />}
                {activeModule === 'prodes'    && activeView === 'visao_geral'  && <ProdesVisaoGeral />}
                {activeModule === 'prodes'    && activeView === 'temporal'     && <ProdesTemporal />}
                {activeModule === 'prodes'    && activeView === 'municipal'    && <ProdesMunicipal />}
                {activeModule === 'prodes'    && activeView === 'comparativa'  && <ProdesComparativa />}
                {activeModule === 'prodes'    && activeView === 'ranking'      && <ProdesRanking />}
                {activeModule === 'prodes'    && activeView === 'concordancia' && <ProdesView />}
                {activeModule === 'matopiba'  && activeView === 'visao_geral'        && <MAT_VisaoGeral />}
                {activeModule === 'matopiba'  && activeView === 'alertas'            && <MAT_Alertas />}
                {activeModule === 'matopiba'  && activeView === 'prodes'             && <MAT_Prodes />}
                {activeModule === 'matopiba'  && activeView === 'queimadas'          && <MAT_Queimadas />}
                {activeModule === 'matopiba'  && activeView === 'areas_prioritarias' && <MAT_AreasPrioritarias />}
                {activeModule === 'dados'     && <DadosView />}
                {activeModule === 'areas_prioritarias' && activeView === 'visao_geral'       && <VisaoGeralView />}
                {activeModule === 'areas_prioritarias' && activeView === 'municipal'         && <MunicipalView_AP />}
                {activeModule === 'areas_prioritarias' && activeView === 'prodes_prioridade' && <ProdesPrioridadeView />}
                {activeModule === 'areas_prioritarias' && activeView === 'ranking'           && <RankingView_AP />}
                {activeModule === 'areas_prioritarias' && activeView === 'biomassa'          && <BiomassaView_AP />}
                {activeModule === 'queimadas_bdq' && activeView === 'visao_geral'  && <QB_VisaoGeralView />}
                {activeModule === 'queimadas_bdq' && activeView === 'classes'      && <QB_ClassesView />}
                {activeModule === 'queimadas_bdq' && activeView === 'municipal'    && <QB_MunicipalView />}
                {activeModule === 'queimadas_bdq' && activeView === 'temporal'     && <QB_TemporalView />}
                {activeModule === 'queimadas_bdq' && activeView === 'serie_anual'  && <QB_SerieAnualView />}
                {activeModule === 'queimadas_bdq' && activeView === 'recorrencia'  && <QB_RecorrenciaView />}
              </div>
            </ErrorBoundary>
          </Suspense>
          )}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="app-footer" role="contentinfo">
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            <span style={{ color: '#F59E0B' }}>⚠ </span>
            DERADSAs indisponíveis para 2022–2023. Fontes: MapBiomas Alerta · SINAFLOR+/IBAMA · SEMARH-PI · IBGE · INPE.<br />
            <strong style={{ color: 'var(--t1)' }}>Estimativa exploratória — não substitui autuação ambiental.</strong>
          </div>
        </footer>
      </div>
    </div>
  )
}
