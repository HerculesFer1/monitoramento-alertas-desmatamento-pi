import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { FilterPanel }  from '../components/Filters/FilterPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useAppStore }  from '../store/useAppStore'
import { useAgregado, useResumoEstatico }  from '../lib/hooks'
import {
  top20, munIrrReal, MUN_BIOME, MATOPIBA_LIST, REINCIDENT_MUNIS,
  fmtHa, fmtNum,
} from '../lib/constants'

const TT = {
  background: 'var(--bg3)', border: '1px solid var(--sep)',
  borderRadius: 8, fontSize: 12, color: 'var(--t1)',
}

// Tipos derivados dos dados agregados (vivos ou estáticos)
interface MunRow {
  municipio: string
  haTotal:   number
  haIrr:     number
  haAut:     number
  haReg:     number
  bioma:     string
  matopiba:  boolean
  reincidente: boolean
}

function buildStaticRows(
  biomaFiltro: string | null,
  matopibaFiltro: boolean | null,
  top20Data: [string, number][],
  irrData: Record<string, number>,
  biomeData: Record<string, string>,
): MunRow[] {
  return top20Data
    .filter(([m]) => !biomaFiltro   || biomeData[m] === biomaFiltro)
    .filter(([m]) => matopibaFiltro === null || MATOPIBA_LIST.includes(m) === matopibaFiltro)
    .map(([m, haTotal]) => ({
      municipio:   m,
      haTotal,
      haIrr:       irrData[m] ?? 0,
      haAut:       0,
      haReg:       0,
      bioma:       biomeData[m] ?? 'Cerrado',
      matopiba:    MATOPIBA_LIST.includes(m),
      reincidente: REINCIDENT_MUNIS.includes(m as typeof REINCIDENT_MUNIS[number]),
    }))
}

