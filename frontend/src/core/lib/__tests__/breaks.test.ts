import { describe, it, expect } from 'vitest'
import {
  ckmeans,
  computeBreaks,
  fmtBreak,
  buildLabels,
  buildInterpolateExpression,
} from '../breaks'

describe('ckmeans — 1D Jenks Natural Breaks', () => {
  it('agrupa valores claramente bimodais em 2 clusters distintos', () => {
    const values = [1, 2, 3, 100, 101, 102]
    const clusters = ckmeans(values, 2)
    expect(clusters).toHaveLength(2)
    expect(clusters[0]).toEqual([1, 2, 3])
    expect(clusters[1]).toEqual([100, 101, 102])
  })

  it('preserva ordenação crescente dos clusters', () => {
    const values = [50, 1, 100, 2, 51]
    const clusters = ckmeans(values, 3)
    for (let i = 0; i < clusters.length - 1; i++) {
      const lastOfCurr = clusters[i][clusters[i].length - 1]
      const firstOfNext = clusters[i + 1][0]
      if (lastOfCurr != null && firstOfNext != null) {
        expect(lastOfCurr).toBeLessThanOrEqual(firstOfNext)
      }
    }
  })

  it('retorna clusters vazios quando k > n', () => {
    const clusters = ckmeans([1, 2], 5)
    // Sem garantia de qual posição fica vazia; valida total e que os valores entraram
    expect(clusters).toHaveLength(5)
    const flat = clusters.flat()
    expect(flat.sort()).toEqual([1, 2])
  })

  it('aceita lista vazia retornando k clusters vazios', () => {
    const clusters = ckmeans([], 3)
    expect(clusters).toHaveLength(3)
    expect(clusters.every(c => c.length === 0)).toBe(true)
  })

  it('filtra NaN e Infinity', () => {
    const values = [1, 2, NaN, Infinity, 100]
    const clusters = ckmeans(values, 2)
    const flat = clusters.flat()
    expect(flat).toEqual(expect.arrayContaining([1, 2, 100]))
    expect(flat).not.toContain(NaN)
    expect(flat).not.toContain(Infinity)
  })
})

describe('computeBreaks', () => {
  it('produz thresholds crescentes e n-1 limiares para n classes', () => {
    const values = Array.from({ length: 30 }, (_, i) => i * 100)
    const result = computeBreaks(values, 5)
    expect(result.thresholds).toHaveLength(4) // n-1
    for (let i = 0; i < result.thresholds.length - 1; i++) {
      expect(result.thresholds[i]).toBeLessThan(result.thresholds[i + 1])
    }
    expect(result.computed).toBe(true)
  })

  it('cai para fallback quando dados insuficientes', () => {
    const fallback = {
      thresholds: [10, 20, 30],
      ranges:     [] as Array<[number, number]>,
      counts:     [],
      computed:   true,
    }
    const result = computeBreaks([1, 2], 5, fallback)
    expect(result.thresholds).toEqual([10, 20, 30])
    expect(result.computed).toBe(false)
  })

  it('lança erro quando dados insuficientes e sem fallback', () => {
    expect(() => computeBreaks([1, 2], 5)).toThrow(/Insuficiente/)
  })

  it('ignora valores <= 0 (não-floresta / sem dado)', () => {
    const values = [0, -5, 100, 200, 300, 400, 500]
    const result = computeBreaks(values, 3)
    // Computou com 5 positivos — não falhou
    expect(result.computed).toBe(true)
    expect(result.thresholds.length).toBe(2)
  })
})

describe('fmtBreak', () => {
  it('formata milhões, milhares e unidades', () => {
    expect(fmtBreak(2_500_000)).toBe('2.5 M')
    expect(fmtBreak(15_000)).toBe('15 mil')
    expect(fmtBreak(42)).toBe('42')
  })

  it('lida com NaN/Infinity', () => {
    expect(fmtBreak(NaN)).toBe('—')
    expect(fmtBreak(Infinity)).toBe('—')
  })
})

describe('buildLabels', () => {
  it('gera "<", "X – Y" e ">"', () => {
    const labels = buildLabels([100, 1000, 5000], 'tC')
    expect(labels).toHaveLength(4)
    expect(labels[0]).toContain('<')
    expect(labels[1]).toContain('–')
    expect(labels[labels.length - 1]).toContain('>')
    expect(labels[0]).toContain('tC')
  })
})

describe('buildInterpolateExpression', () => {
  it('inclui zero como primeira parada', () => {
    const expr = buildInterpolateExpression('x', [10, 20], ['#000', '#111', '#222'])
    expect(expr[0]).toBe('interpolate')
    // Estrutura: ['interpolate', ['linear'], ['coalesce', ['get', 'x'], 0], 0, '#000', 10, '#111', 20, '#222']
    const stopsStart = 3
    expect(expr[stopsStart]).toBe(0)
    expect(expr[stopsStart + 1]).toBe('#000')
    expect(expr[stopsStart + 2]).toBe(10)
    expect(expr[stopsStart + 4]).toBe(20)
  })
})
