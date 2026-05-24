"""
platform/orchestrator.py — Execução dos módulos registrados.

Substitui pipeline/__main__.py como dispatcher genérico.
Para executar o pipeline monolítico legado: python -m pipeline
Para executar via plataforma modular: python -m platform.orchestrator
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from core.registry import ModuleRegistry

log = logging.getLogger(__name__)

_ROOT = Path(__file__).parent.parent


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
    registry = ModuleRegistry(modules_dir)
    registry.discover()

    modules = registry.list()
    if not modules:
        log.warning("Nenhum módulo habilitado encontrado em '%s'.", modules_dir)
        return []

    log.info("Orchestrator: executando %d módulo(s)%s",
             len(modules), " [dry-run]" if cfg.get("dry_run") else "")

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

    ok = sum(1 for r in results if r.get("status") == "ok")
    log.info("Orchestrator: %d/%d módulos concluídos com sucesso.", ok, len(results))
    return results


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

    parser = argparse.ArgumentParser(description="Plataforma Modular — SEMARH-PI")
    parser.add_argument("--module", help="ID do módulo a executar (padrão: todos)")
    parser.add_argument("--dry-run", action="store_true", help="Processar sem fazer upload")
    parser.add_argument("--ano", type=int, help="Restringir ao ano específico")
    args = parser.parse_args()

    cfg = {"dry_run": args.dry_run}
    if args.ano:
        cfg["ano"] = args.ano

    if args.module:
        run_one(args.module, cfg)
    else:
        run_all(cfg)
