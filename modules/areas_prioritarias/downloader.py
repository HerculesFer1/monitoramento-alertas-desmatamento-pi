"""
downloader.py — Módulo areas_prioritarias
Download de dados externos necessários para o pipeline.

Fontes externas:
  Municípios → IBGE FTP (malhas municipais 2022 — Piauí)

Nota: PRODES, classes de prioridade e rasters de biomassa são dados LOCAIS —
não são baixados aqui. Veja MANIFEST["local_data"] para os caminhos.

Segue padrão do _template/downloader.py:
  download(dest_dir, config) → municipios_path
"""
from __future__ import annotations

import logging
import zipfile
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)

# IBGE — Malhas municipais 2022 Piauí (GeoPackage)
_IBGE_MUNICIPIOS_URL = (
    "https://geoftp.ibge.gov.br/organizacao_do_territorio/"
    "malhas_territoriais/malhas_municipais/municipio_2022/UFs/PI/"
    "PI_Municipios_2022.zip"
)

_TIMEOUT_S   = 120   # segundos por requisição
_CHUNK_BYTES = 8_192


def download(
    dest_dir: Path,
    config:   dict[str, Any],
) -> Path:
    """
    Baixa municípios IBGE para dest_dir.

    Parâmetros:
        dest_dir : destino dos arquivos (data/raw/areas_prioritarias/)
        config   : dict com 'verbose' (bool)

    Retorna:
        municipios_path — Path do arquivo baixado/existente
    """
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    verbose = bool(config.get("verbose", False))

    return _download_municipios(dest_dir, verbose)


# ── Municípios IBGE ───────────────────────────────────────────────────────────

def _download_municipios(dest_dir: Path, verbose: bool) -> Path:
    gpkg_path = dest_dir / "municipios_piaui_ibge2022.gpkg"
    shp_path  = dest_dir / "PI_Municipios_2022.shp"
    zip_path  = dest_dir / "PI_Municipios_2022.zip"

    if gpkg_path.exists():
        log.info("Municípios IBGE já existem localmente: %s", gpkg_path.name)
        return gpkg_path

    if shp_path.exists():
        log.info("Municípios IBGE já existem localmente: %s", shp_path.name)
        return shp_path

    log.info("Baixando municípios IBGE 2022 — Piauí...")
    _stream_download(_IBGE_MUNICIPIOS_URL, zip_path, verbose=verbose)

    # Extrair .gpkg do zip
    with zipfile.ZipFile(zip_path, "r") as zf:
        gpkg_files = [f for f in zf.namelist() if f.endswith(".gpkg")]
        if not gpkg_files:
            shp_files = [f for f in zf.namelist() if f.endswith(".shp")]
            if not shp_files:
                raise FileNotFoundError(
                    "Nenhum .gpkg ou .shp encontrado no zip IBGE."
                )
            # Extrair shapefile completo
            zf.extractall(dest_dir)
            gpkg_path = dest_dir / shp_files[0]
        else:
            zf.extract(gpkg_files[0], dest_dir)
            extracted = dest_dir / gpkg_files[0]
            extracted.rename(gpkg_path)

    zip_path.unlink(missing_ok=True)
    log.info("Municípios IBGE extraídos: %s", gpkg_path.name)
    return gpkg_path


# ── Utilitários HTTP ──────────────────────────────────────────────────────────

def _stream_download(url: str, dest: Path, verbose: bool) -> None:
    """Download em stream para arquivos grandes."""
    with requests.get(url, stream=True, timeout=_TIMEOUT_S) as resp:
        resp.raise_for_status()
        total      = int(resp.headers.get("content-length", 0))
        downloaded = 0
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=_CHUNK_BYTES):
                f.write(chunk)
                downloaded += len(chunk)
                if verbose and total:
                    log.info("  Download: %.1f%%", downloaded / total * 100)
    log.info("Download concluído: %s (%.1f KB)", dest.name, dest.stat().st_size / 1024)
