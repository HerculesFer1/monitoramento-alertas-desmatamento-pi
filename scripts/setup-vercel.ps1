# =============================================================
# setup-vercel.ps1 — Reparar deploy Vercel (one-shot)
# =============================================================
# Faz: link → extrai IDs → atualiza GitHub secrets → dispara deploy
# Você só precisa autenticar no browser quando o Vercel pedir.
#
# Pré-requisitos:
#   - gh CLI autenticado (já está no PC)
#   - Node.js (já está)
#   - Conta Vercel com acesso ao projeto monitoramento-pi
#
# Execução: clique direito > "Executar com PowerShell"
#         ou no terminal: .\setup-vercel.ps1
# =============================================================

# IMPORTANTE: NÃO usar $ErrorActionPreference='Stop' aqui.
# Native commands (npx vercel) escrevem banner em stderr e isso é
# tratado como erro fatal em modo Stop. Checamos $LASTEXITCODE manualmente.
$ErrorActionPreference = 'Continue'

function Assert-Exit($msg) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ FALHA: $msg (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$root = Resolve-Path "$PSScriptRoot\.."
$frontend = Join-Path $root 'frontend'

Write-Host ""
Write-Host "=== REPARO DE DEPLOY VERCEL ===" -ForegroundColor Cyan
Write-Host ""

# 1. Login Vercel (abre browser se necessário)
Write-Host "[1/5] Verificando login Vercel..." -ForegroundColor Yellow
Push-Location $frontend
$whoami = & npx vercel@latest whoami 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  -> Não logado. Abrindo browser..." -ForegroundColor Gray
    & npx vercel@latest login
    Assert-Exit "vercel login"
    $whoami = & npx vercel@latest whoami 2>$null
}
Write-Host "  -> Logado como: $whoami" -ForegroundColor Green

# 2. Link projeto
Write-Host ""
Write-Host "[2/5] Link com projeto 'monitoramento-pi'..." -ForegroundColor Yellow
if (Test-Path .vercel\project.json) {
    Write-Host "  -> .vercel/project.json já existe. Reusando." -ForegroundColor Gray
} else {
    Write-Host "  -> Quando perguntar:" -ForegroundColor Gray
    Write-Host "       Set up? -> Y" -ForegroundColor Gray
    Write-Host "       Which scope? -> escolha sua conta pessoal" -ForegroundColor Gray
    Write-Host "       Link to existing? -> Y" -ForegroundColor Gray
    Write-Host "       Project name? -> monitoramento-pi" -ForegroundColor Gray
    & npx vercel@latest link
    Assert-Exit "vercel link"
    if (-not (Test-Path .vercel\project.json)) {
        Write-Host "❌ .vercel/project.json não foi criado mesmo com exit 0" -ForegroundColor Red
        exit 1
    }
}

# 3. Extrai IDs
Write-Host ""
Write-Host "[3/5] Extraindo IDs..." -ForegroundColor Yellow
$proj = Get-Content .vercel\project.json -Raw | ConvertFrom-Json
Write-Host "  ORG_ID:     $($proj.orgId)" -ForegroundColor Green
Write-Host "  PROJECT_ID: $($proj.projectId)" -ForegroundColor Green
Pop-Location

# 4. Atualiza GitHub Secrets
Write-Host ""
Write-Host "[4/5] Atualizando GitHub Secrets..." -ForegroundColor Yellow
Push-Location $root
$proj.orgId     | & gh secret set VERCEL_ORG_ID
Assert-Exit "gh secret set VERCEL_ORG_ID"
$proj.projectId | & gh secret set VERCEL_PROJECT_ID
Assert-Exit "gh secret set VERCEL_PROJECT_ID"
Write-Host "  -> VERCEL_ORG_ID + VERCEL_PROJECT_ID atualizados" -ForegroundColor Green

# Token check (opcional)
Write-Host ""
Write-Host "  Sobre VERCEL_TOKEN:" -ForegroundColor Yellow
Write-Host "  O secret atual pode estar expirado. Se o deploy abaixo falhar," -ForegroundColor Gray
Write-Host "  gere um novo em: https://vercel.com/account/tokens" -ForegroundColor Gray
Write-Host "  (Full Account scope, sem expiração)" -ForegroundColor Gray
Write-Host ""
$answer = Read-Host "  Gerar token NOVO agora? (S/N) [N]"
if ($answer -eq 'S' -or $answer -eq 's') {
    Start-Process "https://vercel.com/account/tokens"
    Write-Host ""
    $token = Read-Host "  Cole o novo token aqui"
    if ($token) {
        $token | & gh secret set VERCEL_TOKEN
        Assert-Exit "gh secret set VERCEL_TOKEN"
        Write-Host "  -> VERCEL_TOKEN atualizado" -ForegroundColor Green
    }
}

# 5. Dispara deploy + monitora
Write-Host ""
Write-Host "[5/5] Disparando deploy..." -ForegroundColor Yellow
& gh workflow run deploy-frontend.yml --ref main
Assert-Exit "gh workflow run"
Start-Sleep -Seconds 8

# Pega o ID do último run
$runJson = & gh run list --workflow=deploy-frontend.yml --limit 1 --json databaseId,url
$run = $runJson | ConvertFrom-Json
if ($run -is [array]) { $run = $run[0] }
Write-Host "  -> Run ID: $($run.databaseId)" -ForegroundColor Green
Write-Host "  -> URL:    $($run.url)" -ForegroundColor Green
Write-Host ""
Write-Host "  Monitorando (Ctrl+C interrompe)..." -ForegroundColor Yellow
& gh run watch $run.databaseId

Write-Host ""
Write-Host "=== CONCLUÍDO ===" -ForegroundColor Cyan
Write-Host "Em ~30s teste: https://monitoramento-pi.vercel.app/ (Ctrl+Shift+R)" -ForegroundColor Green
Pop-Location
