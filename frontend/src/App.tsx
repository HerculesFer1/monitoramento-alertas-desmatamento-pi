import { useState, useEffect } from 'react'
import { AppShell }    from './core/layout/AppShell'
import { SplashScreen } from './core/layout/SplashScreen'
import { useAppStore }  from './core/store/useAppStore'

export default function App() {
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
