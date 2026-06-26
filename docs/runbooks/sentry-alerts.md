# Runbook — Configuração de Alertas Sentry

> Configurar uma vez via Sentry Web UI. Não é versionado/automatizado porque a
> Sentry API exige token de organização separado. Documentado aqui para
> reprodutibilidade.

## Contexto

O projeto tem **Sentry instalado e ativo** tanto no frontend (`@sentry/react`,
`Sentry.ErrorBoundary` em [App.tsx](frontend/src/App.tsx)) quanto no backend
(`_init_sentry()` em [core/orchestrator.py](core/orchestrator.py)). Mas **sem
alert rules configuradas, erros vão para o vazio** — ninguém é notificado.

DSNs ativos:
- Backend: `SENTRY_DSN` (env + GitHub Secret)
- Frontend: `VITE_SENTRY_DSN` (env + GitHub Secret)

URL Sentry: `https://sentry.io/organizations/<org>/projects/<proj>/`

## Regras de Alerta Recomendadas (priorizadas)

### 1. ⛔ Spike de erros (crítica)

**Quando**: 5+ erros em 1 hora, qualquer ambiente.

```
Trigger condition:
  When count() of events
  Is greater than 5
  In 1 hour

Filter:
  level:error

Action:
  Send notification → Email (gcgeo@semarh.pi.gov.br)
  Send notification → Slack (#alertas-cgeo)  [se configurado]
```

**Justificativa**: dashboard institucional usado por gestores — falha
prolongada bloqueia tomada de decisão.

### 2. 🔥 Erro novo (informativa)

**Quando**: qualquer erro nunca visto antes (issue freshly created).

```
Trigger condition:
  When a new issue is created

Filter:
  environment:production

Action:
  Send notification → Email
```

**Justificativa**: regressões aparecem cedo (B0 do filtro de ano teria sido
detectado se um único usuário tivesse visto erro JS). Sem este alerta,
issues novos ficam invisíveis por dias.

### 3. ⚠️ Pipeline backend falha (crítica)

**Quando**: erro vindo do pipeline Python (orchestrator, calculator, uploader).

```
Trigger condition:
  When a new issue is created

Filter:
  release.package:redd-piaui-pipeline    (ou tag custom)
  OR
  logger:core.*

Action:
  Send notification → Email
  Mark as critical
```

**Justificativa**: cron mensal queimadas é o caso mais importante. Erros aqui
representam dados não-ingeridos no Supabase.

### 4. 🐌 Performance degradação (informativa, opcional)

**Quando**: p95 de pageload > 5s ou TTI > 3s.

```
Trigger condition:
  When p95() of transaction.duration
  Is greater than 5000ms
  In 1 hour

Filter:
  transaction.op:pageload

Action:
  Send notification → Email
```

**Justificativa**: choropleth tem ~470 MB de geometrias, regressão de
performance é provável.

## Tags / Releases para filtros

Confirmar que o frontend está enviando:
- `release` = `VITE_GIT_SHA` (configurado em [vite.config.ts](frontend/vite.config.ts))
- `environment` = `production` (build Vercel) / `development` (Vite dev)

E backend:
- `release` = git SHA via `os.environ.get('GIT_SHA')` no `_init_sentry()`
- `environment` = `production` (GitHub Actions runner) / `local`

Se algum tag estiver vazio, filtros das rules acima não vão funcionar.

## Validação após criar as rules

1. Forçar erro temporário no frontend (`throw new Error('sentry-test')` em qualquer view)
2. Verificar que email/Slack chegou em < 5 min
3. Reverter o throw
4. Marcar o issue de teste como "resolved" no Sentry

## Manutenção

- **Trimestralmente**: revisar issues `archived` no Sentry para detectar regressões mascaradas
- **Após cada incidente real**: ajustar threshold de #1 conforme aprendido
- **Se Sentry desligar**: alertas desaparecem silenciosamente — pings periódicos
  do `supabase-keepalive.yml` cobrem disponibilidade do banco, mas não erros JS
  do dashboard. Considerar UptimeRobot como redundância.
