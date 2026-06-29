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

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."
$frontend = Join-Path $root 'frontend'

Write-Host ""
Write-Host "=== REPARO DE DEPLOY VERCEL ===" -ForegroundColor Cyan
Write-Host ""

# 1. Login Vercel (abre browser se necessário)
Write-Host "[1/5] Login Vercel (abre browser se necessário)..." -ForegroundColor Yellow
Push-Location $frontend
npx vercel@latest whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  -> Você não está logado. Abrindo browser..." -ForegroundColor Gray
    npx vercel@latest login
    if ($LASTEXITCODE -ne 0) { throw "Falha no login Vercel" }
}
$whoami = (npx vercel@latest whoami 2>&1)
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
    npx vercel@latest link
    if (-not (Test-Path .vercel\project.json)) { throw "Link falhou - .vercel/project.json não foi criado" }
}

# 3. Extrai IDs
Write-Host ""
Write-Host "[3/5] Extraindo IDs..." -ForegroundColor Yellow
$proj = Get-Content .vercel\project.json | ConvertFrom-Json
Write-Host "  ORG_ID:     $($proj.orgId)" -ForegroundColor Green
Write-Host "  PROJECT_ID: $($proj.projectId)" -ForegroundColor Green
Pop-Location

# 4. Atualiza GitHub Secrets
Write-Host ""
Write-Host "[4/5] Atualizando GitHub Secrets..." -ForegroundColor Yellow
Push-Location $root
$proj.orgId     | gh secret set VERCEL_ORG_ID
$proj.projectId | gh secret set VERCEL_PROJECT_ID
Write-Host "  -> VERCEL_ORG_ID + VERCEL_PROJECT_ID atualizados" -ForegroundColor Green

# Token check
Write-Host ""
Write-Host "  Sobre VERCEL_TOKEN:" -ForegroundColor Yellow
Write-Host "  O secret pode estar expirado. Se o deploy falhar abaixo," -ForegroundColor Gray
Write-Host "  gere um novo em: https://vercel.com/account/tokens" -ForegroundColor Gray
Write-Host "  (full scope, sem expiração) e rode:" -ForegroundColor Gray
Write-Host "     gh secret set VERCEL_TOKEN" -ForegroundColor Cyan
Write-Host ""
$answer = Read-Host "  Quer gerar um novo TOKEN agora? (S/N)"
if ($answer -eq 'S' -or $answer -eq 's') {
    Start-Process "https://vercel.com/account/tokens"
    $token = Read-Host "  Cole o novo token aqui"
    $token | gh secret set VERCEL_TOKEN
    Write-Host "  -> VERCEL_TOKEN atualizado" -ForegroundColor Green
}

# 5. Dispara deploy + monitora
Write-Host ""
Write-Host "[5/5] Disparando deploy..." -ForegroundColor Yellow
gh workflow run deploy-frontend.yml --ref main
Start-Sleep -Seconds 6
$run = (gh run list --workflow=deploy-frontend.yml --limit 1 --json databaseId,url | ConvertFrom-Json)[0]
Write-Host "  -> Run ID: $($run.databaseId)" -ForegroundColor Green
Write-Host "  -> URL: $($run.url)" -ForegroundColor Green
Write-Host ""
Write-Host "  Monitorando (Ctrl+C interrompe)..." -ForegroundColor Yellow
gh run watch $run.databaseId

Write-Host ""
Write-Host "=== CONCLUÍDO ===" -ForegroundColor Cyan
Write-Host "Verifique https://monitoramento-pi.vercel.app/ em ~2 min com Ctrl+Shift+R" -ForegroundColor Green
Pop-Location
