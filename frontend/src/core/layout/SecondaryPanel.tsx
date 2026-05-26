import React from 'react'
import { useAppStore, type Module } from '../store/useAppStore'

interface ViewItem {
  id:    string
  label: string
  icon:  React.ReactNode
}

const MODULE_META: Record<Module, { name: string; views: ViewItem[] }> = {
  mapbiomas: {
    name: 'MapBiomas Alertas',
    views: [
      {
        id: 'executiva',
        label: 'Visão Geral',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg>,
      },
      {
        id: 'temporal',
        label: 'Evolução Temporal',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      },
      {
        id: 'municipal',
        label: 'Panorama Municipal',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
      },
      {
        id: 'comparativa',
        label: 'Análise Comparativa',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
      },
    ],
  },
  prodes: {
    name: 'PRODES / INPE',
    views: [
      {
        id: 'concordancia',
        label: 'Concordância Geral',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
      },
    ],
  },
  matopiba: {
    name: 'MATOPIBA',
    views: [
      {
        id: 'territorial',
        label: 'Visão Territorial',
        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20M12 2a14.5 14.5 0 010 20"/><path d="M2 12h20"/></svg>,
      },
    ],
  },
  dados: {
    name: 'Gestão de Dados',
    views: [],
  },
}

export function SecondaryPanel() {
  const { activeModule, activeView, setActiveView } = useAppStore()
  const meta = MODULE_META[activeModule]

  if (activeModule === 'dados') return null

  return (
    <aside className="secondary-panel">
      <div className="sp-header">Módulo</div>
      <div className="sp-module-name">{meta.name}</div>
      <div className="sp-sep" />

      {meta.views.map(v => (
        <button
          key={v.id}
          className={`sp-item${activeView === v.id ? ' active' : ''}`}
          onClick={() => setActiveView(v.id)}
        >
          <span className="sp-item-icon">{v.icon}</span>
          {v.label}
        </button>
      ))}
    </aside>
  )
}
