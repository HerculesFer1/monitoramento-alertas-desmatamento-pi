/**
 * RankingView.tsx — Tab Ranking (areas_prioritarias)
 * Tabela ordenável + inline data bars para magnitude visual (princípio Tufte).
 * Clique na linha → Tab Municipal.
 * Responde: "Quais municípios priorizar primeiro?"
 */
import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAppStore }  from '../../../core/store/useAppStore'
import { useRanking }   from '../hooks/useAreasData'
import { CLASSE_COLORS, CLASSE_LABELS } from '../types'
import type { MunicipioResumo, ClassePrioridade } from '../types'
import { fmtHa } from '../../../core/lib/constants'

type OrderBy =
  | 'area_floresta_ha'
  | 'area_desmat_ha'
  | 'pct_floresta_estado'
  | 'classe_max_prioridade'
  | 'biomassa_floresta_tc'
  | 'agb_medio_tc_ha'
  | 'ha_deter_recente'
  | 'municipio_nome'

const COL_LABELS: Record<OrderBy, string> = {
  area_floresta_ha:      'Floresta (ha)',
  area_desmat_ha:        'Desmatado (ha)',
  pct_floresta_estado:   '% Floresta PI',
  classe_max_prioridade: 'Classe máx.',
  biomassa_floresta_tc:  'Biomassa (tC)',
  agb_medio_tc_ha:       'AGB Médio (tC/ha)',
  ha_deter_recente:      'DETER (ha)',
  municipio_nome:        'Município',
}

export function RankingView() {
  const [orderBy, setOrderBy] = useState<OrderBy>('area_floresta_ha')
  const [search,  setSearch]  = useState('')

  const anoFiltro            = useAppStore((s) => s.anoFiltro)
  const setSelectedMunicipio = useAppStore((s) => s.setSelectedMunicipio)
  const setActiveView        = useAppStore((s) => s.setActiveView)

  const { data: ranking, isLoading } = useRanking(anoFiltro, orderBy)

  const filtered = useMemo(
    () => (ranking ?? []).filter((m) =>
      m.municipio_nome.toLowerCase().includes(search.toLowerCase()),
    ),
    [ranking, search],
  )

  // Pre-compute maxima for inline bars
  const maxFlor  = useMemo(() => Math.max(...(ranking ?? []).map(m => m.area_floresta_ha    ?? 0), 1), [ranking])
  const maxDes   = useMemo(() => Math.max(...(ranking ?? []).map(m => m.area_desmat_ha      ?? 0), 1), [ranking])
  const maxBio   = useMemo(() => Math.max(...(ranking ?? []).map(m => Number(m.biomassa_floresta_tc) || 0), 1), [ranking])
  const maxDeter = useMemo(() => Math.max(...(ranking ?? []).map(m => Number(m.ha_deter_recente)     || 0), 1), [ranking])

  function handleRowClick(m: MunicipioResumo) {
    setSelectedMunicipio({ cod: m.municipio_cod, nome: m.municipio_nome, bbox: m.bbox })
    setActiveView('municipal')
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, gap: 7 }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 26, borderRadius: 5, animationDelay: `${i * 0.04}s` }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, gap: 12, overflow: 'hidden' }}>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Search com ícone */}
        <div style={{ position: 'relative', maxWidth: 240, flex: 1 }}>
          <svg
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', opacity: .35, pointerEvents: 'none' }}
            width={12} height={12} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          >
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar município…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ap-search"
            style={{ paddingLeft: 28 }}
          />
        </div>

        {/* Sort selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className="section-label">Ordenar</span>
          <select
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value as OrderBy)}
            className="ap-select"
          >
            {(Object.keys(COL_LABELS) as OrderBy[]).map((k) => (
              <option key={k} value={k}>{COL_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {/* Count pill */}
        <div style={{
          marginLeft: 'auto', flexShrink: 0,
          background: 'var(--bg4)', border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 999, padding: '3px 10px',
          fontSize: 10, color: 'var(--t3)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--aut)', display: 'inline-block' }} />
          {filtered.length} municípios
        </div>
      </div>

      {/* Table */}
      <div style={{
        flex: 1, overflow: 'auto',
        borderRadius: 'var(--r)',
        border: '1px solid rgba(255,255,255,.06)',
      }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 2 }}>
            <tr>
              <th style={{ textAlign: 'left', paddingLeft: 10, width: 34, color: 'var(--t3)', fontSize: 10 }}>#</th>
              <SortTh col="municipio_nome" current={orderBy} onSort={setOrderBy} align="left">Município</SortTh>
              <SortTh col="area_floresta_ha"     current={orderBy} onSort={setOrderBy}>Floresta</SortTh>
              <SortTh col="area_desmat_ha"        current={orderBy} onSort={setOrderBy}>Desmatado</SortTh>
              <SortTh col="agb_medio_tc_ha"       current={orderBy} onSort={setOrderBy}>AGB</SortTh>
              <SortTh col="biomassa_floresta_tc"  current={orderBy} onSort={setOrderBy}>Biomassa</SortTh>
              <SortTh col="ha_deter_recente"      current={orderBy} onSort={setOrderBy}>DETER</SortTh>
              <SortTh col="pct_floresta_estado"   current={orderBy} onSort={setOrderBy}>% Flor. PI</SortTh>
              <SortTh col="classe_max_prioridade" current={orderBy} onSort={setOrderBy}>Cl.</SortTh>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => (
              <RankingRow
                key={m.municipio_cod}
                m={m} rank={i + 1} onClick={handleRowClick}
                maxFlor={maxFlor} maxDes={maxDes}
                maxBio={maxBio} maxDeter={maxDeter}
              />
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 12 }}>
                  {search
                    ? `Nenhum município com "${search}"`
                    : 'Sem dados disponíveis'
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--t3)', textAlign: 'center' }}>
        ↑ Clique em qualquer linha para ver detalhes no mapa
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SortThProps {
  col:      OrderBy
  current:  OrderBy
  onSort:   (c: OrderBy) => void
  children: ReactNode
  align?:   'left' | 'right'
}

