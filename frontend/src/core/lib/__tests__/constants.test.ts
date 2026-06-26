import { describe, it, expect } from 'vitest'
import {
  fmtHa, fmtNum,
  CHART_COLORS,
  YEARS, MESES,
  prodesData, prodesExtra,
  alertYr, classifYr, ipiYr, matopibaYr,
  ANO_MIN, ANO_DEFAULT, YEARS_AVAILABLE, ANOS, ANO_RECENTE_COMPLETO,
} from '../constants'

// ── fmtHa ─────────────────────────────────────────────────────────────────
describe('fmtHa', () => {
  it('formata valores abaixo de 1000 ha com arredondamento', () => {
    expect(fmtHa(500)).toBe('500 ha')
    expect(fmtHa(0)).toBe('0 ha')
    expect(fmtHa(999)).toBe('999 ha')
  })

  it('formata valores em k ha com 1 decimal', () => {
    expect(fmtHa(1_000)).toBe('1,0k ha')
    expect(fmtHa(15_500)).toBe('15,5k ha')
    expect(fmtHa(150_350)).toBe('150,4k ha')
  })

  it('formata valores em M ha com 1 decimal', () => {
    expect(fmtHa(1_000_000)).toBe('1,0M ha')
    expect(fmtHa(2_500_000)).toBe('2,5M ha')
  })
})

// ── fmtNum ────────────────────────────────────────────────────────────────
describe('fmtNum', () => {
  it('formata números inteiros com locale pt-BR', () => {
    expect(fmtNum(1234)).toBe('1.234')
    expect(fmtNum(4527)).toBe('4.527')
    expect(fmtNum(0)).toBe('0')
  })

  it('arredonda números fracionários', () => {
    expect(fmtNum(1234.7)).toBe('1.235')
  })
})

// ── CHART_COLORS ──────────────────────────────────────────────────────────
describe('CHART_COLORS', () => {
  const expectedKeys = ['irr', 'aut', 'autp', 'reg', 'mat', 'cerrado', 'caatinga', 'restPI'] as const

  it('tem todas as chaves semânticas', () => {
    for (const key of expectedKeys) {
      expect(CHART_COLORS).toHaveProperty(key)
    }
  })

  it('todos os valores são hexadecimais válidos', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/
    for (const [key, color] of Object.entries(CHART_COLORS)) {
      expect(color, `${key} deve ser hex`).toMatch(hexPattern)
    }
  })

  it('cores semânticas correspondem ao design-system', () => {
    expect(CHART_COLORS.irr).toBe('#EF4444')  // vermelho IRREGULAR
    expect(CHART_COLORS.aut).toBe('#10B981')  // verde AUTORIZADO
    expect(CHART_COLORS.reg).toBe('#F97316')  // laranja REGULARIZADO
    expect(CHART_COLORS.mat).toBe('#F59E0B')  // âmbar MATOPIBA
  })
})

// ── YEARS / MESES ─────────────────────────────────────────────────────────
describe('YEARS', () => {
  it('é alias de ANOS (anos do pipeline com dados completos)', () => {
    expect(YEARS).toEqual(ANOS)
  })
  it('contém pelo menos a série histórica original 2022–2025', () => {
    for (const ano of [2022, 2023, 2024, 2025]) {
      expect(YEARS).toContain(ano)
    }
  })
})

// ── REGRESSÃO B0: filtro de ano dinâmico ─────────────────────────────────
// Bug original (commit d90a69f): dropdown de ano travado em [2022..2025]
// mesmo com dados de 2026 ingeridos. Solução: YEARS_AVAILABLE inclui o
// ano corrente automaticamente para que módulos com ingestão contínua
// apareçam no UI sem rebuild do pipeline JSON.
describe('B0 regressão — filtro de ano dinâmico', () => {
  it('ANO_MIN é o menor ano da série histórica', () => {
    expect(ANO_MIN).toBe(Math.min(...ANOS))
    expect(ANO_MIN).toBeLessThanOrEqual(2022)
  })

  it('YEARS_AVAILABLE inclui o ano corrente do navegador', () => {
    const anoCorrente = new Date().getFullYear()
    expect(YEARS_AVAILABLE).toContain(anoCorrente)
  })

  it('YEARS_AVAILABLE inclui todos os anos de ANOS (pipeline)', () => {
    for (const ano of ANOS) {
      expect(YEARS_AVAILABLE, `Pipeline ano ${ano} deve estar em YEARS_AVAILABLE`).toContain(ano)
    }
  })

  it('YEARS_AVAILABLE está ordenado crescente', () => {
    const sorted = [...YEARS_AVAILABLE].sort((a, b) => a - b)
    expect([...YEARS_AVAILABLE]).toEqual(sorted)
  })

  it('YEARS_AVAILABLE não tem duplicatas', () => {
    expect(new Set(YEARS_AVAILABLE).size).toBe(YEARS_AVAILABLE.length)
  })

  it('YEARS_AVAILABLE não tem anos futuros (> ano corrente)', () => {
    const anoCorrente = new Date().getFullYear()
    for (const ano of YEARS_AVAILABLE) {
      expect(ano, `${ano} é futuro`).toBeLessThanOrEqual(anoCorrente)
    }
  })

  it('ANO_DEFAULT é o maior ano disponível (geralmente ano corrente)', () => {
    expect(ANO_DEFAULT).toBe(YEARS_AVAILABLE[YEARS_AVAILABLE.length - 1])
    expect(ANO_DEFAULT).toBe(Math.max(...YEARS_AVAILABLE))
  })

  it('ANO_DEFAULT >= maior ano de ANOS (pipeline)', () => {
    expect(ANO_DEFAULT).toBeGreaterThanOrEqual(Math.max(...ANOS))
  })

  it('ANO_RECENTE_COMPLETO < ANO_DEFAULT (sempre passado, nunca corrente)', () => {
    // O ano corrente é parcial; ANO_RECENTE_COMPLETO sempre aponta para o
    // ano fechado anterior (heurística: −1 se mês >=3, −2 se jan/fev).
    expect(ANO_RECENTE_COMPLETO).toBeLessThan(ANO_DEFAULT)
  })

  it('ANO_RECENTE_COMPLETO >= ANO_MIN (não retroage além da série histórica)', () => {
    expect(ANO_RECENTE_COMPLETO).toBeGreaterThanOrEqual(ANO_MIN)
  })
})

