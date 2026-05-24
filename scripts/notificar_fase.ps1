# scripts/notificar_fase.ps1
# Exibe notificação balloon tip no Windows ao concluir uma fase da migração.
#
# Uso manual:
#   .\scripts\notificar_fase.ps1 -Fase "Fase 1"
#
# Uso via hook Stop (.claude/settings.local.json):
#   Cria .claude\.fase_marker com o nome da fase antes de terminar.
#   O hook chama este script sem parâmetros; ele lê e apaga o marker.

param(
    [string]$Fase = ""
)

# Caminho do marker criado pelo Claude ao concluir uma fase
$markerPath = Join-Path $PSScriptRoot "..\. claude\.fase_marker"
$markerPath = [System.IO.Path]::GetFullPath($markerPath)

# Se chamado sem parâmetro (via hook), verifica se há marker
if ($Fase -eq "") {
    if (-not (Test-Path $markerPath)) {
        exit 0  # Resposta normal do Claude — não notificar
    }
    $Fase = (Get-Content $markerPath -Raw).Trim()
    Remove-Item $markerPath -Force -ErrorAction SilentlyContinue
}

$title = "Claude Code — $Fase Concluída ✅"
$body  = "Revise o diff, rode os testes e commite antes de iniciar a próxima fase."

# Tenta balloon tip via System.Windows.Forms (disponível em todos os Windows)
try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing      -ErrorAction Stop

    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon              = [System.Drawing.SystemIcons]::Information
    $notify.BalloonTipIcon    = [System.Windows.Forms.ToolTipIcon]::Info
    $notify.BalloonTipTitle   = $title
    $notify.BalloonTipText    = $body
    $notify.Visible           = $true
    $notify.ShowBalloonTip(7000)
    Start-Sleep -Milliseconds 8000
    $notify.Dispose()
}
catch {
    # Fallback: exibe no terminal caso o Forms não esteja disponível
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  $title" -ForegroundColor Green
    Write-Host "  $body" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
}
