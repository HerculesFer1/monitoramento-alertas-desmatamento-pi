"""
core/config.py — Resolução central de paths e configurações externas.

Achado A5 da auditoria GIS 2026-06-02.

Antes desta camada, módulos como `queimadas_bdq` e `areas_prioritarias`
hardcoded `Path("C:/11. REDD+/...")` direto no código. Resultado: o
módulo só rodava no computador do CGEO/SEMARH-PI e era bloqueado em
CI Linux, Docker e qualquer ambiente colaborativo.

Esta camada lê uma variável de ambiente única — `REDD_DATA_ROOT` —
do `.env` na raiz do repositório e oferece helpers tipados para
cada artefato externo do projeto (rasters, GPKGs, diretórios de
download). Mantém retro: se a variável não estiver definida, faz
fallback para o caminho histórico do CGEO.

Variáveis de ambiente reconhecidas:
    REDD_DATA_ROOT          — raiz dos dados externos (default: C:/11. REDD+)
    REDD_CLASSES_GPKG       — sobrescreve o GPKG de classes AHP
    REDD_FOREST_MASK_TIF    — sobrescreve a máscara florestal 2025
    REDD_BIOMASS_DIR        — sobrescreve a pasta de rasters de biomassa
    REDD_QUEIMADAS_RAW_DIR  — sobrescreve a pasta de SHPs AQ1km baixados
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Final

from dotenv import load_dotenv

# ── Inicialização: carrega .env da raiz do repo uma única vez ─────────────
_REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")


def repo_root() -> Path:
    """Diretório raiz do repositório (onde `.env` e `infra/` vivem)."""
    return _REPO_ROOT


def data_root_external() -> Path:
    """Raiz dos dados externos (rasters, GPKGs, downloads).

    Default: `C:/11. REDD+` (caminho histórico CGEO/SEMARH-PI). Em CI ou
    outros ambientes, sobrescrever com `REDD_DATA_ROOT` no `.env`.
    """
    env_val = os.environ.get("REDD_DATA_ROOT", "").strip()
    return Path(env_val) if env_val else Path("C:/11. REDD+")


# ── Helpers específicos do projeto ─────────────────────────────────────────

def classes_prioritarias_gpkg() -> Path:
    """GPKG das 5 classes de prioridade AHP (REDD+ Piauí).

    Fonte: CGEO/SEMARH-PI — Programa Jurisdicional. Override via
    REDD_CLASSES_GPKG (caminho absoluto).
    """
    env_val = os.environ.get("REDD_CLASSES_GPKG", "").strip()
    if env_val:
        return Path(env_val)
    return data_root_external() / "16_prioridade_classes_final" / "classes_prioritarias.gpkg"


def forest_mask_tif() -> Path:
    """Máscara florestal 2025 (raster) usado no zonal_stats."""
    env_val = os.environ.get("REDD_FOREST_MASK_TIF", "").strip()
    if env_val:
        return Path(env_val)
    return (
        data_root_external() / "Forest_mask" / "Forest_mask" / "Mascara_de_floresta_2025.tif"
    )


def forest_mask_gpkg() -> Path:
    """Versão vetorizada da máscara florestal (display GIS only)."""
    return data_root_external() / "Forest_mask" / "floresta_2025.gpkg"


def biomass_rasters_dir() -> Path:
    """Diretório com rasters AGB/BGB/DW/Litter."""
    env_val = os.environ.get("REDD_BIOMASS_DIR", "").strip()
    if env_val:
        return Path(env_val)
    return data_root_external() / "Biomass_rasters" / "Biomass_rasters"


def queimadas_raw_dir() -> Path:
    """Diretório de SHPs AQ1km baixados (INPE BD Queimadas)."""
    env_val = os.environ.get("REDD_QUEIMADAS_RAW_DIR", "").strip()
    if env_val:
        return Path(env_val)
    return data_root_external() / "Focos de Queimadas" / "raw"


def areas_prioritarias_cache_dir() -> Path:
    """Cache interno do módulo areas_prioritarias dentro do repo."""
    return _REPO_ROOT / "data" / "raw" / "areas_prioritarias"
