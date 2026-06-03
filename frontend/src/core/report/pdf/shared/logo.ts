/**
 * logo.ts — Carrega o logo CGEO colorido como dataURL PNG para o PDF.
 *
 * jsPDF não renderiza SVG nativamente. Estratégia:
 *   1. fetch /logo.svg
 *   2. Renderiza em canvas (off-screen)
 *   3. Exporta como PNG dataURL — qualidade preservada, peso pequeno
 *
 * Cache em memoria para evitar refetch entre exports.
 */

let logoCache: string | null = null

/** Retorna o logo CGEO como dataURL PNG. */
export async function getLogoCgeoPng(): Promise<string> {
  if (logoCache) return logoCache

  const res = await fetch('/logo.svg')
  if (!res.ok) throw new Error(`Falha ao baixar logo: HTTP ${res.status}`)
  const svgText = await res.text()

  // Cria um Blob com o SVG e gera object URL
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve()
      img.onerror = (e) => reject(e)
      img.src = url
    })

    // Renderiza em canvas 256x256 (suficiente para PDFs A4 a 72dpi)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D não disponível')
    ctx.drawImage(img, 0, 0, 256, 256)
    const pngUrl = canvas.toDataURL('image/png')
    logoCache = pngUrl
    return pngUrl
  } finally {
    URL.revokeObjectURL(url)
  }
}
