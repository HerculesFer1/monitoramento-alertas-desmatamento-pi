/**
 * MetodologiaPage.tsx — Página de metodologia que ocupa o <main>.
 *
 * Substitui a view do dashboard quando o usuário seleciona um módulo no
 * sidebar de metodologia. Botão "voltar" limpa a seleção.
 */
import { ArrowLeft } from 'lucide-react'
import { METODOLOGIAS } from './content'
import { useMetodologia } from './useMetodologia'

export function MetodologiaPage() {
  const { selectedModule, clearSelection } = useMetodologia()
  if (!selectedModule) return null
  const meto = METODOLOGIAS[selectedModule]

  return (
    <>
      {/* Backdrop blur — cobre o topbar/rail/conteudo para evidenciar
          a troca de tela quando o usuario abre a metodologia pelo popover.
          A propria pagina (a seguir) fica acima e nao recebe o blur. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.32)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 30,
          animation: 'meto-backdrop-in .22s ease-out',
          pointerEvents: 'none',
        }}
      />

    <div className="metodologia-page" style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg1)',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 31,
      animation: 'meto-page-in .22s cubic-bezier(.2,.7,.2,1)',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--sep)',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
        background: 'var(--bg2)',
      }}>
        <button
          onClick={clearSelection}
          aria-label="Voltar ao dashboard"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent',
            border: '1px solid var(--sep)',
            color: 'var(--t2)',
            borderRadius: 7, padding: '5px 12px',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            transition: 'all .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${meto.cor}11`
            e.currentTarget.style.borderColor = `${meto.cor}55`
            e.currentTarget.style.color = 'var(--t1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'var(--sep)'
            e.currentTarget.style.color = 'var(--t2)'
          }}
        >
          <ArrowLeft size={14} />
          <span>Voltar ao dashboard</span>
        </button>

        <div style={{
          width: 1, height: 24, background: 'var(--sep)', margin: '0 4px',
        }} />

        <div style={{
          fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          Metodologia
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700, color: 'var(--t1)',
        }}>
          {meto.nomeModulo}
        </div>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: meto.cor, boxShadow: `0 0 8px ${meto.cor}77`,
          marginLeft: 4,
        }} />
      </header>

      {/* Conteúdo */}
      <div className="ranking-scroll" style={{
        flex: 1, overflowY: 'auto',
        padding: '24px 32px',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Secao corDestaque={meto.cor} secao={meto.pergunta} />
          <Secao corDestaque={meto.cor} secao={meto.fontes} />
          <Secao corDestaque={meto.cor} secao={meto.como_calcula} />
          <Secao corDestaque={meto.cor} secao={meto.simbologia} />
          <Secao corDestaque={meto.cor} secao={meto.limitacoes} />
        </div>
      </div>
      <style>{`
        @keyframes meto-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes meto-page-in {
          from { opacity: 0; transform: translateY(6px) scale(.995); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </div>
    </>
  )
}

function Secao({ secao, corDestaque }: { secao: { titulo: string; paragrafos: string[] }; corDestaque: string }) {
  return (
    <section style={{
      background: 'var(--bg3)',
      border: '1px solid var(--sep)',
      borderRadius: 12,
      padding: '20px 24px',
      boxShadow: 'var(--shadow)',
    }}>
      <h3 style={{
        fontSize: 12, fontWeight: 700,
        margin: '0 0 12px 0',
        textTransform: 'uppercase',
        letterSpacing: '.08em',
        color: corDestaque,
        borderLeft: `3px solid ${corDestaque}`,
        paddingLeft: 10,
      }}>
        {secao.titulo}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {secao.paragrafos.map((p, i) => (
          <p key={i} style={{
            fontSize: 13.5, lineHeight: 1.7, color: 'var(--t2)',
            margin: 0,
          }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  )
}
