import { useState } from 'react'
import { AppShell }    from './core/layout/AppShell'
import { SplashScreen } from './core/layout/SplashScreen'

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AppShell />
    </>
  )
}
