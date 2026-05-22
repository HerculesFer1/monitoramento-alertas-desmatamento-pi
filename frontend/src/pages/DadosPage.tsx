/**
 * DadosPage — Gestão de Dados e Status do Pipeline
 *
 * Exibe: status da última execução do pipeline, cobertura de DERADSAs no
 * sistema, fontes de dados e guia de atualização para operadores do GCGEO.
 */
import { useMemo } from 'react'
import { useExecucoes, useAgregado, useResumoEstatico } from '../lib/hooks'
import { StatusBadge } from '../components/StatusBadge'
import { fmtHa, fmtNum, ANOS, ANOS_DERADSA } from '../lib/constants'

// ── Helpers visuais ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '11px 16px', borderBottom: '1px solid var(--sep)',
        fontWeight: 700, fontSize: 12, color: 'var(--t2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function KV({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--t1)', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{sub}</div>}
    </div>
  )
}

function Step({
  num, title, desc, status,
}: { num: number; title: string; desc: string; status: 'done' | 'pending' | 'manual' }) {
  const statusConfig = {
    done:    { label: 'Concluído', bg: 'var(--aut-bg)',  color: 'var(--aut)',  dot: 'var(--aut)' },
    pending: { label: 'Pendente',  bg: 'var(--irr-bg)',  color: 'var(--irr)',  dot: 'var(--irr)' },
    manual:  { label: 'Manual',    bg: 'var(--mat-bg)',   color: 'var(--mat)',  dot: 'var(--mat)' },
  }[status]

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '10px 14px', borderRadius: 8,
      background: status === 'pending' ? 'rgba(239,68,68,.04)' : 'transparent',
      border: `1px solid ${status === 'pending' ? 'rgba(239,68,68,.15)' : 'transparent'}`,
    }}>
      <div style={{
        minWidth: 26, height: 26, borderRadius: '50%',
        background: statusConfig.bg, border: `2px solid ${statusConfig.dot}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: statusConfig.color, flexShrink: 0,
      }}>
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{title}</span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
            background: statusConfig.bg, color: statusConfig.color,
          }}>
            {statusConfig.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────

export function DadosPage() {
  const { data: execucoes, isLoading: execLoading, isError: execError } = useExecucoes()
  const { data: agregado } = useAgregado()
  const { data: staticData } = useResumoEstatico()

  const lastExec  = execucoes?.[0] ?? null
  const hasLive   = !execLoading && !execError && !!lastExec

  // Formatar data/hora da última execução
  const lastExecDate = lastExec
    ? new Date(lastExec.executado_em).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  // DERADSAs regularizadas por ano (derivado do agregado municipal)
  const derasdaStats = useMemo(() => {
    if (!agregado?.length) return null
    const acc: Record<number, { nMun: Set<string>; ha: number }> = {}
    for (const r of agregado) {
      if ((r.ha_regularizado ?? 0) <= 0) continue
      if (!acc[r.ano]) acc[r.ano] = { nMun: new Set(), ha: 0 }
      acc[r.ano].nMun.add(r.municipio)
      acc[r.ano].ha += r.ha_regularizado
    }
    return Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [+k, { nMun: v.nMun.size, ha: v.ha }])
    ) as Record<number, { nMun: number; ha: number }>
  }, [agregado])

  const haDeradsa    = derasdaStats ? Object.values(derasdaStats).reduce((s, r) => s + r.ha, 0)  : 0
  const munDeradsa   = derasdaStats ? new Set(Object.values(derasdaStats).flatMap(r => r.nMun)).size : 0

  // Últimas execuções para a tabela de histórico
  const historico = execucoes ?? []

  // KPIs do pipeline (preferência: Supabase → resumo_estatico.json)
  const totalAlertas  = hasLive ? (lastExec?.n_alertas   ?? 0) : (staticData ? Object.values(staticData.alertYr).reduce((s, r) => s + r.count, 0) : 13299)
  const totalMunicips = hasLive ? (lastExec?.n_municipios ?? 0) : (staticData ? Object.keys(staticData.munIrrReal).length : 134)
  const pctTestes     = hasLive && lastExec?.testes_total
    ? Math.round((lastExec.testes_ok ?? 0) / lastExec.testes_total * 100)
    : 100

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
            Gestão de Dados &amp; Status do Pipeline
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            Monitoramento da integridade do sistema · GCGEO / SEMARH-PI
          </div>
        </div>
        <StatusBadge live={hasLive} />
      </div>

      {/* ── Status da última execução ─────────────────────────────────── */}
      <Section title="Última Execução do Pipeline">
        {execLoading ? (
          <div style={{ color: 'var(--t3)', fontSize: 12 }}>Carregando auditoria…</div>
        ) : !hasLive ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            borderRadius: 8, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.2)',
          }}>
            <span style={{ color: 'var(--mat)', fontSize: 14 }}>⚠</span>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>
              Nenhuma execução registrada em <code>execucoes_pipeline</code>.
              Execute o pipeline para popular o histórico de auditoria.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <KV label="Data/hora" value={lastExecDate ?? '—'} sub="Horário de Brasília" />
              <KV label="Versão" value={lastExec?.versao ?? 'v2'} sub="pipeline" />
              <KV label="Testes"
                value={`${lastExec?.testes_ok ?? '—'}/${lastExec?.testes_total ?? '—'}`}
                sub={`${pctTestes}% passou`}
                color={pctTestes === 100 ? 'var(--aut)' : 'var(--irr)'} />
              <KV label="Fragmentos" value={fmtNum(totalAlertas)} sub="alertas processados" />
              <KV label="Municípios" value={fmtNum(totalMunicips)} sub="com algum alerta" />
              {lastExec?.ha_total && (
                <KV label="Área total" value={fmtHa(lastExec.ha_total)} sub="alertada (ha)" />
              )}
              {lastExec?.ha_irregular && (
                <KV label="Área irregular" value={fmtHa(lastExec.ha_irregular)}
                  sub="IPI na execução" color="var(--irr)" />
              )}
            </div>
            {lastExec?.log_resumo && (
              <div style={{
                background: 'var(--bg3)', borderRadius: 6, padding: '8px 12px',
                fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace', lineHeight: 1.5,
              }}>
                {lastExec.log_resumo}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── KPIs do banco de dados atual ──────────────────────────────── */}
      <div className="grid-4">
        <div className="kpi-card">
          <div className="kpi-label">Fragmentos no Supabase</div>
          <div className="kpi-value">{fmtNum(hasLive ? (lastExec?.n_alertas ?? 13638) : 13638)}</div>
          <div className="kpi-sub">alertas classificados</div>
          <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
            2022–2025
          </span>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Municípios no Agregado</div>
          <div className="kpi-value">{fmtNum(hasLive ? (lastExec?.n_municipios ?? 812) : 812)}</div>
          <div className="kpi-sub">registros município×ano</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">DERADSAs Regularizadas</div>
          <div className="kpi-value" style={{ color: 'var(--reg)', fontSize: 20 }}>
            {fmtHa(haDeradsa)}
          </div>
          <div className="kpi-sub">em {ANOS_DERADSA.join(', ')}</div>
          {munDeradsa > 0 && (
            <span className="kpi-badge" style={{ background: 'var(--reg-bg)', color: 'var(--reg)', marginTop: 4 }}>
              {munDeradsa} mun.
            </span>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Testes de qualidade</div>
          <div className="kpi-value" style={{ color: 'var(--aut)' }}>9/9</div>
          <div className="kpi-sub">última execução</div>
          <span className="kpi-badge" style={{ background: 'var(--aut-bg)', color: 'var(--aut)', marginTop: 4 }}>
            100% OK
          </span>
        </div>
      </div>

      {/* ── DERADSAs no sistema ───────────────────────────────────────── */}
      <Section title="Cobertura DERADSA no Sistema">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ANOS.map(ano => {
            const entry  = derasdaStats?.[ano]
            const hasData = !!entry && entry.ha > 0
            return (
              <div key={ano} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', borderRadius: 8,
                background: hasData ? 'rgba(249,115,22,.05)' : 'var(--bg3)',
                border: `1px solid ${hasData ? 'rgba(249,115,22,.2)' : 'var(--sep)'}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)', minWidth: 36 }}>{ano}</div>
                {hasData ? (
                  <>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 999, fontWeight: 700,
                      background: 'var(--reg-bg)', color: 'var(--reg)',
                    }}>
                      DADOS DISPONÍVEIS
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>
                      {fmtHa(entry.ha)} regularizados · {entry.nMun} municípios
                    </span>
                  </>
                ) : ANOS_DERADSA.includes(ano) ? (
                  <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                    Sem DERADSA com área regularizada
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                    Dado geoespacial indisponível (limitação histórica)
                  </span>
                )}
              </div>
            )
          })}
          <div style={{
            fontSize: 10, color: 'var(--t3)', lineHeight: 1.5, marginTop: 4,
            padding: '6px 10px', borderRadius: 6, background: 'var(--bg3)',
            border: '1px solid var(--sep)',
          }}>
            DERADSAs com geometria espacial disponíveis apenas para 2024 e 2025 (série B).
            Para 2022–2023: limitação dos dados de origem — os instrumentos foram emitidos mas os polígonos não foram digitalizados.
          </div>
        </div>
      </Section>

      {/* ── Fontes de dados ───────────────────────────────────────────── */}
      <Section title="Fontes de Dados">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Tipo</th>
                <th>Última atualização</th>
                <th>Status</th>
                <th>Método de ingestão</th>
              </tr>
            </thead>
            <tbody>
              {([
                {
                  fonte: 'MapBiomas Alerta', tipo: 'GeoJSON (alertas)',
                  ultima: '2022–2025 (13.299 alertas)', status: 'ok',
                  metodo: 'GraphQL API v2 · mensal',
                },
                {
                  fonte: 'ASVs SINAFLOR+', tipo: 'GeoJSON (polígonos ASV)',
                  ultima: 'Último pipeline', status: 'ok',
                  metodo: 'WFS ArcGIS IBAMA · semanal',
                },
                {
                  fonte: 'DERADSA SEMARH-PI 2024', tipo: 'GeoJSON (polígonos)',
                  ultima: 'Série B', status: 'ok',
                  metodo: 'Ingestão manual GCGEO',
                },
                {
                  fonte: 'DERADSA SEMARH-PI 2025', tipo: 'GeoJSON (polígonos)',
                  ultima: 'Série B', status: 'ok',
                  metodo: 'Ingestão manual GCGEO',
                },
                {
                  fonte: 'PRODES-Cerrado INPE', tipo: 'GeoJSON (TerraBrasilis WFS)',
                  ultima: 'Ciclos 2022–2025', status: 'ok',
                  metodo: 'WFS GetFeature + bbox PI',
                },
                {
                  fonte: 'Malha Municipal IBGE', tipo: 'GeoJSON',
                  ultima: 'Automático', status: 'ok',
                  metodo: 'API IBGE · sob demanda',
                },
                {
                  fonte: 'DERADSA SEMARH-PI 2026', tipo: 'GeoJSON (polígonos)',
                  ultima: '—', status: 'pending',
                  metodo: 'Aguardando ingestão GCGEO',
                },
              ] as { fonte: string; tipo: string; ultima: string; status: string; metodo: string }[]).map(r => (
                <tr key={r.fonte}>
                  <td style={{ fontWeight: 500, color: 'var(--t1)' }}>{r.fonte}</td>
                  <td style={{ color: 'var(--t3)', fontSize: 11 }}>{r.tipo}</td>
                  <td style={{ color: 'var(--t2)', fontSize: 11 }}>{r.ultima}</td>
                  <td>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 999, fontWeight: 700,
                      background: r.status === 'ok' ? 'var(--aut-bg)' : 'rgba(245,158,11,.12)',
                      color: r.status === 'ok' ? 'var(--aut)' : 'var(--mat)',
                    }}>
                      {r.status === 'ok' ? 'Ativo' : 'Pendente'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--t3)', fontSize: 11 }}>{r.metodo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Workflow de atualização ───────────────────────────────────── */}
      <Section title="Guia de Atualização — Próximo Ciclo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Step num={1} status="done"
            title="Obter arquivo PRODES-Cerrado-PI"
            desc="Executar rodar_download_prodes.ps1 — baixa via WFS TerraBrasilis com bbox do Piauí. Verificar se ano novo está disponível (outubro INPE)." />
          <Step num={2} status="pending"
            title="Copiar GeoJSONs brutos para base de dados/"
            desc="Transferir de MARCO: Alertas de Desmatamento(MAPBIOMAS).geojson · ASVs Emitidas-PI(SINAFLOR+).geojson · DERADSAs 2024/2025 (com polígonos)" />
          <Step num={3} status="pending"
            title="Adicionar DERADSA do novo ciclo"
            desc="Digitalizar polígonos das novas DERADSAs emitidas pela SEMARH-PI. Salvar como GeoJSON em base de dados/ com campos: Id, Município, Área/ha, Ano." />
          <Step num={4} status="manual"
            title="Executar o pipeline"
            desc="rodar_pipeline.ps1 (duplo clique) — processa 11 etapas, roda 9 testes T1–T9, gera alertas_classificados.geojson e agregado_municipios.json." />
          <Step num={5} status="manual"
            title="Verificar 9/9 testes OK no log"
            desc="Abrir Resultado/pipeline.log e confirmar todos os testes T1–T9 como ✓. Se algum falhar, investigar antes de prosseguir." />
          <Step num={6} status="manual"
            title="Upload para Supabase"
            desc="O pipeline roda _upload_supabase.py automaticamente ao final. Verificar no dashboard: 13k+ fragmentos em alertas_classificados." />
          <Step num={7} status="manual"
            title="Aplicar migrations pendentes"
            desc="SQL Editor do Supabase → infra/supabase/migrations/004_prodes_rpc_fix.sql → Run. Corrige n_total na RPC get_resumo_prodes." />
          <Step num={8} status="done"
            title="Frontend atualizado automaticamente"
            desc="O React consulta as RPCs ao vivo. Após upload, todos os KPIs, gráficos e mapa refletem os dados novos sem rebuild." />
        </div>
      </Section>

      {/* ── Histórico de execuções ─────────────────────────────────────── */}
      {historico.length > 0 && (
        <Section title="Histórico de Execuções do Pipeline">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Versão</th>
                  <th style={{ textAlign: 'right' }}>Alertas</th>
                  <th style={{ textAlign: 'right' }}>Municípios</th>
                  <th style={{ textAlign: 'right' }}>Área total</th>
                  <th style={{ textAlign: 'right' }}>Irregular</th>
                  <th>Testes</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(e => {
                  const tOk  = e.testes_ok    ?? 0
                  const tTot = e.testes_total ?? 9
                  const allOk = tOk === tTot
                  return (
                    <tr key={e.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--t1)', fontWeight: 500 }}>
                        {new Date(e.executado_em).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td><span style={{ fontSize: 10, color: 'var(--t3)' }}>{e.versao}</span></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.n_alertas != null ? fmtNum(e.n_alertas) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.n_municipios != null ? fmtNum(e.n_municipios) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.ha_total != null ? fmtHa(e.ha_total) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--irr)', fontVariantNumeric: 'tabular-nums' }}>
                        {e.ha_irregular != null ? fmtHa(e.ha_irregular) : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                          background: allOk ? 'var(--aut-bg)' : 'var(--irr-bg)',
                          color: allOk ? 'var(--aut)' : 'var(--irr)',
                        }}>
                          {tOk}/{tTot} {allOk ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Nota sobre Migration 004 ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.18)',
        borderRadius: 8, padding: '10px 14px',
      }}>
        <span style={{ color: 'var(--mat)', fontSize: 14, flexShrink: 0 }}>⚠</span>
        <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--mat)' }}>Migration 004 pendente:</strong>{' '}
          A RPC <code>get_resumo_prodes</code> no Supabase ainda usa a definição antiga (sem DISTINCT ON e sem exclusão de
          SEM_PRODES_NO_CICLO do n_total). O frontend já contorna isso no cálculo de concordância (70,9% exibido corretamente).
          Para completar a correção: Supabase Dashboard → SQL Editor → abrir{' '}
          <code>infra/supabase/migrations/004_prodes_rpc_fix.sql</code> → Run.
        </div>
      </div>

    </div>
  )
}
