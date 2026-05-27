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

    fetch('/logo.svg')
      .then(r => r.text())
      .then(html => {
        const wrap = wrapRef.current
        if (!wrap) return

        wrap.innerHTML = html

        const svg = wrap.querySelector('svg')
        if (svg) {
          svg.setAttribute('width',  '100%')
          svg.setAttribute('height', '100%')
          svg.style.display = 'block'
          svg.style.filter  = 'drop-shadow(2px 3px 5px rgba(0,0,0,.9)) drop-shadow(-1px -1px 3px rgba(255,255,255,.07))'
        }

        // Collect all colored (non-white) leaf paths in DOM order
        const leaves = [...wrap.querySelectorAll<SVGPathElement>('path[fill]')]
          .filter(p => {
            const f = p.getAttribute('fill')
            return f && f !== '#ffffff' && f !== 'none'
          })

        // Hide every leaf
        leaves.forEach(l => { l.style.opacity = '0' })

        // Blink each leaf sequentially (150 ms apart)
        leaves.forEach((leaf, i) => {
          const t0 = setTimeout(() => {
            leaf.style.transition = 'opacity 0.1s'
            leaf.style.opacity = '0.9'
            const t1 = setTimeout(() => { leaf.style.opacity = '0.15' }, 110)
            const t2 = setTimeout(() => {
              leaf.style.transition = 'opacity 0.22s'
              leaf.style.opacity = '1'
            }, 260)
            timers.push(t1, t2)
          }, 180 + i * 170)
          timers.push(t0)
        })

        // After all leaves are visible, hold then fade out
        const total = 180 + leaves.length * 170 + 700
        const tOut = setTimeout(() => {
          setLeaving(true)
          const tDone = setTimeout(() => doneRef.current(), 520)
          timers.push(tDone)
        }, total)
        timers.push(tOut)
      })
      .catch(() => {
        // SVG unavailable — dismiss immediately
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

      {/* Tree SVG — injected dynamically */}
      <div
        ref={wrapRef}
        style={{ width: 148, height: 189 }}
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
