/**
 * types.ts — Tipos compartilhados do módulo report.
 */
import type { Module } from '../store/useAppStore'

export interface ReportSnapshot {
  modulo:        Module
  nomeModulo:    string           // ex: "Monitoramento de Alertas MAPBIOMAS"
  moduloChave:   string           // ex: "MAPBIOMAS" (caixa alta destacada)
  corModulo:     string           // hex temático
  ano:           number | 'all'
  dataEmissao:   Date

  /** KPIs principais — pares (rótulo, valor formatado, contexto) */
  kpis: Array<{
    rotulo:   string
    valor:    string
    contexto?: string
    cor?:     string
  }>

  /** Texto descritivo dos resultados (linguagem imparcial) */
  resumoExecutivo: string[]
  analise:         string[]

  /** Tabela detalhada — top municípios, distribuição por classe, etc. */
  tabela?: {
    titulo:    string
    cabecalho: string[]
    linhas:    Array<Array<string | number>>
  }

  /** Trecho de metodologia (vem de core/methodology/content.ts) */
  metodologia: {
    pergunta:     string
    como_calcula: string[]
    simbologia:   string[]
  }

  /** Limitações listadas no relatório */
  limitacoes: string[]

  /** Fontes citadas com data */
  fontes: string[]
}