describe('MESES', () => {
  it('tem 12 meses', () => {
    expect(MESES.length).toBe(12)
  })
  it('começa em Jan e termina em Dez', () => {
    expect(MESES[0]).toBe('Jan')
    expect(MESES[11]).toBe('Dez')
  })
})

// ── Dados hardcoded PRODES / classificação ─────────────────────────────────
describe('prodesData', () => {
  it('tem 4 ciclos (2022–2025)', () => {
    expect(Object.keys(prodesData.ciclos).map(Number).sort()).toEqual([2022, 2023, 2024, 2025])
  })

  it('totais são coerentes com a soma dos ciclos', () => {
    const sumN    = Object.values(prodesData.ciclos).reduce((s, c) => s + c.n, 0)
    const sumConc = Object.values(prodesData.ciclos).reduce((s, c) => s + c.concordantes, 0)
    expect(prodesData.totalValidados).toBe(sumN)
    expect(prodesData.totalConcordantes).toBe(sumConc)
    expect(prodesData.totalDiscordantes).toBe(sumN - sumConc)
  })

  it('pct de concordância está dentro de [0, 100]', () => {
    for (const [ciclo, v] of Object.entries(prodesData.ciclos)) {
      expect(v.pct, `ciclo ${ciclo}`).toBeGreaterThanOrEqual(0)
      expect(v.pct, `ciclo ${ciclo}`).toBeLessThanOrEqual(100)
    }
  })
})

describe('prodesExtra', () => {
  it('irrAnual tem arrays de mesmo comprimento', () => {
    const { anos, confirmado, discordante, caatinga, semProdes } = prodesExtra.irrAnual
    expect(confirmado.length).toBe(anos.length)
    expect(discordante.length).toBe(anos.length)
    expect(caatinga.length).toBe(anos.length)
    expect(semProdes.length).toBe(anos.length)
  })

  it('distCob tem labels, n e ha de mesmo comprimento', () => {
    const { labels, n, ha } = prodesExtra.distCob
    expect(n.length).toBe(labels.length)
    expect(ha.length).toBe(labels.length)
  })

  it('topMun tem no máximo 10 entradas', () => {
    expect(prodesExtra.topMun.length).toBeLessThanOrEqual(10)
  })

  it('pct de cada município está em [0, 100]', () => {
    for (const m of prodesExtra.topMun) {
      expect(m.pct).toBeGreaterThanOrEqual(0)
      expect(m.pct).toBeLessThanOrEqual(100)
    }
  })

  it('haIrrConfirmado > 0', () => {
    expect(prodesExtra.haIrrConfirmado).toBeGreaterThan(0)
  })

  it('pctIrrConfirmado está em [0, 100]', () => {
    expect(prodesExtra.pctIrrConfirmado).toBeGreaterThanOrEqual(0)
    expect(prodesExtra.pctIrrConfirmado).toBeLessThanOrEqual(100)
  })
})

// ── Coerência interna dos dados de classificação ───────────────────────────
describe('alertYr / classifYr / ipiYr', () => {
  it('IPI calculado é coerente com irregular/total (±1 pp de arredondamento)', () => {
    for (const ano of YEARS) {
      const irr  = classifYr[ano].irregular
      const area = alertYr[ano].area
      const ipiCalculado = irr / area * 100
      expect(Math.abs(ipiCalculado - ipiYr[ano])).toBeLessThanOrEqual(1)
    }
  })

  it('cerrado + caatinga ≈ area total (≤ 1% de diferença por arredondamento)', () => {
    for (const ano of YEARS) {
      const { area, cerrado, caatinga } = alertYr[ano]
      const diff = Math.abs(cerrado + caatinga - area) / area
      expect(diff).toBeLessThanOrEqual(0.01)
    }
  })

  it('matopibaYr mat + rest ≤ irregular do mesmo ano (sempre dentro da área irregular)', () => {
    for (const ano of YEARS) {
      const { mat, rest } = matopibaYr[ano]
      const irr = classifYr[ano].irregular
      // mat + rest representa a distribuição do irregular entre MATOPIBA e restante
      const soma = mat + rest
      // tolerância de 1%
      expect(Math.abs(soma - irr) / irr).toBeLessThanOrEqual(0.01)
    }
  })

  // Guarda-chuva contra dupla-contagem de autorizado_p:
  // classifYr.autorizado deve ser ha_AUTORIZADO puro (sem incluir autorizado_p).
  // Se autorizado já incluísse autorizado_p, a soma das classes excederia alertYr.area.
  it('soma das classes ≈ area total do ano (tolerance 2 ha — garante sem dupla-contagem)', () => {
    for (const ano of YEARS) {
      const { irregular, autorizado, autorizado_p, regularizado } = classifYr[ano]
      const soma = irregular + autorizado + autorizado_p + regularizado
      const area = alertYr[ano].area
      expect(Math.abs(soma - area), `Ano ${ano}: ${soma} vs ${area}`).toBeLessThanOrEqual(2)
    }
  })
})
