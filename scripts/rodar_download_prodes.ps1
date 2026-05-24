# ============================================================
#  rodar_download_prodes.ps1
#  Download automatico PRODES-Cerrado recortado para o Piaui
#  Duplo clique para executar
# ============================================================

Set-Location $PSScriptRoot

$env:PYTHONUTF8     = "1"
$env:GDAL_DATA      = "C:\Users\MARCO\miniconda3\envs\desmatamento\Library\share\gdal"
$env:PROJ_LIB       = "C:\Users\MARCO\miniconda3\envs\desmatamento\Library\share\proj"
$env:CONDA_PREFIX   = "C:\Users\MARCO\miniconda3\envs\desmatamento"

$PY = "C:\Users\MARCO\miniconda3\envs\desmatamento\python.exe"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  DOWNLOAD PRODES-CERRADO / TerraBrasilis (INPE)" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Fonte  : TerraBrasilis WFS (INPE)" -ForegroundColor Gray
Write-Host "  Destino: base de dados\PRODES_Cerrado_PI.geojson" -ForegroundColor Gray
Write-Host "  Anos   : 2022 2023 2024 2025" -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $PY)) {
    Write-Host "[ERRO] Python nao encontrado em: $PY" -ForegroundColor Red
    Write-Host "       Verifique se o ambiente conda 'desmatamento' existe." -ForegroundColor Red
    Write-Host ""
    pause
    exit 1
}

Write-Host "Verificando conexao com TerraBrasilis..." -ForegroundColor Yellow
& $PY "_baixar_prodes.py" --dry-run
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERRO] Sem conexao com o servidor INPE." -ForegroundColor Red
    Write-Host "       Verifique sua conexao de internet e tente novamente." -ForegroundColor Red
    Write-Host ""
    pause
    exit 1
}

Write-Host ""
Write-Host "Conexao OK. Iniciando download..." -ForegroundColor Green
Write-Host "(Aguarde — trafego esperado: 5 a 30 MB)" -ForegroundColor Gray
Write-Host ""

& $PY "_baixar_prodes.py" --anos 2022 2023 2024 2025

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "  DOWNLOAD CONCLUIDO COM SUCESSO" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximo passo: execute o pipeline para ativar a validacao PRODES" -ForegroundColor Yellow
    Write-Host "  -> Duplo clique em rodar_pipeline.ps1" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[ERRO] Download falhou. Consulte a mensagem acima." -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternativa manual:" -ForegroundColor Yellow
    Write-Host "  1. Acesse https://terrabrasilis.dpi.inpe.br/en/home-page/" -ForegroundColor Gray
    Write-Host "  2. Va em Download > PRODES Cerrado > yearly_deforestation" -ForegroundColor Gray
    Write-Host "  3. Salve como: base de dados\PRODES_Cerrado_PI.geojson" -ForegroundColor Gray
}

Write-Host ""
pause