function SortTh({ col, current, onSort, children, align = 'right' }: SortThProps) {
  const active = current === col
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        textAlign: align, cursor: 'pointer',
        color: active ? 'var(--aut)' : undefined,
        userSelect: 'none',
        transition: 'color .12s',
      }}
      title={`Ordenar por ${COL_LABELS[col]}`}
    >
      {children}
      {active && <span style={{ marginLeft: 2, opacity: .7, fontSize: 9 }}>↓</span>}
    </th>
  )
}

interface RankingRowProps {
  m:        MunicipioResumo
  rank:     number
  onClick:  (m: MunicipioResumo) => void
  maxFlor:  number
  maxDes:   number
  maxBio:   number
  maxDeter: number
}

function RankingRow({ m, rank, onClick, maxFlor, maxDes, maxBio, maxDeter }: RankingRowProps) {
  const pctFlor  = maxFlor  > 0 ? ((m.area_floresta_ha ?? 0)              / maxFlor)  * 100 : 0
  const pctDes   = maxDes   > 0 ? ((m.area_desmat_ha   ?? 0)              / maxDes)   * 100 : 0
  const pctBio   = maxBio   > 0 ? ((Number(m.biomassa_floresta_tc) || 0)  / maxBio)  * 100 : 0
  const pctDeter = maxDeter > 0 ? ((Number(m.ha_deter_recente)     || 0)  / maxDeter) * 100 : 0

  return (
    <tr onClick={() => onClick(m)} style={{ cursor: 'pointer' }} title="Ver no mapa municipal">
      <td style={{ color: 'var(--t3)', paddingLeft: 10, fontSize: 11 }}>{rank}</td>
      <td style={{ fontWeight: 600, color: 'var(--aut)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.municipio_nome}
      </td>

      {/* Floresta com mini bar */}
      <td style={{ textAlign: 'right' }}>
        <div className="cell-bar-wrap">
          <span style={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(m.area_floresta_ha ?? 0)}</span>
          <span className="cell-bar" style={{ width: `${Math.max(pctFlor * 0.44, 2)}px`, maxWidth: 44, background: '#10B981' }} />
        </div>
      </td>

      {/* Desmatado com mini bar */}
      <td style={{ textAlign: 'right' }}>
        {(m.area_desmat_ha ?? 0) > 0 ? (
          <div className="cell-bar-wrap">
            <span style={{ color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(m.area_desmat_ha ?? 0)}</span>
            <span className="cell-bar" style={{ width: `${Math.max(pctDes * 0.44, 2)}px`, maxWidth: 44, background: '#EF4444' }} />
          </div>
        ) : <span style={{ color: 'var(--t3)' }}>—</span>}
      </td>

      {/* AGB */}
      <td style={{ textAlign: 'right', color: '#F59E0B', fontVariantNumeric: 'tabular-nums' }}>
        {m.agb_medio_tc_ha != null
          ? `${Number(m.agb_medio_tc_ha).toFixed(1)}`
          : <span style={{ color: 'var(--t3)' }}>—</span>
        }
      </td>

      {/* Biomassa com mini bar */}
      <td style={{ textAlign: 'right' }}>
        {m.biomassa_floresta_tc != null ? (
          <div className="cell-bar-wrap">
            <span style={{ color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(Number(m.biomassa_floresta_tc))}</span>
            {pctBio > 0 && <span className="cell-bar" style={{ width: `${Math.max(pctBio * 0.44, 2)}px`, maxWidth: 44, background: '#059669', opacity: .65 }} />}
          </div>
        ) : <span style={{ color: 'var(--t3)' }}>—</span>}
      </td>

      {/* DETER com mini bar */}
      <td style={{ textAlign: 'right' }}>
        {Number(m.ha_deter_recente) > 0 ? (
          <div className="cell-bar-wrap">
            <span style={{ color: '#F97316', fontVariantNumeric: 'tabular-nums' }}>{fmtHa(Number(m.ha_deter_recente))}</span>
            <span className="cell-bar" style={{ width: `${Math.max(pctDeter * 0.44, 2)}px`, maxWidth: 44, background: '#F97316', opacity: .75 }} />
          </div>
        ) : <span style={{ color: 'var(--t3)' }}>—</span>}
      </td>

      {/* % Floresta PI */}
      <td style={{ textAlign: 'right', color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
        {m.pct_floresta_estado?.toFixed(2)}%
      </td>

      {/* Classe badge */}
      <td style={{ textAlign: 'right' }}>
        {m.classe_max_prioridade != null
          ? <ClasseBadge cls={m.classe_max_prioridade} />
          : <span style={{ color: 'var(--t3)' }}>—</span>
        }
      </td>
    </tr>
  )
}

function ClasseBadge({ cls }: { cls: ClassePrioridade }) {
  const color = CLASSE_COLORS[cls]
  return (
    <span
      title={CLASSE_LABELS[cls]}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6,
        background: `${color}18`, color,
        border: `1px solid ${color}35`,
        fontSize: 11, fontWeight: 800,
      }}
    >
      {cls}
    </span>
  )
}

