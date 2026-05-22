# =============================================================
# configurar_supabase.ps1 — Configuração do ambiente Supabase
# GCGEO/SEMARH-PI — Pipeline de Desmatamento v2
#
# Uso: duplo clique neste arquivo
# Requer: Miniconda instalado, ambiente "desmatamento" criado
# =============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Configurar Supabase — GCGEO/SEMARH-PI"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Configuração do Supabase — Desmatamento PI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar se já existe .env configurado ───────────────────────────────
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -notmatch "\[project-ref\]") {
        Write-Host "✓ .env já configurado." -ForegroundColor Green
        $confirmar = Read-Host "  Reconfigurar? (s/N)"
        if ($confirmar -ne "s" -and $confirmar -ne "S") {
            Write-Host "  Configuração mantida." -ForegroundColor Yellow
            goto verificar_pacotes
        }
    }
}

# ── Coletar credenciais ───────────────────────────────────────────────────
Write-Host "PASSO 1: Credenciais do Supabase" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Como obter:"
Write-Host "  1. Acesse https://supabase.com e faça login"
Write-Host "  2. Selecione seu projeto 'desmatamento-pi'"
Write-Host "  3. Vá em: Settings (engrenagem) → API"
Write-Host "  4. Copie os valores abaixo:"
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────────┐"
Write-Host "  │  Project URL     → VITE_SUPABASE_URL                   │"
Write-Host "  │  anon/public key → VITE_SUPABASE_ANON_KEY              │"
Write-Host "  │  service_role    → SUPABASE_SERVICE_KEY  ← SECRETA      │"
Write-Host "  └─────────────────────────────────────────────────────────┘"
Write-Host ""

$supabaseUrl = Read-Host "  Cole o Project URL (ex: https://xyzabc.supabase.co)"
$anonKey     = Read-Host "  Cole a anon/public key (eyJ...)"
$serviceKey  = Read-Host "  Cole a service_role key (eyJ...)"

Write-Host ""
Write-Host "PASSO 2: Token MapBiomas (opcional — necessário para updates automáticos)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Como obter:"
Write-Host "  1. Acesse https://plataforma.alerta.mapbiomas.org"
Write-Host "  2. Crie uma conta gratuita (usar email institucional)"
Write-Host "  3. Perfil → API Token"
Write-Host ""
$mbToken = Read-Host "  Cole o token (Enter para pular)"

# ── Criar .env (raiz do projeto — para o pipeline Python) ─────────────────
Write-Host ""
Write-Host "Criando .env..." -ForegroundColor Cyan

$envContent = @"
# ============================================================
# .env — Credenciais do projeto (NÃO commitar no git)
# Gerado por configurar_supabase.ps1 em $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# ============================================================

SUPABASE_URL=$supabaseUrl
SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_KEY=$serviceKey

VITE_SUPABASE_URL=$supabaseUrl
VITE_SUPABASE_ANON_KEY=$anonKey

SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres

MAPBIOMAS_TOKEN=$mbToken

NOTIFICACAO_EMAIL=gcgeo@semarh.pi.gov.br
"@

Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "  ✓ .env criado" -ForegroundColor Green

# ── Criar frontend/.env ───────────────────────────────────────────────────
$frontendEnvPath = Join-Path $PSScriptRoot "frontend" ".env"
$frontendEnv = @"
VITE_SUPABASE_URL=$supabaseUrl
VITE_SUPABASE_ANON_KEY=$anonKey
"@
Set-Content -Path $frontendEnvPath -Value $frontendEnv -Encoding UTF8
Write-Host "  ✓ frontend/.env criado" -ForegroundColor Green

# ── Verificar e instalar pacotes conda ───────────────────────────────────
:verificar_pacotes
Write-Host ""
Write-Host "PASSO 3: Verificando pacotes Python..." -ForegroundColor Yellow

$condaBase = "C:\Users\MARCO\miniconda3"
$condaExe  = Join-Path $condaBase "Scripts\conda.exe"
$activateScript = Join-Path $condaBase "shell\condabin\conda-hook.ps1"

if (-not (Test-Path $condaExe)) {
    Write-Host "  ✗ Miniconda não encontrado em $condaBase" -ForegroundColor Red
    Write-Host "    Verifique o caminho no script ou instale o Miniconda" -ForegroundColor Red
    Read-Host "  Pressione Enter para sair"
    exit 1
}

