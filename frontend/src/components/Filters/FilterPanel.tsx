import { useMemo, useRef, useState, useEffect } from 'react'
import { useAppStore, type AnoFiltro } from '../../store/useAppStore'
import { useAgregado } from '../../lib/hooks'
import { top20, VP_PTBR, ANOS } from '../../lib/constants'

const BIOMAS = ['Cerrado', 'Caatinga']
const PRESSOES = Object.entries(VP_PTBR).map(([k, v]) => ({ key: k, label: v }))

const sel: React.CSSProperties = {
  background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--sep)',
  borderRadius: 7, padding: '4px 8px', fontSize: 12, outline: 'none', cursor: 'pointer',
  minWidth: 110,
}

const OPCOES_ANO: AnoFiltro[] = ['all', ...ANOS]

export function FilterPanel() {
  const { data: agregado } = useAgregado()

  const municipios = useMemo(() => {
    if (agregado?.length) {
      return [...new Set(agregado.map(r => r.municipio))].sort()
    }
    return top20.map(([m]) => m)
  }, [agregado])

  const {
    anoFiltro, setAnoFiltro,
    biomaFiltro, setBioma,
    municipioFiltro, setMunicipio,
    vpressaoFiltro, setVpressao,
    matopibaFiltro, setMatopiba,
    resetFiltros,
  } = useAppStore()

  // Popup de seleção de ano
  const [anoOpen, setAnoOpen] = useState(false)
  const anoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (anoRef.current && !anoRef.current.contains(e.target as Node)) setAnoOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasFiltro = biomaFiltro || municipioFiltro || vpressaoFiltro
    || matopibaFiltro !== null || anoFiltro !== 'all'

  const anoLabel = anoFiltro === 'all' ? 'Todos' : String(anoFiltro)

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      padding: '10px 16px', background: 'var(--bg2)',
      borderBottom: '1px solid var(--sep)', fontSize: 12,
    }}>

      {/* ── Ano — popup flutuante ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>Ano</span>
        <div style={{ position: 'relative' }} ref={anoRef}>
          <button
            onClick={() => setAnoOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all .15s',
              border: anoFiltro !== 'all'
                ? '1px solid rgba(16,185,129,.4)'
                : '1px solid var(--sep)',
              background: anoFiltro !== 'all' ? 'var(--aut-bg)' : 'var(--bg3)',
              color: anoFiltro !== 'all' ? 'var(--aut)' : 'var(--t2)',
            }}
          >
            {anoLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
              style={{ opacity: 0.6, transform: anoOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
              <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </button>

          {anoOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
              background: 'var(--bg3)', border: '1px solid var(--sep)',
              borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
              display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130,
            }}>
              {OPCOES_ANO.map(v => (
                <button
                  key={v}
                  onClick={() => { setAnoFiltro(v); setAnoOpen(false) }}
                  style={{
                    textAlign: 'left', padding: '6px 10px', borderRadius: 6,
                    border: anoFiltro === v
                      ? '1px solid rgba(16,185,129,.35)'
                      : '1px solid transparent',
                    background: anoFiltro === v ? 'var(--aut-bg)' : 'transparent',
                    color: anoFiltro === v ? 'var(--aut)' : 'var(--t2)',
                    fontSize: 12, fontWeight: anoFiltro === v ? 600 : 400,
                    cursor: 'pointer', transition: 'all .1s',
                  }}
                >
                  {v === 'all' ? 'Todos os anos' : v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--sep)' }} />

      {/* Bioma */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>Bioma</span>
        <select value={biomaFiltro ?? ''} onChange={e => setBioma(e.target.value || null)} style={sel}>
          <option value="">Todos</option>
          {BIOMAS.map(b => <option key={b}>{b}</option>)}
        </select>
      </div>

      {/* Município */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>Município</span>
        <select value={municipioFiltro ?? ''} onChange={e => setMunicipio(e.target.value || null)} style={{ ...sel, minWidth: 160 }}>
          <option value="">Todos</option>
          {municipios.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Pressão */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>Pressão</span>
        <select value={vpressaoFiltro ?? ''} onChange={e => setVpressao(e.target.value || null)} style={sel}>
          <option value="">Todos</option>
          {PRESSOES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {/* MATOPIBA toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>MATOPIBA</span>
        <button
          onClick={() => setMatopiba(matopibaFiltro ? null : true)}
          style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', transition: 'all .15s',
            border: matopibaFiltro ? '1px solid rgba(245,158,11,.4)' : '1px solid var(--sep)',
            background: matopibaFiltro ? 'var(--mat-bg)' : 'var(--bg3)',
            color: matopibaFiltro ? 'var(--mat)' : 'var(--t3)',
          }}
        >
          {matopibaFiltro ? '✓ Ativo' : 'Filtrar'}
        </button>
      </div>

      {/* Limpar */}
      {hasFiltro && (
        <>
          <div style={{ width: 1, height: 20, background: 'var(--sep)' }} />
          <button onClick={resetFiltros} style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: '1px solid var(--sep)',
            background: 'transparent', color: 'var(--t3)',
            transition: 'all .15s',
          }}>
            ✕ Limpar filtros
          </button>
        </>
      )}
    </div>
  )
}
