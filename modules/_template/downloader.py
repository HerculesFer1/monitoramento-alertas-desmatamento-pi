"""
Template de downloader.
Substitua pela lógica real de download do módulo.
"""
from __future__ import annotations

from pathlib import Path


def download(dest_dir: Path, config: dict) -> Path:
    """
    Baixa os dados brutos e salva em dest_dir.

    Args:
        dest_dir: diretório de destino (ex: data/raw/<nome>/)
        config:   dict com opções do módulo (ano, verbose, etc.)

    Returns:
        Path para o arquivo baixado (GeoJSON, shapefile, etc.)
    """
    raise NotImplementedError(
        "Implemente o download dos dados.\n"
        "Use requests.get() para HTTP/REST/GraphQL.\n"
        "Salve em dest_dir e retorne o Path do arquivo."
    )
