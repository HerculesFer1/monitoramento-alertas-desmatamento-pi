"""
tests/conftest.py — configuração específica de testes geoespaciais.

Quando rodando em ambientes que sobrescrevem PROJ_LIB/GDAL_DATA
(comum em Windows + Miniconda), pyproj/geopandas podem falhar ao
encontrar os arquivos de grade do CRS.

Esta camada é DEFENSIVA — só executa se as env vars não estiverem
definidas e tenta detectar o ambiente conda ativo. Caminhos absolutos
hardcoded foram removidos (auditoria 2026-06-03 — portabilidade).

Para forçar paths específicos, defina antes de rodar pytest:
    PROJ_LIB=/path/to/proj
    GDAL_DATA=/path/to/gdal
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Garante que a raiz do repo esteja em sys.path (redundante com conftest.py raiz,
# mas seguro caso pytest seja invocado direto de tests/).
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _detect_conda_share_dir(subdir: str) -> Path | None:
    """Tenta localizar PROJ/GDAL no ambiente conda ativo."""
    conda_prefix = os.environ.get("CONDA_PREFIX")
    if not conda_prefix:
        return None
    candidate = Path(conda_prefix) / "Library" / "share" / subdir   # Windows
    if candidate.exists():
        return candidate
    candidate = Path(conda_prefix) / "share" / subdir               # Linux/macOS
    if candidate.exists():
        return candidate
    return None


# Só age se a env var ainda não estiver definida — não sobrescreve usuário.
if "PROJ_LIB" not in os.environ:
    _proj = _detect_conda_share_dir("proj")
    if _proj is not None:
        os.environ["PROJ_LIB"] = str(_proj)
        try:
            import pyproj.datadir
            pyproj.datadir.set_data_dir(str(_proj))
        except Exception:
            pass

if "GDAL_DATA" not in os.environ:
    _gdal = _detect_conda_share_dir("gdal")
    if _gdal is not None:
        os.environ["GDAL_DATA"] = str(_gdal)
