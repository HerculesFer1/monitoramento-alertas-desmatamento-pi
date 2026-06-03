/**
 * fonts.ts — Resolução de fontes para o PDF.
 *
 * **MVP**: usa Helvetica + Courier embutidas no jsPDF — peso zero, sempre
 * disponíveis, suporte Unicode parcial via WinAnsiEncoding.
 *
 * **Por que não Inter + JetBrains Mono ainda**:
 *   - jsPDF usa opentype.js para parsear TTFs. Versões modernas das fontes
 *     (Inter 4.x e JetBrains Mono 2.x+) usam tabelas CMAP estendidas (Format 4
 *     ou 12 com sequências Unicode complexas) que o parser jsPDF rejeita
 *     com "No unicode cmap for font".
 *   - O caminho viável é usar versões legacy das fontes (TTF compatível ANSI):
 *     Inter v2.x ou anteriores; JetBrains Mono v1.x. Documentado no
 *     roadmap como item de polimento.
 *
 * Mesmo com Helvetica/Courier, o relatório institucional preserva:
 *   - Hierarquia tipográfica (regular/bold/sizes)
 *   - Cor temática por módulo
 *   - Tabular nums via 'courier' para valores
 *   - Acentos pt-BR (jsPDF Helvetica suporta WinAnsi)
 */
import type jsPDF from 'jspdf'

export interface LoadFontsResult {
  custom:     boolean
  textFamily: string
  monoFamily: string
}

export async function loadPdfFonts(_doc: jsPDF): Promise<LoadFontsResult> {
  return { custom: false, textFamily: 'helvetica', monoFamily: 'courier' }
}
