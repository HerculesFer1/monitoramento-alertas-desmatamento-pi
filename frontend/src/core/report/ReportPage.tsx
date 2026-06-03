/**
 * ReportPage.tsx — Página de relatório que ocupa o <main>.
 *
 * Renderiza a partir do mesmo snapshot usado para o PDF — zero duplicação
 * de dados. Inclui um botão "Baixar PDF" (re-aproveitando o pipeline jsPDF
 * existente) e um dropdown "Analisar com IA".
 *
 * Acionada pelo dropdown do ReportTrigger no topbar. Botão "Voltar" limpa
 * o estado em useReportPage.
 */
import { useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { useReportData }     from './useReportData'
import { useReportPage }     from './useReportPage'
import { destaquesAutomaticos } from './conclusoes'
import { AnaliseIADropdown } from './AnaliseIADropdown'
import { gerarPdfEDownload } from './pdf/buildPdf'

export function ReportPage() {
  const { snapshot, carregando, disponivel } = useReportData()
  const { closeReport }                      = useReportPage()
  const [gerandoPdf, setGerandoPdf]          = useState(false)
  const [erroPdf,    setErroPdf]             = useState<string | null>(null)

  async function baixarPdf() {
    if (!snapshot) return
    setGerandoPdf(true)
    setErroPdf(null)
    try {
      await gerarPdfEDownload(snapshot)
    } catch (e) {
      setErroPdf(e instanceof Error ? e.message : 'Erro ao gerar PDF')
    } finally {
      setGerandoPdf(false)
    }
  }

  if (!disponivel) {
    return (
      <PageShell onVoltar={closeReport} corModulo="#94A3B8" nomeModulo="Relatório" ano="—" dataEmissao={new Date()}>
        <Card>
          <p style={{ fontSize: 14, color: 'var(--t2)', margin: 0 }}>
            Geração de relatório para este módulo está em construção.
          </p>
        </Card>
      </PageShell>
    )
  }

  if (carregando || !snapshot) {
    return (
      <PageShell onVoltar={closeReport} corModulo="#94A3B8" nomeModulo="Carregando…" ano="—" dataEmissao={new Date()}>
        <Card>
          <p style={{ fontSize: 14, color: 'var(--t3)', margin: 0 }}>Coletando dados do módulo…</p>
        </Card>
      </PageShell>
    )
  }

  const destaques = destaquesAutomaticos(snapshot)

  return (
    <PageShell
      onVoltar={closeReport}
      corModulo={snapshot.corModulo}
      nomeModulo={snapshot.nomeModulo}
      ano={snapshot.ano === 'all' ? 'Série 2022-2025' : String(snapshot.ano)}
      dataEmissao={snapshot.dataEmissao}
      acoes={
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={baixarPdf}
            disabled={gerandoPdf}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: 'var(--bg3)',
              border: '1px solid var(--sep)',
              color: 'var(--t1)',
              borderRadius: 8,
              cursor: gerandoPdf ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600,
              opacity: gerandoPdf ? 0.6 : 1,
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => { if (!gerandoPdf) e.currentTarget.style.background = 'var(--bg4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg3)' }}
          >
            <Download size={14} />
            <span>{gerandoPdf ? 'Gerando…' : 'Baixar PDF'}</span>
          </button>
          <AnaliseIADropdown snapshot={snapshot} />
        </div>
      }
    >
      {erroPdf && (
        <Card>
          <p style={{ color: 'var(--irr)', fontSize: 13, margin: 0 }}>Erro ao gerar PDF: {erroPdf}</p>
        </Card>
      )}

      {/* Resumo executivo */}
      {snapshot.resumoExecutivo.length > 0 && (
        <Section titulo="Resumo executivo" cor={snapshot.corModulo}>
          {snapshot.resumoExecutivo.map((p, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--t2)', margin: '0 0 8px 0' }}>{p}</p>
          ))}
        </Section>
      )}

      {/* KPIs */}
      {snapshot.kpis.length > 0 && (
        <Section titulo="Indicadores principais" cor={snapshot.corModulo}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
            gap: 12,
          }}>
            {snapshot.kpis.map((k, i) => (
              <div key={i} className="kpi-card" style={{ gap: 6 }}>
                <div className="kpi-label">{k.rotulo}</div>
                <div className="kpi-value" style={k.cor ? { color: k.cor, fontSize: 24 } : { fontSize: 24 }}>{k.valor}</div>
                {k.contexto && <div className="kpi-sub">{k.contexto}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Destaques automáticos */}
      {destaques.length > 0 && (
        <Section titulo="Destaques automáticos" cor={snapshot.corModulo}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {destaques.map((d, i) => (
              <li key={i} style={{
                fontSize: 13.5, lineHeight: 1.6, color: 'var(--t2)',
                padding: '8px 12px',
                background: 'var(--bg4)',
                borderLeft: `3px solid ${snapshot.corModulo}`,
                borderRadius: 4,
              }}>
                {d}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Tabela */}
      {snapshot.tabela && snapshot.tabela.linhas.length > 0 && (
        <Section titulo={snapshot.tabela.titulo} cor={snapshot.corModulo}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  {snapshot.tabela.cabecalho.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.tabela.linhas.map((linha, i) => (
                  <tr key={i}>
                    {linha.map((celula, j) => (
                      <td key={j} style={j === 0 ? { fontWeight: 600 } : undefined}>{String(celula)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Análise */}
      {snapshot.analise.length > 0 && (
        <Section titulo="Análise" cor={snapshot.corModulo}>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snapshot.analise.map((p, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--t2)' }}>{p}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Metodologia */}
      {snapshot.metodologia && (
        <Section titulo="Metodologia" cor={snapshot.corModulo}>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--t2)', margin: '0 0 12px 0' }}>
            <strong style={{ color: 'var(--t1)' }}>Pergunta:</strong> {snapshot.metodologia.pergunta}
          </p>
          {snapshot.metodologia.como_calcula.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '4px 0 6px 0' }}>
                Como o cálculo é feito
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {snapshot.metodologia.como_calcula.map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--t2)' }}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {/* Limitações */}
      {snapshot.limitacoes.length > 0 && (
        <Section titulo="Limitações conhecidas" cor="#F59E0B">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {snapshot.limitacoes.map((p, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>{p}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Fontes */}
      {snapshot.fontes.length > 0 && (
        <Section titulo="Fontes" cor="#64748B">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {snapshot.fontes.map((f, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--t3)' }}>{f}</li>
            ))}
          </ul>
        </Section>
      )}

      <div style={{
        marginTop: 8,
        padding: '12px 16px',
        background: 'rgba(245,158,11,.08)',
        border: '1px solid rgba(245,158,11,.25)',
        borderRadius: 8,
        fontSize: 12, color: 'var(--t2)',
        lineHeight: 1.55,
      }}>
        ⚠ <strong style={{ color: 'var(--t1)' }}>Estimativa exploratória</strong> — este relatório não substitui autuação ambiental institucional.
      </div>
    </PageShell>
  )
}

/* ─ Layout ───────────────────────────────────────────────────────────────── */

function PageShell({ children, onVoltar, corModulo, nomeModulo, ano, dataEmissao, acoes }: {
  children:    React.ReactNode
  onVoltar:    () => void
  corModulo:   string
  nomeModulo:  string
  ano:         string
  dataEmissao: Date
  acoes?:      React.ReactNode
}) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg1)',
      overflow: 'hidden',
    }}>
      <header style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--sep)',
        display: 'flex', alignItems: 'center', gap: 14,
        flexShrink: 0,
        background: 'var(--bg2)',
      }}>
        <button
          onClick={onVoltar}
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
            e.currentTarget.style.background  = `${corModulo}11`
            e.currentTarget.style.borderColor = `${corModulo}55`
            e.currentTarget.style.color       = 'var(--t1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = 'transparent'
            e.currentTarget.style.borderColor = 'var(--sep)'
            e.currentTarget.style.color       = 'var(--t2)'
          }}
        >
          <ArrowLeft size={14} />
          <span>Voltar ao dashboard</span>
        </button>

        <div style={{ width: 1, height: 26, background: 'var(--sep)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Relatório · {ano}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {nomeModulo}
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: corModulo, boxShadow: `0 0 8px ${corModulo}77`,
            }} />
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          Emitido em {dataEmissao.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
        </div>

        {acoes}
      </header>

      <div className="ranking-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function Section({ titulo, cor, children }: { titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--bg3)',
      border: '1px solid var(--sep)',
      borderRadius: 12,
      padding: '18px 22px',
      boxShadow: 'var(--shadow)',
    }}>
      <h3 style={{
        fontSize: 11, fontWeight: 700,
        margin: '0 0 14px 0',
        textTransform: 'uppercase', letterSpacing: '.08em',
        color: cor,
        borderLeft: `3px solid ${cor}`,
        paddingLeft: 10,
      }}>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--sep)',
      borderRadius: 12,
      padding: '24px',
      boxShadow: 'var(--shadow)',
      textAlign: 'center',
    }}>
      {children}
    </div>
  )
}
