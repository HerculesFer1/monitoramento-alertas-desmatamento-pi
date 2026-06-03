/**
 * page.ts — Header e footer de cada página interna.
 */
import type jsPDF from 'jspdf'
import { A4, COR, FONTE } from '../styles'

export interface PageContext {
  modulo:    string
  corModulo: string
  dataEmissaoStr: string
  textFamily: string
  monoFamily: string
}

export function desenharPageHeader(doc: jsPDF, ctx: PageContext): void {
  doc.setFont(ctx.textFamily, 'normal')
  doc.setFontSize(FONTE.header_pequeno)
  doc.setTextColor(COR.textoSuave)
  doc.text('CGEO / SEMARH-PI', A4.margemH, 24)

  doc.setFont(ctx.textFamily, 'bold')
  doc.setTextColor(ctx.corModulo)
  doc.text(ctx.modulo, A4.largura - A4.margemH, 24, { align: 'right' })

  doc.setDrawColor(COR.separador)
  doc.setLineWidth(0.5)
  doc.line(A4.margemH, 32, A4.largura - A4.margemH, 32)
}

export function desenharPageFooter(
  doc: jsPDF, paginaAtual: number, totalPaginas: number, ctx: PageContext,
): void {
  const y = A4.altura - A4.margemFooter
  doc.setDrawColor(COR.separador)
  doc.setLineWidth(0.5)
  doc.line(A4.margemH, y - 14, A4.largura - A4.margemH, y - 14)

  doc.setFont(ctx.textFamily, 'normal')
  doc.setFontSize(FONTE.footer)
  doc.setTextColor(COR.textoSuave)
  doc.text('⚠ Estimativa exploratória — não substitui autuação ambiental.', A4.margemH, y)
  doc.text(`Emitido em ${ctx.dataEmissaoStr}`, A4.largura / 2, y, { align: 'center' })

  doc.setFont(ctx.monoFamily, 'normal')
  doc.text(`${paginaAtual} / ${totalPaginas}`, A4.largura - A4.margemH, y, { align: 'right' })
}
