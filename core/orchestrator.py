"""
platform/orchestrator.py — Execução dos módulos registrados.

Substitui pipeline/__main__.py como dispatcher genérico.
Para executar o pipeline monolítico legado: python -m pipeline
Para executar via plataforma modular: python -m platform.orchestrator
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from core.registry import ModuleRegistry

log = logging.getLogger(__name__)

_ROOT = Path(__file__).parent.parent


def _init_sentry() -> bool:
    """Inicializa Sentry se SENTRY_DSN estiver configurado no .env.

    Ativo apenas em produção (não em dry_run local sem DSN).
    Captura exceções não tratadas no pipeline e erros de módulos.
    """
    load_dotenv(_ROOT / ".env")
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("ENV", "production"),
            traces_sample_rate=0.0,   # sem tracing — apenas error capture
            before_send=lambda event, hint: event,
        )
        return True
    except ImportError:
        log.warning("sentry-sdk não instalado — monitoramento desabilitado. "
                    "Instale com: pip install sentry-sdk")
        return False


def _status_geral(results: list[dict]) -> str:
    """Determina o status geral da execução a partir dos resultados individuais."""
    statuses = [r.get("status", "ok") for r in results]
    if "error" in statuses:
        return "error"
    if "warning" in statuses:
        return "warning"
    return "ok"


def _registrar(results: list[dict], duracao_s: int, dry_run: bool) -> None:
    """Persiste o resultado da execução em execucoes_pipeline (ignora dry_run)."""
    if dry_run:
        log.info("Orchestrator: dry-run — execução não registrada no Supabase.")
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(_ROOT / ".env")
        from supabase import create_client

        from core.uploader import registrar_execucao

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            log.warning("Orchestrator: SUPABASE_URL/KEY ausentes — execução não registrada.")
            return

        sb = create_client(url, key)

        # Extrair métricas do módulo principal
        alerta_res = next(
            (r for r in results if r.get("id") == "alertas_mapbiomas"), {}
        )
        n_alertas = alerta_res.get("records", 0) or 0
        # n_municipios vem do message se disponível (ex: "X fragmentos | Y municípios | …")
        n_mun = 0
        msg = alerta_res.get("message", "")
        if "municípios" in msg:
            try:
                n_mun = int(msg.split("municípios")[0].split("|")[-1].strip().split()[0])
            except Exception:
                pass

        # Testes T1-T9 — vêm no message de alertas_mapbiomas
        testes_ok, testes_total = 9, 9
        if "testes" in msg:
            try:
                t_part = msg.split("testes")[-1].strip().lstrip()
                testes_ok, testes_total = map(int, t_part.split("/"))
            except Exception:
                pass

        status   = _status_geral(results)
        mods_ok  = sum(1 for r in results if r.get("status") == "ok")
        mods_tot = len(results)

        # Resumo legível para log_resumo
        partes = []
        for r in results:
            icone = {"ok": "✓", "warning": "⚠", "error": "✗"}.get(r.get("status", "ok"), "?")
            partes.append(f"{icone} {r.get('id','?')}: {r.get('message','')[:60]}")
        log_resumo = f"[{status.upper()}] {n_alertas} fragmentos | {n_mun} municípios | " \
                     f"testes {testes_ok}/{testes_total} | {mods_ok}/{mods_tot} módulos\n" + \
                     "\n".join(partes)

        registrar_execucao(
            sb,
            n_alertas=n_alertas,
            n_mun=n_mun,
            testes_ok=testes_ok,
            testes_total=testes_total,
            status=status,
            duracao_s=duracao_s,
            modulos_ok=mods_ok,
            modulos_total=mods_tot,
            log_resumo=log_resumo,
        )
    except Exception as exc:
        log.warning("Orchestrator: falha ao registrar execução — %s", exc)


def run_all(config: dict | None = None, modules_dir: str | Path = "modules") -> list[dict]:
    """
    Executa todos os módulos habilitados em ordem de prioridade.

    Args:
        config: opções repassadas para cada módulo.run()
                Chaves comuns: dry_run (bool), ano (int), verbose (bool)
        modules_dir: caminho para a pasta modules/

    Returns:
        Lista de resultados por módulo: [{"id": str, "status": str, "records": int, ...}]
    """
    cfg = config or {}
    dry_run = cfg.get("dry_run", False)
    t_inicio = time.time()

    registry = ModuleRegistry(modules_dir)
    registry.discover()

    modules = registry.list()
    if not modules:
        log.warning("Nenhum módulo habilitado encontrado em '%s'.", modules_dir)
        return []

    log.info("Orchestrator: executando %d módulo(s)%s",
             len(modules), " [dry-run]" if dry_run else "")

    results: list[dict[str, Any]] = []
    for manifest in modules:
        mod_id = manifest["id"]
        t0 = time.time()
        log.info("▶ [%s] iniciando...", mod_id)
        try:
            result = registry.run(mod_id, cfg)
            elapsed = f"{(time.time() - t0):.1f}s"
            result.setdefault("id", mod_id)
            result.setdefault("elapsed", elapsed)
            log.info("✓ [%s] %s em %s", mod_id, result.get("message", "ok"), elapsed)
        except Exception as exc:
            elapsed = f"{(time.time() - t0):.1f}s"
            result = {"id": mod_id, "status": "error", "records": 0,
                      "message": str(exc), "elapsed": elapsed}
            log.error("✗ [%s] erro: %s", mod_id, exc)
        results.append(result)

    duracao_s = int(time.time() - t_inicio)
    status_final = _status_geral(results)
    ok = sum(1 for r in results if r.get("status") == "ok")

    log.info("Orchestrator: %d/%d módulos | status=%s | %ds",
             ok, len(results), status_final, duracao_s)

    # Registrar execução no Supabase (não bloqueia se falhar)
    _registrar(results, duracao_s, dry_run)

    # Exportar variáveis de ambiente para o GitHub Actions notifier
    _exportar_env_ci(results, status_final, duracao_s)

    return results


def _exportar_env_ci(results: list[dict], status: str, duracao_s: int) -> None:
    """Escreve variáveis no GITHUB_ENV para uso nas notificações do workflow."""
    github_env = os.environ.get("GITHUB_ENV")
    if not github_env:
        return  # não está no CI
    try:
        alerta_res = next((r for r in results if r.get("id") == "alertas_mapbiomas"), {})
        n_alertas  = alerta_res.get("records", 0) or 0
        msg        = alerta_res.get("message", "")
        n_mun = 0
        if "municípios" in msg:
            try:
                n_mun = int(msg.split("municípios")[0].split("|")[-1].strip().split()[0])
            except Exception:
                pass

        warnings = [r for r in results if r.get("status") == "warning"]
        errors   = [r for r in results if r.get("status") == "error"]

        resumo_modulos = "\n".join(
            f"{'✅' if r.get('status')=='ok' else '⚠️' if r.get('status')=='warning' else '🚨'} "
            f"{r.get('id','?')}: {r.get('message','')[:80]}  [{r.get('elapsed','?')}]"
            for r in results
        )
        avisos_texto = "\n".join(
            f"⚠️ {r['id']}: {r.get('message','')}" for r in warnings
        ) or "Nenhum"
        erros_texto = "\n".join(
            f"🚨 {r['id']}: {r.get('message','')}" for r in errors
        ) or "Nenhum"

        linhas = [
            f"PIPELINE_STATUS={status}",
            f"PIPELINE_N_ALERTAS={n_alertas}",
            f"PIPELINE_N_MUN={n_mun}",
            f"PIPELINE_DURACAO={duracao_s}",
            f"PIPELINE_RESUMO_MODULOS<<EOF\n{resumo_modulos}\nEOF",
            f"PIPELINE_AVISOS<<EOF\n{avisos_texto}\nEOF",
            f"PIPELINE_ERROS<<EOF\n{erros_texto}\nEOF",
        ]
        with open(github_env, "a", encoding="utf-8") as f:
            f.write("\n".join(linhas) + "\n")
        log.info("Orchestrator: variáveis CI exportadas para GITHUB_ENV")
    except Exception as exc:
        log.warning("Orchestrator: falha ao exportar GITHUB_ENV — %s", exc)


def run_one(module_id: str, config: dict | None = None,
            modules_dir: str | Path = "modules") -> dict:
    """
    Executa um único módulo pelo ID.

    Returns:
        {"id": str, "status": str, "records": int, "message": str, "elapsed": str}
    """
    cfg = config or {}
    registry = ModuleRegistry(modules_dir)
    registry.discover()

    t0 = time.time()
    log.info("▶ [%s] iniciando (modo unitário)...", module_id)
    try:
        result = registry.run(module_id, cfg)
        elapsed = f"{(time.time() - t0):.1f}s"
        result.setdefault("id", module_id)
        result.setdefault("elapsed", elapsed)
        log.info("✓ [%s] concluído em %s", module_id, elapsed)
    except Exception as exc:
        elapsed = f"{(time.time() - t0):.1f}s"
        result = {"id": module_id, "status": "error", "records": 0,
                  "message": str(exc), "elapsed": elapsed}
        log.error("✗ [%s] erro: %s", module_id, exc)
    return result


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    # Sentry inicializado antes de qualquer execução — captura erros do pipeline.
    sentry_ativo = _init_sentry()
    if sentry_ativo:
        log.info("Sentry: monitoramento de erros ativo.")

    parser = argparse.ArgumentParser(description="Plataforma Modular — SEMARH-PI")
    parser.add_argument("--module", help="ID do módulo a executar (padrão: todos)")
    parser.add_argument("--dry-run", action="store_true", help="Processar sem fazer upload")
    parser.add_argument("--skip-download", action="store_true", help="Reutilizar arquivos já baixados")
    parser.add_argument("--ano", type=int, help="Restringir ao ano específico")
    args = parser.parse_args()

    cfg = {"dry_run": args.dry_run, "skip_download": args.skip_download}
    if args.ano:
        cfg["ano"] = args.ano

    if args.module:
        run_one(args.module, cfg)
    else:
        run_all(cfg)
