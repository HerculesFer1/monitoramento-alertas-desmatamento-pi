"""
downloader.py — Módulo queimadas_bdq
Download mensal das cicatrizes AQ1km V6 (Coleção 2) do BD Queimadas INPE.

Fonte:
  http://dataserver-coids.inpe.br/queimadas/queimadas/area_queimada/colecao2/shp/

Nomenclatura dos arquivos:
  {YYYY}_{MM:02d}_01_aq1km_V6.zip  (12 arquivos por ano, 1 por mês)

Segue padrão do _template/downloader.py:
  download(raw_dir, ano, skip, verbose) → lista de Path (SHPs extraídos)
"""
from __future__ import annotations

import logging
import zipfile
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)

_BASE_URL     = (
    "http://dataserver-coids.inpe.br/queimadas/queimadas/"
    "area_queimada/colecao2/shp/"
)
_TIMEOUT_S    = 300
_CHUNK_BYTES  = 16_384
_MESES        = list(range(1, 13))   # Jan..Dez

# Campos obrigatórios em qualquer shapefile AQ1km válido
_REQUIRED_SHP_EXTS = {".shp", ".dbf", ".shx"}


def _make_session() -> requests.Session:
    """Sessão com retry exponencial para downloads do INPE (servidor instável)."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.0,         # 1s, 2s, 4s entre tentativas
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    session.mount("http://",  HTTPAdapter(max_retries=retry))
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


_SESSION = _make_session()


def download(
    raw_dir: Path,
    ano:     int  = 2025,
    skip:    bool = False,
    verbose: bool = False,
) -> list[Path]:
    """
    Baixa e extrai os 12 ZIPs mensais AQ1km para raw_dir.

    Parâmetros:
        raw_dir : destino dos arquivos (ex.: C:/11. REDD+/Focos de Queimadas/raw/2025)
        ano     : ano a baixar (default 2025)
        skip    : se True, reutiliza arquivos já existentes sem baixar novamente
        verbose : log detalhado

    Retorna lista de Path apontando para cada SHP mensal extraído.
    Meses ausentes no servidor são ignorados com aviso.
    """
    raw_dir = Path(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    shp_paths: list[Path] = []

    for mes in _MESES:
        shp = _shp_path_for(raw_dir, ano, mes)

        if skip and shp.exists():
            log.info("Mês %02d/%d já existe localmente — reutilizando.", mes, ano)
            shp_paths.append(shp)
            continue

        zip_name = f"{ano}_{mes:02d}_01_aq1km_V6.zip"
        url      = _BASE_URL + zip_name
        zip_path = raw_dir / zip_name

        try:
            log.info("Baixando %s ...", zip_name)
            _stream_download(url, zip_path, verbose=verbose)
            extracted = _extract_shp(zip_path, raw_dir, ano, mes)
            if extracted:
                shp_paths.append(extracted)
            zip_path.unlink(missing_ok=True)

        except requests.HTTPError as exc:
            log.warning("Mês %02d/%d não disponível no servidor: %s", mes, ano, exc)
            zip_path.unlink(missing_ok=True)
        except Exception as exc:
            log.error("Erro ao baixar mês %02d/%d: %s", mes, ano, exc)
            zip_path.unlink(missing_ok=True)

    if not shp_paths:
        raise RuntimeError(
            f"Nenhum SHP baixado para o ano {ano}. "
            "Verifique conectividade com dataserver-coids.inpe.br."
        )

    log.info(
        "Download concluído: %d/%d meses disponíveis para %d.",
        len(shp_paths), len(_MESES), ano,
    )
    return shp_paths


# ── Extração ──────────────────────────────────────────────────────────────────

def _extract_shp(
    zip_path: Path,
    dest_dir: Path,
    ano:      int,
    mes:      int,
) -> Path | None:
    """Extrai todos os arquivos do ZIP e retorna o path do .shp encontrado."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        members_lower = {Path(m).suffix.lower() for m in zf.namelist()}

        # Valida completude do shapefile antes de extrair (achado A2 da auditoria).
        missing = _REQUIRED_SHP_EXTS - members_lower
        if missing:
            log.warning(
                "ZIP %s incompleto — faltam: %s. Mês ignorado.",
                zip_path.name, missing,
            )
            return None

        # Extrair todos os arquivos do shapefile (.shp/.dbf/.shx/.prj/.cpg)
        for member in zf.namelist():
            # Renomear para padrão interno: aqXXXX_MM.{ext}
            ext  = Path(member).suffix.lower()
            if ext in {".shp", ".dbf", ".shx", ".prj", ".cpg", ".sbn", ".sbx"}:
                target = dest_dir / f"aq{ano}_{mes:02d}{ext}"
                with zf.open(member) as src, open(target, "wb") as dst:
                    dst.write(src.read())

    canonical = dest_dir / f"aq{ano}_{mes:02d}.shp"
    if canonical.exists():
        log.info("Extraído: %s (mês=%02d)", canonical.name, mes)
        return canonical

    # Fallback: primeiro .shp encontrado no diretório
    candidates = list(dest_dir.glob(f"*{ano}*{mes:02d}*.shp"))
    if candidates:
        return candidates[0]

    log.warning("SHP não localizado após extração do ZIP mês %02d.", mes)
    return None


def _shp_path_for(raw_dir: Path, ano: int, mes: int) -> Path:
    """Caminho canônico do SHP mensal."""
    return raw_dir / f"aq{ano}_{mes:02d}.shp"


# ── HTTP ──────────────────────────────────────────────────────────────────────

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
                    log.info(
                        "  %s: %.1f%%", dest.name, downloaded / total * 100
                    )
    log.info(
        "Download OK: %s (%.1f KB)", dest.name, dest.stat().st_size / 1024
    )
