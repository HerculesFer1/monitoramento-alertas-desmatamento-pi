/**
 * buildPdf.ts — Orquestra a geração de um PDF a partir de um ReportSnapshot.
 *
 * Lazy-load: jsPDF + autotable só baixam quando o usuário clica Exportar.
 * Se as fontes custom (Inter/JetBrainsMono) falharem, usa Helvetica/Courier
 * automaticamente — o PDF sempre sai.
 */
import type { ReportSnapshot } from '../types'
import { A4, COR, FONTE } from './styles'
import { loadPdfFonts } from './fonts'
import { desenharCapa } from './shared/cover'
import { desenharPageHeader, desenharPageFooter, type PageContext } from './shared/page'

export function nomeArquivoPdf(snap: ReportSnapshot): string {
  const data = snap.dataEmissao.toISOString().slice(0, 10)
  const ano  = snap.ano === 'all' ? 'todos' : String(snap.ano)
  return `redd-piaui_${snap.modulo}_${ano}_${data}.pdf`
}

export async function gerarPdfEDownload(snap: ReportSnapshot): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const autoTableModule    = await import('jspdf-autotable')
  const autoTable          = autoTableModule.default ?? autoTableModule

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // Tenta registrar Inter + JetBrains Mono; se falhar, cai pra built-in
  const { textFamily, monoFamily } = await loadPdfFonts(doc)
  doc.setFont(textFamily, 'normal')

  const ctx: PageContext = {
    modulo:    snap.moduloChave,
    corModulo: snap.corModulo,
    dataEmissaoStr: snap.dataEmissao.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }),
    textFamily,
    monoFamily,
  }

  await desenharCapa(doc, {
    modulo:         snap.moduloChave,
    tituloCompleto: snap.nomeModulo,
    corModulo:      snap.corModulo,
    ano:            snap.ano,
    dataEmissao:    snap.dataEmissao,
    textFamily,
    monoFamily,
  })

  doc.addPage()
  desenharPageHeader(doc, ctx)

  let y = 60
  y = secaoTitulo(doc, ctx, 'Resumo Executivo', snap.corModulo, y)
  y = paragrafos(doc, ctx, snap.resumoExecutivo, y)
  y += 14

  y = secaoTitulo(doc, ctx, 'Indicadores Principais', snap.corModulo, y)
  for (const k of snap.kpis) {
    y = renderKpi(doc, ctx, k, y)
  }
  y += 8

  if (y > A4.altura - 200) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
  y = secaoTitulo(doc, ctx, 'Análise dos Resultados', snap.corModulo, y)
  y = paragrafos(doc, ctx, snap.analise, y)

  if (snap.tabela) {
    if (y > A4.altura - 200) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
    y = secaoTitulo(doc, ctx, snap.tabela.titulo, snap.corModulo, y)
    autoTable(doc, {
      startY: y,
      head: [snap.tabela.cabecalho],
      body: snap.tabela.linhas.map(l => l.map(String)),
      margin: { left: A4.margemH, right: A4.margemH, bottom: 80 },
      styles: {
        font: textFamily,
        fontSize: FONTE.numero_tabela,
        textColor: COR.texto,
        cellPadding: 6,
      },
      headStyles: {
        font: textFamily,
        fontStyle: 'bold',
        fillColor: snap.corModulo,
        textColor: '#FFFFFF',
        fontSize: FONTE.numero_tabela,
      },
      bodyStyles: { font: monoFamily },
      columnStyles: {
        0: { font: textFamily, fontStyle: 'bold', textColor: COR.texto },
      },
      didDrawPage: () => desenharPageHeader(doc, ctx),
    })
    // @ts-expect-error — autotable adiciona finalY ao doc
    y = (doc.lastAutoTable?.finalY ?? y) + 18
  }

  if (y > A4.altura - 200) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
  y = secaoTitulo(doc, ctx, 'Metodologia', snap.corModulo, y)
  y = paragrafos(doc, ctx, [snap.metodologia.pergunta], y)
  y += 6
  y = paragrafos(doc, ctx, snap.metodologia.como_calcula, y)

  if (y > A4.altura - 160) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
  y = secaoTitulo(doc, ctx, 'Limitações', snap.corModulo, y)
  y = paragrafos(doc, ctx, snap.limitacoes, y)

  if (y > A4.altura - 140) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
  y = secaoTitulo(doc, ctx, 'Fontes', snap.corModulo, y)
  doc.setFont(textFamily, 'normal')
  doc.setFontSize(FONTE.corpo_pequeno)
  doc.setTextColor(COR.textoSec)
  for (const f of snap.fontes) {
    if (y > A4.altura - 80) { doc.addPage(); desenharPageHeader(doc, ctx); y = 60 }
    doc.text(`• ${f}`, A4.margemH, y)
    y += 14
  }

  const total = doc.getNumberOfPages()
  for (let i = 2; i <= total; i++) {
    doc.setPage(i)
    desenharPageFooter(doc, i, total, ctx)
  }

  const blob = doc.output('blob')
  const fileName = nomeArquivoPdf(snap)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return blob
}

// ── Helpers internos ──────────────────────────────────────────────────────

function secaoTitulo(
  doc: import('jspdf').jsPDF, ctx: PageContext,
  titulo: string, cor: string, y: number,
): number {
  doc.setFont(ctx.textFamily, 'bold')
  doc.setFontSize(FONTE.secao_titulo)
  doc.setTextColor(cor)
  doc.text(titulo.toUpperCase(), A4.margemH, y)
  doc.setDrawColor(cor)
  doc.setLineWidth(1.5)
  doc.line(A4.margemH, y + 4, A4.margemH + 30, y + 4)
  return y + 22
}

function paragrafos(
  doc: import('jspdf').jsPDF, ctx: PageContext,
  textos: string[], yInicial: number,
): number {
  doc.setFont(ctx.textFamily, 'normal')
  doc.setFontSize(FONTE.corpo)
  doc.setTextColor(COR.texto)
  let y = yInicial
  const maxW = A4.largura - 2 * A4.margemH
  for (const t of textos) {
    const linhas = doc.splitTextToSize(t, maxW)
    for (const l of linhas) {
      if (y > A4.altura - 80) {
        doc.addPage()
        desenharPageHeader(doc, ctx)
        y = 60
      }
      doc.text(l, A4.margemH, y)
      y += 13
    }
    y += 4
  }
  return y
}

interface KpiRender {
  rotulo:    string
  valor:     string
  contexto?: string
  cor?:      string
}

function renderKpi(
  doc: import('jspdf').jsPDF, ctx: PageContext,
  k: KpiRender, yInicial: number,
): number {
  const y = yInicial
  if (k.cor) {
    doc.setFillColor(k.cor)
    doc.circle(A4.margemH + 4, y - 3, 3, 'F')
  }
  doc.setFont(ctx.textFamily, 'bold')
  doc.setFontSize(FONTE.corpo)
  doc.setTextColor(COR.textoSec)
  doc.text(k.rotulo, A4.margemH + 16, y)

  doc.setFont(ctx.monoFamily, 'bold')
  doc.setFontSize(FONTE.corpo)
  doc.setTextColor(k.cor ?? COR.texto)
  doc.text(k.valor, A4.largura - A4.margemH, y, { align: 'right' })

  let next = y + 12
  if (k.contexto) {
    doc.setFont(ctx.textFamily, 'normal')
    doc.setFontSize(FONTE.corpo_pequeno)
    doc.setTextColor(COR.textoSuave)
    doc.text(k.contexto, A4.margemH + 16, next)
    next += 11
  }
  return next + 4
}
