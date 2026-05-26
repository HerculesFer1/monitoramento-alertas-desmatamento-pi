# Orquestração Prefect — Monitoramento de Alertas de Desmatamento PI

GCGEO / SEMARH-PI | Pipeline v2

---

## Visão Geral

Este módulo configura o **Prefect 2.x Cloud** como orquestrador do pipeline de
monitoramento. Quatro flows são definidos com schedules automáticos:

| Flow | Schedule | Timezone |
|------|----------|----------|
| `atualizar-dados-semanais` | Toda segunda-feira às 07h | America/Fortaleza |
| `atualizar-dados-mensais` | Dia 1 de cada mês às 08h | America/Fortaleza |
| `atualizar-prodes-anual` | 15 de outubro às 08h | America/Fortaleza |
| `pipeline-completo` | Manual (sem schedule) | — |

---

## Passo 1 — Instalar o Prefect no ambiente conda

Abra o PowerShell e ative o ambiente `desmatamento`:

```powershell
conda activate desmatamento
pip install "prefect>=2.14"
```

Verifique a instalação:

```powershell
prefect version
```

Saída esperada: `Version: 2.x.x` (qualquer versão ≥ 2.14).

---

## Passo 2 — Autenticar no Prefect Cloud

1. Acesse [https://app.prefect.cloud](https://app.prefect.cloud) e crie uma conta (ou faça login).
2. Navegue em **Settings → API Keys → Create API Key**.
3. Copie a chave gerada e autentique no terminal:

```powershell
conda activate desmatamento
prefect cloud login --key <SUA_API_KEY>
```

4. Selecione (ou crie) um **workspace** quando solicitado.

---

## Passo 3 — Criar um Work Pool (agente local)

O Work Pool permite que o Prefect Cloud envie execuções para a máquina local
onde os dados e o ambiente conda estão disponíveis.

```powershell
conda activate desmatamento
prefect work-pool create desmatamento-pi --type process
```

Inicie o worker (deixe em execução em background ou configure como serviço):

```powershell
prefect worker start --pool desmatamento-pi
```

> **Dica Windows:** para rodar o worker como serviço em background, use
> `Start-Process powershell -ArgumentList "-NoExit", "prefect worker start --pool desmatamento-pi"` ou configure via `Task Scheduler`.

---

## Passo 4 — Deploy dos Flows com Schedules

Execute o deploy de todos os flows de dentro do diretório raiz do projeto:

```powershell
cd "C:\9.1 Monitoramento de Alertas de Desmatamento"
conda activate desmatamento

# Deploy do flow semanal
prefect deploy infra/prefect/pipeline_flow.py:atualizar_dados_semanais `
  --name "semanal-asvs" `
  --pool desmatamento-pi `
  --cron "0 7 * * 1" `
  --timezone "America/Fortaleza"

# Deploy do flow mensal
prefect deploy infra/prefect/pipeline_flow.py:atualizar_dados_mensais `
  --name "mensal-mapbiomas-asvs" `
  --pool desmatamento-pi `
  --cron "0 8 1 * *" `
  --timezone "America/Fortaleza"

# Deploy do flow PRODES anual
prefect deploy infra/prefect/pipeline_flow.py:atualizar_prodes_anual `
  --name "anual-prodes" `
  --pool desmatamento-pi `
  --cron "0 8 15 10 *" `
  --timezone "America/Fortaleza"

# Deploy do flow completo (sem schedule automatico — execucao manual)
prefect deploy infra/prefect/pipeline_flow.py:pipeline_completo `
  --name "pipeline-completo-manual" `
  --pool desmatamento-pi
```

---

## Passo 5 — Verificar Schedules e Executar Manualmente

### Listar deployments

```powershell
prefect deployment ls
```

### Executar um flow manualmente via CLI

```powershell
# Flow semanal (ASVs)
prefect deployment run "atualizar-dados-semanais/semanal-asvs"

# Flow completo
prefect deployment run "pipeline-completo/pipeline-completo-manual"
```

### Executar diretamente (sem Prefect Cloud, para testes)

```powershell
$env:PYTHONUTF8 = "1"
conda activate desmatamento

# Executa o flow completo
python infra/prefect/pipeline_flow.py --flow completo

# Opcoes: semanal | mensal | prodes | completo
python infra/prefect/pipeline_flow.py --flow semanal
```

### Verificar status no Prefect Cloud

Acesse [https://app.prefect.cloud](https://app.prefect.cloud) e navegue em:

- **Deployments** → ver schedules ativos e histórico
- **Flow Runs** → ver execuções em andamento ou concluídas
- **Work Pools** → verificar se o worker local está `READY`

---

## Estrutura dos Flows

```
pipeline_flow.py
├── Tasks de download (independentes)
│   ├── baixar_mapbiomas()     retries=3, delay=60s
│   ├── baixar_asvs()          retries=3, delay=60s
│   └── baixar_prodes()        retries=3, delay=60s
│
└── Tasks sequenciais
    ├── rodar_pipeline()       executa preprocess.py
    ├── testar_qualidade()     verifica 9/9 testes — BLOQUEIA upload se falhar
    ├── upload_supabase()      executa _upload_supabase.py, retries=2
    └── notificar_equipe()     log + (futuro: email/Slack)
```

### Tratamento de erros

- **Testes de qualidade com falha**: o upload é abortado e um `RuntimeError` é
  levantado com mensagem detalhada. O flow fica com status `FAILED` no Prefect
  Cloud.
- **Falha em download**: até 3 retentativas com intervalo de 60 segundos. Se
  todas falharem, o flow para.
- **Falha no upload**: até 2 retentativas com intervalo de 30 segundos.

---

## Variáveis de Ambiente Obrigatórias

Estas variáveis são configuradas automaticamente pelo `pipeline_flow.py` ao
executar os subprocessos. Para execução manual dos scripts Python, defina-as:

```powershell
$env:PYTHONUTF8 = "1"
$env:GDAL_DATA  = "C:\Users\MARCO\miniconda3\envs\desmatamento\Library\share\gdal"
$env:PROJ_LIB   = "C:\Users\MARCO\miniconda3\envs\desmatamento\Library\share\proj"
```

---

## Próximos Passos (Planejado)

| Item | Descrição |
|------|-----------|
| Notificações | Integrar `notificar_equipe()` com SendGrid (email) ou webhook Slack/Teams |
| Paralelismo | Configurar `ConcurrentTaskRunner` para downloads paralelos reais |
| DVC | Versionar `Resultado/*.geojson` automaticamente após cada run bem-sucedido |
| Prefect Automations | Criar alertas no Prefect Cloud para flows com status `FAILED` |

---

*Última atualização: 2026-05-20 | Pipeline v2 | GCGEO / SEMARH-PI*
