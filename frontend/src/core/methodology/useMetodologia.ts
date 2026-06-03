/**
 * useMetodologia.ts — estado global simples do drawer de Metodologia.
 *
 * Sem reducer / Zustand — basta um booleano compartilhado. Implementado com
 * useSyncExternalStore para que multiplos componentes (PrimaryRail abre,
 * AppShell renderiza) leiam o mesmo estado sem precisar de Context.
 */
import { useSyncExternalStore } from 'react'

let isOpen = false
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot() {
  return isOpen
}

function setOpen(value: boolean) {
  isOpen = value
  listeners.forEach(l => l())
}

export function useMetodologia() {
  const isMetodologiaOpen = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    isMetodologiaOpen,
    open:   () => setOpen(true),
    close:  () => setOpen(false),
    toggle: () => setOpen(!isOpen),
  }
}
