"""
infra/prefect/pipeline_flow.py
Orquestração do pipeline de desmatamento PI via Prefect.

Uso:
    # Execução local (teste):
    python infra/prefect/pipeline_flow.py

    # Deploy no Prefect Cloud:
    prefect deploy infra/prefect/pipeline_flow.py:pipeline_flow \
        --name "desmatamento-pi-mensal" \
        --pool <nome-do-worker-pool>

    # Trigger manual via CLI:
    prefect deployment run 'Pipeline Desmatamento PI/desmatamento-pi-mensal'

Requisitos:
    pip install prefect>=3.0
    Variáveis de ambiente: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (no .env ou Secrets do Prefect)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from prefect import flow, task, get_run_logger
from prefect.artifacts import create_markdown_artifact

PROJECT_DIR = Path(__file__).parent.parent.parent.resolve()
PYTHON = sys.executable


# ── Tarefas individuais ───────────────────────────────────────────────────

@task(
    name="Executar Pipeline",
    description="Processa GeoJSONs e gera alertas_classificados + agregado_municipios",
    retries=1,
    retry_delay_seconds=120,
)
def run_pipeline() -> str:
    logger = get_run_logger()
    logger.info("Iniciando pipeline de desmatamento PI...")
    logger.info("Diretório: %s", PROJECT_DIR)

    env = {**os.environ, "PYTHONUTF8": "1"}
    result = subprocess.run(
        [PYTHON, "-m", "pipeline"],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )

    if result.stdout:
        logger.info(result.stdout)
    if result.stderr:
        logger.warning(result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"Pipeline falhou (código {result.returncode}):\n{result.stderr[-2000:]}")

    logger.info("Pipeline concluído com sucesso")
    return result.stdout


@task(
    name="Upload Supabase",
    description="Envia alertas_classificados.geojson e agregado_municipios.json ao Supabase",
    retries=2,
    retry_delay_seconds=60,
)
def upload_supabase() -> None:
    logger = get_run_logger()

    upload_script = PROJECT_DIR / "pipeline" / "_upload_supabase.py"
    if not upload_script.exists():
        raise FileNotFoundError(f"Script de upload não encontrado: {upload_script}")

    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        if not os.environ.get(var):
            raise EnvironmentError(
                f"Variável de ambiente obrigatória ausente: {var}. "
                "Configure no .env ou nos Secrets do Prefect."
            )

    logger.info("Iniciando upload ao Supabase...")
    result = subprocess.run(
        [PYTHON, str(upload_script)],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONUTF8": "1"},
    )

    if result.stdout:
        logger.info(result.stdout)
    if result.stderr:
        logger.warning(result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"Upload falhou (código {result.returncode}):\n{result.stderr[-2000:]}")

    logger.info("Upload concluído com sucesso")


@task(name="Verificar Saídas", description="Checa existência e tamanho mínimo dos arquivos de saída")
def verificar_saidas() -> dict[str, str]:
    logger = get_run_logger()
    resultado_dir = PROJECT_DIR / "Resultado"

    arquivos_esperados = [
        "alertas_classificados.geojson",
        "agregado_municipios.json",
        "municipios_pi.geojson",
        "pipeline.log",
    ]

    status: dict[str, str] = {}
    for nome in arquivos_esperados:
        p = resultado_dir / nome
        if not p.exists():
            status[nome] = "AUSENTE"
            logger.error("Arquivo ausente: %s", nome)
        else:
            kb = p.stat().st_size // 1024
            status[nome] = f"{kb} KB"
            logger.info("  ✓ %s — %d KB", nome, kb)

    ausentes = [k for k, v in status.items() if v == "AUSENTE"]
    if ausentes:
        raise RuntimeError(f"Arquivos ausentes após pipeline: {ausentes}")

    return status


@task(name="Gerar Relatório", description="Publica resumo do run como Prefect Artifact")
async def gerar_relatorio(pipeline_log: str, saidas: dict[str, str]) -> None:
    linhas_resultado = "\n".join(
        f"| `{nome}` | {tamanho} |"
        for nome, tamanho in saidas.items()
    )

    # Extrair linha de resumo do log (procurar "Fragmentação concluída" e "Testes: N/N")
    resumo_log = ""
    for linha in (pipeline_log or "").splitlines():
        if any(kw in linha for kw in ("Fragmentação", "Testes:", "Agregado gerado", "Exportação")):
            resumo_log += f"- {linha.strip()}\n"

    markdown = f"""## Pipeline Desmatamento PI — Resumo do Run

### Arquivos Gerados
| Arquivo | Tamanho |
|---------|---------|
{linhas_resultado}

### Log Resumido
{resumo_log or "_Log resumido não disponível_"}

### Configuração
- Projeto: GCGEO / SEMARH-PI · 2022–2025
- Pipeline: v2 modular
- Metodologia: ASV > DERADSA, limiar 99%, 4 classes
"""
    await create_markdown_artifact(
        key="pipeline-resumo",
        markdown=markdown,
        description="Resumo da execução do pipeline de desmatamento PI",
    )


# ── Flow principal ────────────────────────────────────────────────────────

@flow(
    name="Pipeline Desmatamento PI",
    description="Processa alertas de desmatamento MapBiomas × ASVs × DERADSAs e faz upload ao Supabase.",
    log_prints=True,
)
def pipeline_flow(fazer_upload: bool = True) -> None:
    """
    Parâmetros
    ----------
    fazer_upload : bool
        Se True (padrão), executa o upload ao Supabase após o pipeline.
        Útil desabilitar para testes locais sem credenciais Supabase.
    """
    logger = get_run_logger()
    logger.info("=== Pipeline Desmatamento PI — iniciando ===")

    # Passo 1 — Executar o pipeline
    pipeline_output = run_pipeline()

    # Passo 2 — Verificar saídas
    saidas = verificar_saidas(wait_for=[pipeline_output])

    # Passo 3 — Upload (condicional)
    if fazer_upload:
        upload_supabase(wait_for=[saidas])
        logger.info("Upload ao Supabase concluído")
    else:
        logger.info("Upload pulado (fazer_upload=False)")

    # Passo 4 — Relatório
    gerar_relatorio(pipeline_output, saidas)

    logger.info("=== Pipeline concluído ===")


# ── Execução local ────────────────────────────────────────────────────────

if __name__ == "__main__":
    pipeline_flow(fazer_upload=False)