Write-Host "  Verificando supabase-py e python-dotenv..."

$checkResult = & $condaExe run -n desmatamento python -c "import supabase, dotenv; print('OK')" 2>&1
if ($checkResult -match "OK") {
    Write-Host "  ✓ supabase-py e python-dotenv instalados" -ForegroundColor Green
} else {
    Write-Host "  Instalando dependências (pode demorar 2-3 minutos)..." -ForegroundColor Yellow
    & $condaExe install -n desmatamento -c conda-forge supabase python-dotenv -y
    Write-Host "  ✓ Instalação concluída" -ForegroundColor Green
}

# ── Testar conexão ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "PASSO 4: Testando conexão com o Supabase..." -ForegroundColor Yellow

$testScript = @"
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(r'$PSScriptRoot') / '.env')
url = os.environ.get('SUPABASE_URL', '')
key = os.environ.get('SUPABASE_ANON_KEY', '')

if not url or '[project-ref]' in url:
    raise SystemExit('SUPABASE_URL não configurado')

from supabase import create_client
sb = create_client(url, key)

# Testa leitura de tabela (retorna vazio se ainda não populada)
result = sb.table('alertas_classificados').select('id_fragmento').limit(1).execute()
print(f'OK — Supabase conectado | {len(result.data)} registros na tabela alertas_classificados')
"@

$testFile = [System.IO.Path]::GetTempFileName() + ".py"
Set-Content -Path $testFile -Value $testScript -Encoding UTF8

$testResult = & $condaExe run -n desmatamento python $testFile 2>&1
Remove-Item $testFile -ErrorAction SilentlyContinue

if ($testResult -match "OK") {
    Write-Host "  ✓ $testResult" -ForegroundColor Green
} elseif ($testResult -match "relation.*does not exist") {
    Write-Host "  ⚠ Conectado mas migrations não executadas ainda (esperado)" -ForegroundColor Yellow
    Write-Host "    Execute as migrations SQL no Supabase SQL Editor (passo abaixo)" -ForegroundColor Yellow
} else {
    Write-Host "  ✗ Conexão falhou:" -ForegroundColor Red
    Write-Host "    $testResult" -ForegroundColor Red
    Write-Host "    Verifique URL e chaves no .env" -ForegroundColor Red
}

# ── Instruções finais ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PRÓXIMOS PASSOS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. EXECUTAR MIGRATIONS SQL no Supabase:" -ForegroundColor Yellow
Write-Host "     a. Acesse: https://supabase.com → seu projeto"
Write-Host "     b. Vá em: SQL Editor (ícone de banco de dados)"
Write-Host "     c. Clique em 'New query'"
Write-Host "     d. Copie e execute CADA arquivo abaixo em ordem:"
Write-Host ""
Write-Host "       infra\supabase\migrations\001_schema_inicial.sql" -ForegroundColor White
Write-Host "       infra\supabase\migrations\002_matopiba_view.sql"  -ForegroundColor White
Write-Host "       infra\supabase\migrations\003_deradsa_management.sql" -ForegroundColor White
Write-Host ""
Write-Host "  2. HABILITAR POSTGIS no Supabase:"
Write-Host "     Database → Extensions → procurar 'postgis' → Enable"
Write-Host ""
Write-Host "  3. EXECUTAR PIPELINE + UPLOAD:"
Write-Host "     conda activate desmatamento"
Write-Host "     python -m pipeline"
Write-Host "     (o upload para o Supabase ocorre automaticamente ao final)"
Write-Host ""
Write-Host "  4. CONFIGURAR GITHUB ACTIONS (para atualizações automáticas):"
Write-Host "     Repositório GitHub → Settings → Secrets and variables → Actions"
Write-Host "     Adicionar secrets:"
Write-Host "       SUPABASE_URL         = $supabaseUrl"
Write-Host "       SUPABASE_ANON_KEY    = (anon key)"
Write-Host "       SUPABASE_SERVICE_KEY = (service_role key — SECRETA)"
Write-Host "       MAPBIOMAS_TOKEN      = (token MapBiomas)"
Write-Host ""
Write-Host "  5. VERIFICAR FRONTEND:"
Write-Host "     cd frontend && npm run dev"
Write-Host "     Abrir http://localhost:5173"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "  Pressione Enter para sair"
