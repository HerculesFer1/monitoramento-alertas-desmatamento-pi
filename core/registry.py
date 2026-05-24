"""
platform/registry.py — Descoberta e carregamento de módulos de análise.

O registry varre modules/*/manifest.py, carrega MODULE_MANIFEST e run(),
ignora módulos com enabled=False e pastas que começam com _.
"""
from __future__ import annotations

import importlib
import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class ModuleRegistry:
    """Descobre e mantém o catálogo de módulos de análise disponíveis."""

    def __init__(self, modules_dir: str | Path = "modules") -> None:
        self._root = Path(modules_dir)
        self._modules: dict[str, dict[str, Any]] = {}

    # ── API pública ───────────────────────────────────────────────────────

    def discover(self) -> "ModuleRegistry":
        """Varre modules_dir e carrega todos os módulos habilitados."""
        self._modules.clear()

        if not self._root.exists():
            log.warning("Diretório de módulos não encontrado: %s", self._root)
            return self

        for manifest_path in sorted(self._root.glob("*/manifest.py")):
            folder = manifest_path.parent.name
            if folder.startswith("_"):
                continue  # _template e pastas internas

            try:
                module = self._load_manifest(folder, manifest_path)
                if module is None:
                    continue
                mod_id = module["manifest"]["id"]
                self._modules[mod_id] = module
                log.debug("Módulo carregado: %s v%s", mod_id, module["manifest"]["version"])
            except Exception as exc:
                log.error("Erro ao carregar módulo '%s': %s", folder, exc)

        log.info("Registry: %d módulo(s) habilitado(s)", len(self._modules))
        return self

    def list(self) -> list[dict[str, Any]]:
        """Retorna lista de manifestos ordenada por prioridade."""
        return sorted(
            [m["manifest"] for m in self._modules.values()],
            key=lambda m: m.get("priority", 50),
        )

    def get(self, module_id: str) -> dict[str, Any]:
        """Retorna o módulo pelo id. Lança KeyError se não encontrado."""
        if module_id not in self._modules:
            raise KeyError(f"Módulo '{module_id}' não encontrado no registry.")
        return self._modules[module_id]

    def run(self, module_id: str, config: dict) -> dict:
        """Executa run() do módulo pelo id."""
        entry = self.get(module_id)
        return entry["run"](config)

    def export_json(self, dest: str | Path) -> Path:
        """Exporta o registry como JSON para consumo do frontend."""
        dest = Path(dest)
        payload = [
            {
                "id":              m.get("id"),
                "name":            m.get("name"),
                "icon":            m.get("icon", "📊"),
                "frontend_module": m.get("frontend_module", m.get("id")),
                "enabled":         m.get("enabled", True),
                "tags":            m.get("tags", []),
            }
            for m in self.list()
        ]
        dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        log.info("module-registry.json exportado: %d módulos → %s", len(payload), dest)
        return dest

    # ── Internos ──────────────────────────────────────────────────────────

    def _load_manifest(self, folder: str, manifest_path: Path) -> dict | None:
        """Importa manifest.py do módulo e valida campos obrigatórios."""
        dotted = f"modules.{folder}.manifest"
        spec = importlib.util.spec_from_file_location(dotted, manifest_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        manifest: dict = getattr(mod, "MODULE_MANIFEST", None)
        run_fn = getattr(mod, "run", None)

        if manifest is None:
            log.warning("  [%s] MODULE_MANIFEST não encontrado — ignorado", folder)
            return None

        if not manifest.get("enabled", True):
            log.debug("  [%s] disabled — ignorado", folder)
            return None

        required = ("id", "name", "version", "description", "outputs")
        missing = [f for f in required if not manifest.get(f)]
        if missing:
            log.error("  [%s] campos obrigatórios ausentes: %s — ignorado", folder, missing)
            return None

        if run_fn is None:
            log.error("  [%s] run() não definido — ignorado", folder)
            return None

        return {"manifest": manifest, "run": run_fn}
