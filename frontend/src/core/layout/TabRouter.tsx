import React, { Suspense } from 'react'
import { useAppStore } from '../store/useAppStore'
import { ErrorBoundary } from '../../shared/components/ErrorBoundary'

const ExecutivaView = React.lazy(() => import('../../modules/alertas_mapbiomas/ExecutivaView').then(m => ({ default: m.ExecutivaView })))
const MunicipalView = React.lazy(() => import('../../modules/alertas_mapbiomas/MunicipalView').then(m => ({ default: m.MunicipalView })))
const TemporalView  = React.lazy(() => import('../../modules/alertas_mapbiomas/TemporalView').then(m => ({ default: m.TemporalView })))
const ProdesView    = React.lazy(() => import('../../modules/prodes_cerrado/ProdesView').then(m => ({ default: m.ProdesView })))
const MatopibaView  = React.lazy(() => import('../../modules/alertas_mapbiomas/MatopibaView').then(m => ({ default: m.MatopibaView })))
const DadosView     = React.lazy(() => import('../../modules/dados/DadosView').then(m => ({ default: m.DadosView })))

function Fallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--t3)', fontSize: 13 }}>
      Carregando...
    </div>
  )
}

export function TabRouter() {
  const { activeTab } = useAppStore()
  return (
    <Suspense fallback={<Fallback />}>
      {activeTab === 'executiva' && <ErrorBoundary label="Visão Geral"><ExecutivaView /></ErrorBoundary>}
      {activeTab === 'municipal' && <ErrorBoundary label="Panorama Municipal"><MunicipalView /></ErrorBoundary>}
      {activeTab === 'temporal'  && <ErrorBoundary label="Evolução Temporal"><TemporalView /></ErrorBoundary>}
      {activeTab === 'prodes'    && <ErrorBoundary label="Validação PRODES"><ProdesView /></ErrorBoundary>}
      {activeTab === 'matopiba'  && <ErrorBoundary label="MATOPIBA"><MatopibaView /></ErrorBoundary>}
      {activeTab === 'dados'     && <ErrorBoundary label="Gestão de Dados"><DadosView /></ErrorBoundary>}
    </Suspense>
  )
}
