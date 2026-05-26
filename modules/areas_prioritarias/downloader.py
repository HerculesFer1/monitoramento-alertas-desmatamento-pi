"""
downloader.py — Módulo areas_prioritarias
Download de dados externos necessários para o pipeline.

Fontes:
  PRODES 2024 → API WFS TerraBrasilis (INPE)
  Municípios  → IBGE FTP (malhas municipais 2022 — Piauí)

Segue padrão do _template/downloader.py:
  download(dest_dir, config) → (prodes_path, municipios_path)
"""
from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)

# ── Configurações das fontes ──────────────────────────────────────────────────

# WFS TerraBrasilis — PRODES Cerrado (Piauí)
# Layer confirmado em inspeção real: prodes-cerrado-nb:yearly_deforestation
# Filtro: state = 'PIAUÍ' (valor exato com acento, inspecionado 2026-05-19)
_TERRABRASILIS_WFS_BASE  = "https://terrabrasilis.dpi.inpe.br/geoserver/prodes-cerrado-nb/ows"
_TERRABRASILIS_LAYER     = "prodes-cerrado-nb:yearly_deforestation"
_BBOX_PI                 = (-45.98, -11.80, -40.37, -2.75)

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
) -> tuple[Path, Path]:
    """
    Baixa PRODES e municípios IBGE para dest_dir.

    Parâmetros:
        dest_dir : destino dos arquivos (data/raw/areas_prioritarias/)
        config   : dict com 'ano' (int) e 'verbose' (bool)

    Retorna:
        (prodes_path, municipios_path) — Paths dos arquivos baixados
    """
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    ano     = int(config.get("ano", 2024))
    verbose = bool(config.get("verbose", False))

    prodes_path     = _download_prodes(dest_dir, ano, verbose)
    municipios_path = _download_municipios(dest_dir, verbose)

    return prodes_path, municipios_path


# ── PRODES ────────────────────────────────────────────────────────────────────

def _download_prodes(dest_dir: Path, ano: int, verbose: bool) -> Path:
    out_path = dest_dir / f"prodes_{ano}_piaui.geojson"

    if out_path.exists():
        log.info("PRODES já existe localmente: %s", out_path.name)
        return out_path

    log.info("Baixando PRODES %d — Piauí/Cerrado...", ano)

    # Estratégias em ordem de preferência (state com acento confirmado 2026-05-19)
    b = _BBOX_PI
    estrategias = [
        {"CQL_FILTER": f"state = 'PIAUÍ' AND year = {ano}"},
        {"CQL_FILTER": f"state = 'PIAUI' AND year = {ano}"},
        {"CQL_FILTER": f"BBOX(geometry,{b[0]},{b[1]},{b[2]},{b[3]}) AND year = {ano}"},
        {"bbox": f"{b[0]},{b[1]},{b[2]},{b[3]},EPSG:4326"},
    ]

    base_params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": _TERRABRASILIS_LAYER, "outputFormat": "application/json",
        "srsName": "EPSG:4326",
    }

    for estrategia in estrategias:
        params = {**base_params, **estrategia}
        try:
            if verbose:
                log.info("  WFS params: %s", {k: v for k, v in params.items() if k != 'service'})
            resp = requests.get(_TERRABRASILIS_WFS_BASE, params=params, timeout=_TIMEOUT_S)
            if resp.status_code != 200:
                log.warning("  HTTP %d — próxima estratégia", resp.status_code)
                continue
            if b"ExceptionReport" in resp.content[:1024]:
                log.warning("  WFS ExceptionReport — próxima estratégia")
                continue
            data = resp.json()
            features = data.get("features", [])
            if not features:
                log.warning("  0 feições — próxima estratégia")
                continue
            # Filtro cliente para estratégia bbox (sem filtro de ano na query)
            if "bbox" in estrategia:
                features = [f for f in features if f.get("properties", {}).get("year") == ano]
                data["features"] = features
                if not features:
                    log.warning("  0 feições após filtro de ano — próxima estratégia")
                    continue
            log.info("PRODES %d: %d feições baixadas", ano, len(features))
            out_path.write_text(json.dumps(data), encoding="utf-8")
            return out_path
        except requests.RequestException as exc:
            log.warning("  Falha de rede: %s — próxima estratégia", exc)

    raise RuntimeError(
        f"PRODES {ano} Piauí: todas as estratégias WFS falharam. "
        "Verificar disponibilidade da API TerraBrasilis."
    )


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

def _get_with_retry(url: str, verbose: bool, max_retries: int = 3) -> requests.Response:
    """GET com retry e backoff exponencial (padrão uploader.py do projeto)."""
    import time

    for attempt in range(1, max_retries + 1):
        try:
            if verbose:
                log.info("  GET %s (tentativa %d/%d)", url[:80], attempt, max_retries)
            resp = requests.get(url, timeout=_TIMEOUT_S)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            if attempt == max_retries:
                raise
            wait = 2 ** attempt
            log.warning("Falha na tentativa %d — aguardando %ds: %s", attempt, wait, exc)
            time.sleep(wait)

    raise RuntimeError("Não deve chegar aqui")


def _stream_download(url: str, dest: Path, verbose: bool) -> None:
    """Download em stream para arquivos grandes."""
    with requests.get(url, stream=True, timeout=_TIMEOUT_S) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=_CHUNK_BYTES):
                f.write(chunk)
                downloaded += len(chunk)
                if verbose and total:
                    pct = downloaded / total * 100
                    log.info("  Download: %.1f%%", pct)
    log.info("Download concluído: %s (%.1f KB)", dest.name, dest.stat().st_size / 1024)
