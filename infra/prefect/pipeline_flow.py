"""
infra/prefect/pipeline_flow.py
Orquestração completa do pipeline de desmatamento PI via Prefect.

Fluxo de execução
─────────────────
  1. baixar_prodes()          — WFS TerraBrasilis (anual, só em outubro)
  2. baixar_mapbiomas()       — GraphQL API MapBiomas (requer MAPBIOMAS_TOKEN)
  3. baixar_asvs()            — WFS IBAMA SINAFLOR  (continue-on-error: usa cache)
  4. baixar_deradsa_storage() — Supabase Storage    (continue-on-error)
  5. run_pipeline()           — processa 11 etapas, gera alertas_classificados.geojson
  6. verificar_saidas()       — checa existência e tamanho dos arquivos de saída
  7. upload_supabase()        — upsert via psycopg2 (service_role)
  8. verificar_supabase()     — confirma contagem mínima de registros
  9. gerar_relatorio()        — publica Prefect Artifact com resumo do run

Uso
───
  # Execução local (teste sem upload):
  python infra/prefect/pipeline_flow.py

  # Deploy no Prefect Cloud:
  prefect --no-prompt deploy --all

  # Trigger manual via CLI:
  prefect deployment run 'Pipeline Desmatamento PI/desmatamento-pi-mensal'

  # Trigger com dry-run (pipeline sem upload):
  prefect deployment run 'Pipeline Desmatamento PI/desmatamento-pi-mensal' \\
      --param fazer_upload=false

Requisitos
──────────
  pip install "prefect>=3.0"
  Variáveis de ambiente (via .env ou Prefect Secrets):
    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
    MAPBIOMAS_TOKEN  (para baixar_mapbiomas)
    PYTHONUTF8=1
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from prefect import flow, task, get_run_logger
from prefect.artifacts import create_markdown_artifact

PROJECT_DIR = Path(__file__).parent.parent.parent.resolve()
PYTHON      = sys.executable

# Caminhos canônicos dos arquivos de dados
BASE_DADOS   = PROJECT_DIR / "data" / "raw"
RESULTADO    = PROJECT_DIR / "data" / "output"
ALERTAS_PATH = BASE_DADOS / "Alertas de Desmatamento(MAPBIOMAS).geojson"
ASVS_PATH    = BASE_DADOS / "ASVs Emitidas-PI(SINAFLOR+).geojson"
PRODES_PATH  = BASE_DADOS / "PRODES_Cerrado_PI.geojson"


# ── Helpers ───────────────────────────────────────────────────────────────

def _run(cmd: list[str], *, description: str) -> subprocess.CompletedProcess[str]:
    """Executa subprocesso com logging e propagação de erro."""
    logger = get_run_logger()
    logger.info("▶ %s", description)
    result = subprocess.run(
        cmd,
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    if result.stdout:
        logger.info(result.stdout[:4000])
    if result.stderr:
        logger.warning(result.stderr[:2000])
    return result


# ── Tasks de download ─────────────────────────────────────────────────────

@task(
    name="Download PRODES (WFS TerraBrasilis)",
    description="Baixa polígonos PRODES-Cerrado INPE via WFS com bbox do Piauí",
    retries=2,
    retry_delay_seconds=300,
)
def baixar_prodes(force: bool = False) -> bool:
    """
    Baixa PRODES somente se arquivo ausente ou force=True.
    Retorna True se download executado, False se reutilizou cache.
    """
    logger = get_run_logger()
    if PRODES_PATH.exists() and not force:
        size_mb = PRODES_PATH.stat().st_size / 1e6
        logger.info("✓ PRODES em cache: %s (%.1f MB) — use force=True para atualizar", PRODES_PATH.name, size_mb)
        return False

    result = _run([PYTHON, str(PROJECT_DIR / "_baixar_prodes.py")], description="Download PRODES WFS")
    if result.returncode != 0:
        raise RuntimeError(f"Download PRODES falhou:\n{result.stderr[-1500:]}")

    if not PRODES_PATH.exists():
        raise FileNotFoundError(f"PRODES não encontrado após download: {PRODES_PATH}")

    logger.info("✓ PRODES baixado: %.1f MB", PRODES_PATH.stat().st_size / 1e6)
    return True


@task(
    name="Download MapBiomas Alertas",
    description="Baixa alertas de desmatamento via GraphQL API MapBiomas (requer MAPBIOMAS_TOKEN)",
    retries=2,
    retry_delay_seconds=180,
)
def baixar_mapbiomas() -> bool:
    """
    Baixa alertas MapBiomas. Requer variável MAPBIOMAS_TOKEN.
    Retorna True se download bem-sucedido.
    """
    logger = get_run_logger()

    token = os.environ.get("MAPBIOMAS_TOKEN")
    if not token:
        raise EnvironmentError(
            "MAPBIOMAS_TOKEN ausente. Configure em .env ou nos Secrets do Prefect.\n"
            "Obtenha em: https://plataforma.alerta.mapbiomas.org > Conta > API Token"
        )

    script = PROJECT_DIR / "pipeline" / "_baixar_mapbiomas.py"
    result = _run([PYTHON, str(script)], description="Download MapBiomas GraphQL API")

    if result.returncode != 0:
        raise RuntimeError(f"Download MapBiomas falhou:\n{result.stderr[-1500:]}")

    if not ALERTAS_PATH.exists():
        raise FileNotFoundError(f"Alertas MapBiomas não encontrados após download: {ALERTAS_PATH}")

    logger.info("✓ Alertas MapBiomas: %.1f MB", ALERTAS_PATH.stat().st_size / 1e6)
    return True


@task(
    name="Download ASVs SINAFLOR (WFS IBAMA)",
    description="Tenta baixar ASVs via WFS; usa cache se WFS indisponível",
    retries=1,
    retry_delay_seconds=60,
)
def baixar_asvs() -> bool:
    """
    Baixa ASVs SINAFLOR+ via WFS IBAMA.
    ATENÇÃO: endpoint retorna 400/403 com frequência — task continua com cache.
    Retorna True se download OK, False se usou cache.
    """
    logger = get_run_logger()
    script  = PROJECT_DIR / "pipeline" / "_baixar_asvs.py"
    result = _run([PYTHON, str(script)], description="Download ASVs WFS IBAMA")

    if result.returncode != 0:
        if ASVS_PATH.exists():
            logger.warning(
                "WFS IBAMA indisponível (código %d) — reutilizando cache: %s",
                result.returncode, ASVS_PATH.name
            )
            return False
        raise RuntimeError(
            f"Download ASVs falhou e não há cache disponível:\n{result.stderr[-1500:]}"
        )

    logger.info("✓ ASVs SINAFLOR: %.1f MB", ASVS_PATH.stat().st_size / 1e6)
    return True


@task(
    name="Download DERADSAs (Supabase Storage)",
    description="Baixa arquivos DERADSA do Supabase Storage para base de dados/",
    retries=2,
    retry_delay_seconds=60,
)
def baixar_deradsa_storage() -> bool:
    """
    Baixa DERADSAs do Supabase Storage.
    continue-on-error: pipeline funciona sem DERADSAs (anos sem dado).
    Retorna True se download OK, False se falhou (mas não levanta exceção).
    """
    logger = get_run_logger()
    script = PROJECT_DIR / "pipeline" / "_baixar_deradsa_storage.py"

    if not script.exists():
        logger.info("Script de download DERADSAs não encontrado — pulando")
        return False

    result = _run([PYTHON, str(script)], description="Download DERADSAs Supabase Storage")

    if result.returncode != 0:
        logger.warning("Download DERADSAs falhou (código %d) — pipeline continuará sem DERADSAs", result.returncode)
        return False

    logger.info("✓ DERADSAs baixadas com sucesso")
    return True


# ── Tasks de processamento ────────────────────────────────────────────────

@task(
    name="Executar Pipeline v2",
    description="Processa GeoJSONs → 11 etapas → alertas_classificados.geojson + agregado_municipios.json",
    retries=1,
    retry_delay_seconds=120,
)
def run_pipeline() -> str:
    """Executa o pipeline completo. Retorna stdout para relatório."""
    logger = get_run_logger()
    logger.info("Diretório do projeto: %s", PROJECT_DIR)

    result = _run([PYTHON, "-m", "pipeline"], description="Pipeline v2 (11 etapas)")

    if result.returncode != 0:
        raise RuntimeError(f"Pipeline falhou (código {result.returncode}):\n{result.stderr[-2000:]}")

    logger.info("✓ Pipeline concluído")
    return result.stdout


@task(
    name="Verificar Saídas do Pipeline",
    description="Checa existência e tamanho mínimo dos arquivos de saída",
)
def verificar_saidas() -> dict[str, str]:
    """Valida que os outputs críticos foram gerados."""
    logger = get_run_logger()
    arquivos_esperados = [
        "alertas_classificados.geojson",
        "agregado_municipios.json",
        "municipios_pi.geojson",
        "pipeline.log",
    ]
    status: dict[str, str] = {}
    for nome in arquivos_esperados:
        p = RESULTADO / nome
        if not p.exists():
            status[nome] = "AUSENTE"
            logger.error("✗ Arquivo ausente: %s", nome)
        else:
            kb = p.stat().st_size // 1024
            status[nome] = f"{kb} KB"
            logger.info("  ✓ %s — %d KB", nome, kb)

    ausentes = [k for k, v in status.items() if v == "AUSENTE"]
    if ausentes:
        raise RuntimeError(f"Arquivos ausentes após pipeline: {ausentes}")

    return status


# ── Tasks de upload e verificação ─────────────────────────────────────────

@task(
    name="Upload Supabase",
    description="Envia alertas_classificados.geojson e agregado_municipios.json ao Supabase via psycopg2",
    retries=2,
    retry_delay_seconds=60,
)
def upload_supabase() -> None:
    """Upload via service_role. Requer SUPABASE_URL e SUPABASE_SERVICE_KEY."""
    logger = get_run_logger()

    upload_script = PROJECT_DIR / "pipeline" / "_upload_supabase.py"
    if not upload_script.exists():
        raise FileNotFoundError(f"Script de upload não encontrado: {upload_script}")

    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        if not os.environ.get(var):
            raise EnvironmentError(
                f"Variável obrigatória ausente: {var}. "
                "Configure no .env ou nos Secrets do Prefect."
            )

    result = _run([PYTHON, str(upload_script)], description="Upload ao Supabase")
    if result.returncode != 0:
        raise RuntimeError(f"Upload falhou (código {result.returncode}):\n{result.stderr[-2000:]}")

    logger.info("✓ Upload concluído")


@task(
    name="Verificar Supabase",
    description="Confirma que os registros foram inseridos com contagem mínima esperada",
    retries=1,
    retry_delay_seconds=30,
)
def verificar_supabase(min_fragmentos: int = 13000, min_agregados: int = 700) -> dict[str, int]:
    """
    Consulta Supabase via REST (anon key) para confirmar contagens pós-upload.
    Levanta RuntimeError se contagens abaixo do mínimo esperado.
    """
    logger = get_run_logger()
    import urllib.request
    import json

    url    = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon_k = os.environ.get("SUPABASE_ANON_KEY", "")

    if not url or not anon_k:
        logger.warning("SUPABASE_URL ou SUPABASE_ANON_KEY ausentes — verificação pulada")
        return {}

    def count_table(table: str) -> int:
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select=id&limit=1",
            headers={
                "apikey": anon_k,
                "Authorization": f"Bearer {anon_k}",
                "Prefer": "count=exact",
                "Range-Unit": "items",
                "Range": "0-0",
            },
        )
        with urllib.request.urlopen(req) as resp:
            content_range = resp.headers.get("Content-Range", "")
            # Content-Range: 0-0/13638
            total = int(content_range.split("/")[-1]) if "/" in content_range else -1
            return total

    try:
        n_alertas  = count_table("alertas_classificados")
        n_agregado = count_table("agregado_municipios")
    except Exception as exc:
        logger.warning("Falha na verificação Supabase: %s — upload pode ter ocorrido mesmo assim", exc)
        return {}

    logger.info("Supabase: %d fragmentos · %d registros de agregado", n_alertas, n_agregado)

    erros = []
    if n_alertas < min_fragmentos:
        erros.append(f"alertas_classificados: {n_alertas} < mínimo {min_fragmentos}")
    if n_agregado < min_agregados:
        erros.append(f"agregado_municipios: {n_agregado} < mínimo {min_agregados}")

    if erros:
        raise RuntimeError("Upload incompleto:\n" + "\n".join(erros))

    logger.info("✓ Supabase verificado — contagens OK")
    return {"alertas": n_alertas, "agregado": n_agregado}


# ── Task de relatório ─────────────────────────────────────────────────────

@task(name="Gerar Relatório Prefect", description="Publica resumo do run como Prefect Artifact")
async def gerar_relatorio(
    pipeline_log: str,
    saidas:       dict[str, str],
    supabase_ok:  dict[str, int],
) -> None:
    linhas_saidas = "\n".join(
        f"| `{nome}` | {tamanho} |" for nome, tamanho in saidas.items()
    )

    resumo_log = ""
    for linha in (pipeline_log or "").splitlines():
        if any(kw in linha for kw in ("ETAPA", "✓", "Testes:", "IPI", "Fragmentação", "Exportação")):
            resumo_log += f"- {linha.strip()}\n"

    linhas_sb = "".join(f"- **{k}**: {v:,}\n" for k, v in supabase_ok.items()) or "_verificação pulada_"

    markdown = f"""## Pipeline Desmatamento PI — Resumo do Run

