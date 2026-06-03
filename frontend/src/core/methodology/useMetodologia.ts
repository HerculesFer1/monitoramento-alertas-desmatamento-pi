/**
 * useMetodologia.ts — estado global do drawer + página de metodologia.
 *
 * Dois estados independentes:
 *   - `isMetodologiaOpen` — sidebar lateral aberta (lista de módulos)
 *   - `selectedModuleForMeto` — módulo selecionado, cuja metodologia ocupa o
 *     `<main>` no AppShell. `null` significa que o dashboard continua normal.
 *
 * Implementado com useSyncExternalStore para que múltiplos componentes leiam
 * o mesmo estado sem precisar de Context.
 */
import { useSyncExternalStore } from 'react'
import type { Module } from '../store/useAppStore'

interface MetoState {
  isOpen:   boolean
  selected: Module | null
}

let state: MetoState = { isOpen: false, selected: null }
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot(): MetoState {
  return state
}

function setState(next: Partial<MetoState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export function useMetodologia() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    isMetodologiaOpen: s.isOpen,
    selectedModule:    s.selected,
    open:    () => setState({ isOpen: true }),
    close:   () => setState({ isOpen: false }),
    toggle:  () => setState({ isOpen: !state.isOpen }),
    /** Seleciona um módulo para abrir sua metodologia no <main>. Mantém o
     *  sidebar aberto para permitir trocar de módulo sem reabrir. */
    select:  (m: Module) => setState({ selected: m, isOpen: true }),
    /** Limpa a seleção — volta ao dashboard normal. */
    clearSelection: () => setState({ selected: null }),
  }
}
