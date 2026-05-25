"""modules/deradsa_semarh/manifest.py — Contrato do módulo DERADSAs SEMARH."""
from __future__ import annotations

import logging

from core.constants import ANOS_DERADSA

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "deradsa_semarh",
    "name":        "DERADSAs SEMARH",
    "version":     "1.0.0",
    "description": "Download de Decisões de Regularização Ambiental (SEMARH-PI) do Supabase Storage.",
    "icon":        "📋",
    "frontend_module": "deradsa_semarh",
    "tags":        ["deradsa", "regularizacao", "semarh"],
    "schedule":    None,  # manual — upload feito pelo usuário via frontend
    "priority":    2,
    "enabled":     True,
    "outputs":     ["deradsa_semarh"],
}


def run(config: dict) -> dict:
    from .downloader import main as download_main
    from .processor import load_all
    from core.uploader import upload_geodataframe
    import sys

    dry_run = config.get("dry_run", False)
    anos = list(ANOS_DERADSA)

    log.info("  [deradsa_semarh] Baixando anos: %s", anos)
    # Redireciona sys.argv para passar --anos ao download_main
    _argv_orig = sys.argv
    sys.argv = ["downloader", "--anos"] + [str(a) for a in anos]
    try:
        download_main()
    except SystemExit:
        pass
    finally:
        sys.argv = _argv_orig

    gdfs = load_all()
    n_total = sum(len(g) for g in gdfs.values())
    log.info("  [deradsa_semarh] Total: %d polígonos em %d anos", n_total, len(gdfs))

    if not dry_run and n_total > 0:
        for ano_val, gdf in gdfs.items():
            if not gdf.empty:
                # Renomear colunas para corresponder ao schema Supabase (tabela: deradsa)
                rename_map = {
                    "Id":          "id_deradsa",
                    "Município":   "municipio",
                    "Área/ha":     "area_ha",
                    "�rea/ha": "area_ha",   # fallback para encoding corrompido
                    "Ano":         "ano",
                }
                gdf_up = gdf.rename(columns={k: v for k, v in rename_map.items()
                                             if k in gdf.columns})
                # Garantir colunas obrigatórias
                if "ano" not in gdf_up.columns:
                    gdf_up = gdf_up.copy()
                    gdf_up["ano"] = int(ano_val)
                keep = [c for c in ["id_deradsa", "municipio", "area_ha", "ano"]
                        if c in gdf_up.columns]
                gdf_up = gdf_up[keep + [gdf_up.geometry.name]]
                upload_geodataframe(
                    gdf_up, table="deradsa",
                    if_exists="upsert",
                    conflict_col="id_deradsa,ano",
                )
        log.info("  [deradsa_semarh] Upload concluído → tabela deradsa")

    return {"status": "ok", "records": n_total, "message": f"{n_total} DERADSAs em {anos}"}
