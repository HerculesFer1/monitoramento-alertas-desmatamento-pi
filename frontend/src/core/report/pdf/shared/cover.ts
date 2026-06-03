/**
 * cover.ts — Renderiza a capa do relatório (primeira página).
 */
import type jsPDF from 'jspdf'
import { A4, COR, FONTE } from '../styles'
import { getLogoCgeoPng } from './logo'

export interface CoverProps {
  modulo:    string
  tituloCompleto: string
  corModulo: string
  ano:       number | 'all'
  dataEmissao: Date
  textFamily: string  // 'Inter' ou 'helvetica' (fallback)
  monoFamily: string  // 'JetBrainsMono' ou 'courier' (fallback)
}

export async function desenharCapa(doc: jsPDF, p: CoverProps): Promise<void> {
  const cx = A4.largura / 2

  try {
    const png = await getLogoCgeoPng()
    doc.addImage(png, 'PNG', cx - 50, 80, 100, 100)
  } catch { /* sem logo */ }

  doc.setFont(p.textFamily, 'bold')
  doc.setFontSize(FONTE.capa_subtitulo)
  doc.setTextColor(COR.textoSec)
  doc.text('CGEO / SEMARH-PI', cx, 210, { align: 'center' })

  doc.setFont(p.textFamily, 'normal')
  doc.setFontSize(FONTE.corpo_pequeno)
  doc.setTextColor(COR.textoSuave)
  doc.text('Centro de Geotecnologia Fundiária e Ambiental', cx, 226, { align: 'center' })

  doc.setDrawColor(p.corModulo)
  doc.setLineWidth(2)
  doc.line(cx - 60, 252, cx + 60, 252)

  doc.setFont(p.textFamily, 'bold')
  doc.setFontSize(FONTE.pagina_titulo)
  doc.setTextColor(COR.texto)
  doc.text('RELATÓRIO TÉCNICO', cx, 290, { align: 'center' })

  doc.setFontSize(FONTE.capa_titulo)
  doc.setTextColor(p.corModulo)
  doc.text(p.modulo, cx, 330, { align: 'center' })

  doc.setFont(p.textFamily, 'normal')
  doc.setFontSize(FONTE.capa_subtitulo)
  doc.setTextColor(COR.textoSec)
  const linhas = doc.splitTextToSize(p.tituloCompleto, A4.largura - 200)
  doc.text(linhas, cx, 360, { align: 'center' })

  const periodo = p.ano === 'all' ? '2022–2025 (todos)' : String(p.ano)
  const dataEmissaoStr = p.dataEmissao.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  const metaY = 480
  doc.setFont(p.textFamily, 'normal')
  doc.setFontSize(FONTE.corpo_pequeno)
  doc.setTextColor(COR.textoSec)
  doc.text('PERÍODO DE ANÁLISE', cx, metaY, { align: 'center' })
  doc.setFont(p.monoFamily, 'bold')
  doc.setFontSize(FONTE.numero_medio)
  doc.setTextColor(COR.texto)
  doc.text(periodo, cx, metaY + 18, { align: 'center' })

  doc.setFont(p.textFamily, 'normal')
  doc.setFontSize(FONTE.corpo_pequeno)
  doc.setTextColor(COR.textoSec)
  doc.text('DATA DE EMISSÃO', cx, metaY + 50, { align: 'center' })
  doc.setFont(p.monoFamily, 'bold')
  doc.setFontSize(FONTE.numero_medio)
  doc.setTextColor(COR.texto)
  doc.text(dataEmissaoStr, cx, metaY + 68, { align: 'center' })

  doc.setFont(p.textFamily, 'normal')
  doc.setFontSize(FONTE.footer)
  doc.setTextColor(COR.destaqueAmbar)
  doc.text(
    '⚠ Estimativa exploratória — não substitui autuação ambiental institucional.',
    cx, A4.altura - 50, { align: 'center' },
  )
}
