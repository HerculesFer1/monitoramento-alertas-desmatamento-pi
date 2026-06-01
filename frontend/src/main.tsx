import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

// Sentry — ativo somente quando VITE_SENTRY_DSN está configurado.
// Não instrumenta em desenvolvimento local sem a variável.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment:       import.meta.env.MODE,          // "production" | "development"
    release:           import.meta.env.VITE_GIT_SHA,  // hash do commit (opcional)
    tracesSampleRate:  0.1,   // 10% das transações — ajustar após baseline
    replaysSessionSampleRate:  0,    // replay desativado (privacidade de dados ambientais)
    replaysOnErrorSampleRate:  0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Ignora erros de extensões de browser e rede instável
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Network Error',
      'Failed to fetch',
      /chrome-extension/,
    ],
    beforeSend(event) {
      // Não envia erros de ambiente dev sem DSN real
      if (import.meta.env.DEV && !SENTRY_DSN) return null
      return event
    },
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