export function MunicipalPage() {
  const { anoFiltro, matopibaFiltro, biomaFiltro } = useAppStore()
  const { data: agregado, isLoading, isError } = useAgregado()
  const { data: staticData } = useResumoEstatico()
  const top20Data  = (staticData?.top20    ?? top20)    as [string, number][]
  const irrData    = staticData?.munIrrReal ?? munIrrReal
  const biomeData  = staticData?.munBiome   ?? MUN_BIOME

  const liveRows = useMemo((): MunRow[] | null => {
    if (!agregado?.length) return null

    const filtered = agregado.filter(r =>
      (anoFiltro === 'all' || r.ano === anoFiltro) &&
      (!biomaFiltro    || r.bioma_predominante === biomaFiltro) &&
      (matopibaFiltro === null || r.matopiba === matopibaFiltro),
    )

    const acc: Record<string, MunRow> = {}
    for (const r of filtered) {
      if (!acc[r.municipio]) {
        acc[r.municipio] = {
          municipio:   r.municipio,
          haTotal:     0,
          haIrr:       0,
          haAut:       0,
          haReg:       0,
          bioma:       r.bioma_predominante,
          matopiba:    r.matopiba,
          reincidente: false,
        }
      }
      const m = acc[r.municipio]
      m.haTotal += r.ha_total
      m.haIrr   += r.ha_irregular
      m.haAut   += r.ha_autorizado_total
      m.haReg   += r.ha_regularizado
      m.reincidente = m.reincidente || r.reincidente
    }

    return Object.values(acc).sort((a, b) => b.haTotal - a.haTotal)
  }, [agregado, anoFiltro, biomaFiltro, matopibaFiltro])

  const isLive = !isLoading && !isError && !!liveRows?.length
  const rows = liveRows ?? buildStaticRows(biomaFiltro, matopibaFiltro, top20Data, irrData, biomeData)

  const top10      = rows.slice(0, 10)
  const totalGeral = rows.reduce((s, r) => s + r.haTotal, 0)
  const top10Total = top10.reduce((s, r) => s + r.haTotal, 0)

  const top10IrrData = top10.map(r => ({
    municipio: r.municipio.length > 18 ? r.municipio.slice(0, 17) + '…' : r.municipio,
    ha:        r.haIrr,
    matopiba:  r.matopiba,
  }))

  const top5GroupData = rows.slice(0, 5).map(r => ({
    mun:         r.municipio.length > 14 ? r.municipio.slice(0, 13) + '…' : r.municipio,
    Irregular:   r.haIrr,
    Autorizado:  r.haAut,
    Regularizado:r.haReg,
  }))

  const critico     = rows[0]
  const reincidentes = rows.filter(r => r.reincidente).length
  const concTop10   = totalGeral > 0 ? Math.round(top10Total / totalGeral * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FilterPanel />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Estado de fonte dos dados */}
        {!isLive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 7, fontSize: 11,
            background: 'var(--bg3)', border: '1px solid var(--sep)', color: 'var(--t3)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isLoading ? 'var(--mat)' : 'var(--t3)', display: 'inline-block' }} />
            {isLoading ? 'Carregando dados do Supabase…' : isError
              ? 'Supabase não disponível — exibindo dados do último pipeline (área irregular real; classificação detalhada indisponível)'
              : 'Dados estáticos do último pipeline'
            }
          </div>
        )}

        {/* KPIs */}
        <div className="grid-4">
          <div className="kpi-card">
            <div className="kpi-label">Municípios Afetados</div>
            <div className="kpi-value">{rows.length}</div>
            <div className="kpi-sub">com alertas 2022–2025</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Município Crítico</div>
            <div className="kpi-value" style={{ fontSize: 18, color: 'var(--irr)' }}>
              {critico?.municipio ?? '—'}
            </div>
            <div className="kpi-sub">{fmtHa(critico?.haTotal ?? 0)} alertados</div>
            {critico?.matopiba && (
              <span className="tag tag-matopiba" style={{ marginTop: 4 }}>MATOPIBA</span>
            )}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Municípios Reincidentes</div>
            <div className="kpi-value" style={{ color: 'var(--mat)' }}>{reincidentes}</div>
            <div className="kpi-sub">≥ 3 anos com IRREGULAR</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Concentração Top 10</div>
            <div className="kpi-value">{concTop10}%</div>
            <div className="kpi-sub">do total alertado</div>
          </div>
        </div>

        {/* Tabela + barras horizontal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sep)', fontWeight: 600, fontSize: 12, color: 'var(--t2)' }}>
              Top 10 Municípios — Maior Área Alertada
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th><th>Município</th><th>Bioma</th>
                    <th style={{ textAlign:'right' }}>Área (ha)</th>
                    <th style={{ textAlign:'right' }}>Irregular</th>
                    <th style={{ textAlign:'right' }}>% Total</th>
                    <th style={{ minWidth:70 }}>Dist.</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((r, i) => {
                    const pct = totalGeral > 0 ? Math.round(r.haTotal / totalGeral * 100) : 0
                    return (
                      <tr key={r.municipio}>
                        <td style={{ color: i < 3 ? 'var(--mat)' : 'var(--t3)', fontWeight: 700 }}>{i+1}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ fontWeight: i < 3 ? 600 : 400 }}>{r.municipio}</span>
                            {r.reincidente && <span title="Reincidente" style={{ color:'var(--mat)' }}>⚠</span>}
                            {r.matopiba    && <span className="tag tag-matopiba" style={{ fontSize:9 }}>MAT</span>}
                          </div>
                        </td>
                        <td><span className={`tag tag-${r.bioma.toLowerCase()}`}>{r.bioma}</span></td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtNum(r.haTotal)}</td>
                        <td style={{ textAlign:'right', color:'var(--irr)', fontVariantNumeric:'tabular-nums' }}>{fmtNum(r.haIrr)}</td>
                        <td style={{ textAlign:'right', color:'var(--t2)' }}>{pct}%</td>
                        <td>
                          <div className="bar-track" style={{ height:5 }}>
                            <div className="bar-fill" style={{ width:`${Math.min(pct*3,100)}%`, background:'var(--irr)' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight:600, fontSize:12, color:'var(--t2)', marginBottom:12 }}>
              Área Irregular — Top 10 (ha)
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10IrrData} layout="vertical" barSize={14} margin={{ left:8, right:14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:10, fill:'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="municipio" tick={{ fontSize:10, fill:'var(--t2)' }}
                  axisLine={false} tickLine={false} width={88} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), 'Irregular']} />
                <Bar dataKey="ha" radius={[0,4,4,0]}>
                  {top10IrrData.map((d,i) => <Cell key={i} fill={d.matopiba ? 'var(--mat)' : 'var(--irr)'} fillOpacity={.82} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Barras agrupadas top-5 */}
        <ErrorBoundary label="Classificação por tipo">
          <div className="card">
            <div style={{ fontWeight:600, fontSize:12, color:'var(--t2)', marginBottom:12 }}>
              Top 5 Municípios — Classificação por tipo (ha)
              {!isLive && (
                <span style={{
                  fontSize:9, padding:'1px 5px', borderRadius:999, marginLeft:8,
                  background:'var(--bg3)', color:'var(--t3)', fontWeight:700,
                }}>
                  {isLoading ? 'CARREGANDO' : 'ESTÁTICO — sem split de classificação'}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top5GroupData} barSize={18} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sep)" vertical={false} />
                <XAxis dataKey="mun" tick={{ fontSize:11, fill:'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'var(--t3)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => [fmtHa(v as number), '']} />
                <Bar dataKey="Irregular"    fill="rgba(239,68,68,.8)"  radius={[3,3,0,0]} />
                <Bar dataKey="Autorizado"   fill="rgba(16,185,129,.8)" radius={[3,3,0,0]} />
                <Bar dataKey="Regularizado" fill="rgba(249,115,22,.8)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ErrorBoundary>

      </div>
    </div>
  )
}
