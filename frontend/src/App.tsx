import { useState, useEffect } from 'react'
import * as Sentry from '@sentry/react'
import { AppShell }    from './core/layout/AppShell'
import { SplashScreen } from './core/layout/SplashScreen'
import { useAppStore }  from './core/store/useAppStore'

function CrashFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16, padding: 24,
      fontFamily: 'system-ui', color: '#EF4444', background: '#0a0a0a',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Erro inesperado no dashboard</div>
      <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 420 }}>
        O erro foi registrado automaticamente. Tente recarregar a página.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8, padding: '8px 20px', borderRadius: 8,
          background: '#EF4444', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >
        Recarregar
      </button>
    </div>
  )
}

function AppInner() {
  const [splashDone, setSplashDone] = useState(false)
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AppShell />
    </>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<CrashFallback />} showDialog={false}>
      <AppInner />
    </Sentry.ErrorBoundary>
  )
}