### Arquivos Gerados
| Arquivo | Tamanho |
|---------|---------|
{linhas_saidas}

### Supabase
{linhas_sb}

### Log Resumido
{resumo_log or "_Log resumido não disponível_"}

---
*Projeto: CGEO / SEMARH-PI · Pipeline v2 · Metodologia: ASV > DERADSA · Limiar 99%*
"""
    await create_markdown_artifact(
        key="pipeline-resumo",
        markdown=markdown,
        description="Resumo da execução do pipeline de desmatamento PI",
    )


# ── Flow principal ────────────────────────────────────────────────────────

@flow(
    name="Pipeline Desmatamento PI",
    description=(
        "Orquestração completa: download de dados → pipeline v2 → upload Supabase. "
        "Agendado mensalmente (todo dia 5) e anualmente em outubro para PRODES."
    ),
    log_prints=True,
)
def pipeline_flow(
    fazer_upload:    bool = True,
    force_prodes:    bool = False,
    incluir_prodes:  bool = True,
    incluir_alertas: bool = True,
) -> None:
    """
    Parâmetros
    ----------
    fazer_upload : bool
        Se True (padrão), executa upload ao Supabase. False = dry-run.
    force_prodes : bool
        Se True, força re-download do PRODES mesmo que arquivo exista.
    incluir_prodes : bool
        Se True (padrão), executa step de download do PRODES.
    incluir_alertas : bool
        Se True (padrão), baixa alertas MapBiomas frescos.
        False = reutilizar cache local (útil quando MAPBIOMAS_TOKEN indisponível).
    """
    logger = get_run_logger()
    logger.info("=== Pipeline Desmatamento PI — início ===")

    # ── Passo 1: Downloads (paralelos onde possível) ────────────────────────
    if incluir_prodes:
        baixar_prodes(force=force_prodes)

    if incluir_alertas:
        baixar_mapbiomas()

    # ASVs e DERADSAs: continue-on-error (usam cache se WFS indisponível)
    baixar_asvs()
    baixar_deradsa_storage()

    # ── Passo 2: Pipeline ──────────────────────────────────────────────────
    pipeline_output = run_pipeline()

    # ── Passo 3: Verificar saídas ──────────────────────────────────────────
    saidas = verificar_saidas(wait_for=[pipeline_output])

    # ── Passo 4: Upload e verificação (condicional) ────────────────────────
    supabase_ok: dict[str, int] = {}
    if fazer_upload:
        upload_supabase(wait_for=[saidas])
        supabase_ok = verificar_supabase(wait_for=[saidas])
        logger.info("Upload e verificação Supabase concluídos")
    else:
        logger.info("Upload pulado (fazer_upload=False) — dry-run")

    # ── Passo 5: Relatório ─────────────────────────────────────────────────
    gerar_relatorio(pipeline_output, saidas, supabase_ok)

    logger.info("=== Pipeline Desmatamento PI — concluído ===")


# ── Execução local (teste) ────────────────────────────────────────────────

if __name__ == "__main__":
    # Dry-run local: não baixa dados externos nem faz upload
    pipeline_flow(
        fazer_upload=False,
        incluir_prodes=False,
        incluir_alertas=False,
    )
