"""
Template de processor.
Substitua pela lógica real de transformação e upload do módulo.
"""
from __future__ import annotations

from pathlib import Path


def process(raw_path: Path, config: dict) -> dict:
    """
    Transforma dados brutos em resultado analítico e faz upload para o Supabase.

    Padrão:
        gdf = gpd.read_file(raw_path)
        gdf = fix_geometry(gdf)          # platform.spatial_core
        gdf = reproject(gdf, "EPSG:5880")
        # ... lógica do módulo ...
        upload_geodataframe(gdf, table="<nome_tabela>")  # platform.uploader

    Args:
        raw_path: arquivo baixado pelo downloader
        config:   dict com opções (dry_run, ano, verbose)

    Returns:
        {"status": "ok"|"error", "records": int, "message": str}
    """
    raise NotImplementedError(
        "Implemente o processamento dos dados.\n"
        "Use platform.spatial_core para operações geoespaciais.\n"
        "Use platform.uploader para enviar para o Supabase."
    )
