/**
 * useReportPage.ts — Estado global da página de relatório web.
 *
 * Quando `isReportOpen` é true, AppShell renderiza `ReportPage` no <main>
 * em lugar da view do dashboard. Mesmo padrão do useMetodologia.
 */
import { useSyncExternalStore } from 'react'

let isOpen = false
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function getSnapshot() { return isOpen }
function setOpen(v: boolean) {
  isOpen = v
  listeners.forEach(l => l())
}

export function useReportPage() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    isReportOpen: value,
    openReport:   () => setOpen(true),
    closeReport:  () => setOpen(false),
  }
}
