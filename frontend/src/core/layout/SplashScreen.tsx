import { useEffect, useRef, useState } from 'react'

interface Props {
  onDone: () => void
}

export function SplashScreen({ onDone }: Props) {
  const wrapRef  = useRef<HTMLDivElement>(null)
  const doneRef  = useRef(onDone)
  doneRef.current = onDone

  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    fetch('/logo-splash.svg')
      .then(r => r.text())
      .then(html => {
        const wrap = wrapRef.current
        if (!wrap) return

        wrap.innerHTML = html

        const svg = wrap.querySelector('svg')
        if (!svg) return

        svg.setAttribute('width',  '100%')
        svg.setAttribute('height', '100%')
        svg.style.display = 'block'

        // Pegar todos os <g> de nível superior (elementos visíveis, excluindo <defs>)
        const rawGroups = Array.from(svg.children).filter(
          el => el.tagName === 'g'
        ) as SVGGraphicsElement[]

        // Ordenar de cima para baixo pelo centro vertical do bounding box
        const groups = rawGroups.slice().sort((a, b) => {
          const ay = a.getBBox().y + a.getBBox().height / 2
          const by = b.getBBox().y + b.getBBox().height / 2
          return by - ay
        })

        // Iniciar todos invisíveis
        groups.forEach(g => {
          (g as unknown as HTMLElement).style.opacity = '0'
        })

        // Fade sequencial: cada elemento aparece 45ms após o anterior
        const STAGGER  = 45   // ms entre elementos
        const DURATION = 0.30 // s de transição
        const START    = 80   // ms antes do primeiro elemento

        groups.forEach((g, i) => {
          const t = setTimeout(() => {
            ;(g as unknown as HTMLElement).style.transition = `opacity ${DURATION}s ease`
            ;(g as unknown as HTMLElement).style.opacity    = '1'
          }, START + i * STAGGER)
          timers.push(t)
        })

        // Dismiss após todos aparecerem + hold de 500ms
        const totalEntrance = START + groups.length * STAGGER + DURATION * 1000
        const tOut = setTimeout(() => {
          setLeaving(true)
          const tDone = setTimeout(() => doneRef.current(), 520)
          timers.push(tDone)
        }, totalEntrance + 500)
        timers.push(tOut)
      })
      .catch(() => {
        setLeaving(true)
        const t = setTimeout(() => doneRef.current(), 520)
        timers.push(t)
      })

    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28,
      opacity:    leaving ? 0 : 1,
      transition: leaving ? 'opacity 0.52s ease' : 'none',
      pointerEvents: leaving ? 'none' : 'all',
    }}>

      {/* Logo SVG — injetado dinamicamente, elementos animados em sequência */}
      <div
        ref={wrapRef}
        style={{ width: 220, height: 260 }}
      />

      <div style={{
        fontSize: 11, fontWeight: 600,
        color: 'rgba(255,255,255,.22)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        CGEO · SEMARH-PI
      </div>
    </div>
  )
}
