# rodar_pipeline.ps1
# Script de execução do pipeline de desmatamento PI v2
# Uso: duplo clique (ou clique direito → "Executar com PowerShell")
#
# Ambiente: conda geo (C:\miniconda3\envs\geo)
# Python: 3.12 | geopandas 1.1.1 | shapely 2.0.7

$conda_env  = "C:\miniconda3\envs\geo"
$python     = "$conda_env\python.exe"
$proj_dir   = $PSScriptRoot
$log        = "$proj_dir\Resultado\pipeline.log"

# Configurar ambiente
$env:GDAL_DATA  = "$conda_env\Library\share\gdal"
$env:PROJ_LIB   = "$conda_env\Library\share\proj"
$env:PYTHONUTF8 = "1"   # UTF-8 no console — elimina UnicodeEncodeError no Windows

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pipeline Desmatamento PI - v2" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $python)) {
    Write-Host "ERRO: Python do ambiente 'geo' nao encontrado." -ForegroundColor Red
    Write-Host "      Esperado em: $python" -ForegroundColor Red
    Write-Host "      Execute: conda create -n geo python=3.12" -ForegroundColor Yellow
    Read-Host "  Pressione Enter para sair"
    exit 1
}

Write-Host "Ambiente : $conda_env" -ForegroundColor Gray
Write-Host "Diretorio: $proj_dir" -ForegroundColor Gray
Write-Host ""
Write-Host "Iniciando processamento..." -ForegroundColor Yellow

$start = Get-Date

# Executa pipeline como modulo Python (python -m pipeline)
# Isso garante que todos os imports relativos funcionem corretamente
Set-Location $proj_dir
& $python -m pipeline

$duracao = (Get-Date) - $start

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Pipeline concluido com sucesso!" -ForegroundColor Green
} else {
    Write-Host "  Pipeline encerrou com erros (codigo $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "  Verifique o log: $log" -ForegroundColor Yellow
}
Write-Host "  Tempo total: $([math]::Round($duracao.TotalMinutes, 1)) minutos" -ForegroundColor Cyan
Write-Host "  Log: $log" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Pressione Enter para sair"
