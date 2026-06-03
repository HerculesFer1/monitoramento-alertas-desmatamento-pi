/**
 * ReportPreviewModal.tsx — Modal de pré-visualização do relatório.
 *
 * Mostra os indicadores principais + resumo executivo + indicação visual
 * do que vai entrar no PDF. Botão Exportar dispara a geração (lazy-load
 * de jsPDF acontece nesse momento).
 */
import { useState } from 'react'
import { X, Download } from 'lucide-react'
import { useReportData } from './useReportData'
import { gerarPdfEDownload, nomeArquivoPdf } from './pdf/buildPdf'

interface Props {
  open:    boolean
  onClose: () => void
}

export function ReportPreviewModal({ open, onClose }: Props) {
  const { snapshot, carregando, disponivel } = useReportData()
  const [gerando, setGerando] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  if (!open) return null

  async function exportar() {
    if (!snapshot) return
    setGerando(true)
    setErro(null)
    try {
      await gerarPdfEDownload(snapshot)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.5)',
          zIndex: 9990, backdropFilter: 'blur(2px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pré-visualização do relatório"
        style={{
          position: 'fixed',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(640px, 92vw)',
          maxHeight: '88vh',
          background: 'var(--bg1, #161616)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          zIndex: 9991,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Pré-visualização do relatório
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginTop: 2 }}>
              {snapshot ? snapshot.nomeModulo : 'Carregando…'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,.08)',
              color: 'var(--t2)', cursor: 'pointer',
              borderRadius: 6, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="ranking-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {!disponivel && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
              <p style={{ margin: 0 }}>
                Geração de PDF para este módulo está em construção.
              </p>
              <p style={{ marginTop: 8, fontSize: 11 }}>
                MapBiomas Alertas é o único módulo com template pronto nesta versão.
              </p>
            </div>
          )}

          {disponivel && carregando && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
              Carregando dados do módulo…
            </div>
          )}

          {snapshot && (
            <>
              {/* Capa preview */}
              <div style={{
                padding: 16,
                background: `linear-gradient(135deg, ${snapshot.corModulo}11, transparent)`,
                border: `1px solid ${snapshot.corModulo}33`,
                borderRadius: 10,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 10, letterSpacing: '.06em', color: 'var(--t3)', textTransform: 'uppercase' }}>
                  Período de análise
                </div>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: snapshot.corModulo, marginTop: 4 }}>
                  {snapshot.ano === 'all' ? '2022–2025' : snapshot.ano}
                </div>
              </div>

              {/* KPIs preview */}
              <section style={{ marginBottom: 16 }}>
                <h3 style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.06em', color: snapshot.corModulo,
                  borderLeft: `3px solid ${snapshot.corModulo}`, paddingLeft: 8,
                  margin: '0 0 10px 0',
                }}>
                  Indicadores principais
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {snapshot.kpis.map(k => (
                    <div key={k.rotulo} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 6,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>{k.rotulo}</div>
                        {k.contexto && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{k.contexto}</div>}
                      </div>
                      <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: k.cor ?? 'var(--t1)' }}>
                        {k.valor}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Resumo executivo preview */}
              <section style={{ marginBottom: 14 }}>
                <h3 style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.06em', color: snapshot.corModulo,
                  borderLeft: `3px solid ${snapshot.corModulo}`, paddingLeft: 8,
                  margin: '0 0 10px 0',
                }}>
                  Resumo executivo
                </h3>
                {snapshot.resumoExecutivo.map((p, i) => (
                  <p key={i} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--t2)', margin: '0 0 8px 0' }}>
                    {p}
                  </p>
                ))}
              </section>

              <div style={{
                padding: 10, marginTop: 16,
                background: 'rgba(245, 158, 11, .07)',
                border: '1px solid rgba(245, 158, 11, .2)',
                borderRadius: 8,
                fontSize: 10, color: 'var(--t3)', lineHeight: 1.5,
              }}>
                <strong style={{ color: '#F59E0B' }}>⚠ Estimativa exploratória</strong> — não substitui
                autuação ambiental institucional. Comparações e variações sempre apresentadas com
                referência explícita.
              </div>

              {erro && (
                <div style={{
                  padding: 10, marginTop: 10,
                  background: 'rgba(239, 68, 68, .1)',
                  border: '1px solid rgba(239, 68, 68, .3)',
                  borderRadius: 6,
                  fontSize: 11, color: '#FCA5A5',
                }}>
                  Erro ao gerar PDF: {erro}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer style={{
          padding: '12px 18px',
          borderTop: '1px solid rgba(255,255,255,.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            {snapshot && <span>Nome do arquivo: <code style={{ fontFamily: 'JetBrains Mono', fontSize: 10 }}>{nomeArquivoPdf(snapshot)}</code></span>}
          </div>
          <button
            onClick={exportar}
            disabled={!snapshot || gerando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none', cursor: snapshot ? 'pointer' : 'not-allowed',
              background: snapshot ? (snapshot.corModulo) : '#444',
              color: '#fff', fontSize: 12, fontWeight: 700,
              opacity: gerando ? .7 : 1,
            }}
          >
            <Download size={14} />
            {gerando ? 'Gerando PDF…' : 'Exportar PDF'}
          </button>
        </footer>
      </div>
    </>
  )
}
