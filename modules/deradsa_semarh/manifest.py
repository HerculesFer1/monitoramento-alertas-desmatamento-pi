"""modules/deradsa_semarh/manifest.py — Contrato do módulo DERADSAs SEMARH."""
from __future__ import annotations

import logging

from core.constants import ANOS_DERADSA

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "deradsa_semarh",
    "name":        "DERADSAs SEMARH",
    "version":     "1.1.0",
    "description": "Download de Decisões de Regularização Ambiental (SEMARH-PI) do Supabase Storage.",
    "icon":        "📋",
    "frontend_module": "deradsa_semarh",
    "tags":        ["deradsa", "regularizacao", "semarh"],
    "schedule":    None,  # manual — upload feito pelo usuário via frontend
    "priority":    2,
    "enabled":     True,
    "outputs":     ["deradsa"],
}


def run(config: dict) -> dict:
    from .downloader import download as dl_download
    from .processor import load_all
    from core.uploader import upload_geodataframe

    dry_run = config.get("dry_run", False)
    anos = list(ANOS_DERADSA)

    log.info("  [deradsa_semarh] Baixando anos: %s", anos)
    try:
        resultados = dl_download(anos=anos)
        anos_ok   = [a for a, ok in resultados.items() if ok]
        anos_fail = [a for a, ok in resultados.items() if not ok]
        if anos_fail:
            log.warning("  [deradsa_semarh] Anos sem dados: %s", anos_fail)
        if not anos_ok:
            return {
                "status":  "warning",
                "records": 0,
                "message": (
                    f"Nenhum dado DERADSA disponível para {anos} "
                    "(Storage e tabela indisponíveis)"
                ),
            }
    except RuntimeError as exc:
        return {"status": "error", "records": 0, "message": f"Download DERADSA falhou: {exc}"}

    gdfs = load_all()
    n_total = sum(len(g) for g in gdfs.values())
    log.info("  [deradsa_semarh] Total: %d polígonos em %d anos", n_total, len(gdfs))

    if not dry_run and n_total > 0:
        for ano_val, gdf in gdfs.items():
            if gdf.empty:
                continue

            # Renomear colunas para corresponder ao schema Supabase (tabela: deradsa).
            # Inclui variantes de encoding: UTF-8 correto, sem acento e replacement char
            # (o replacement char U+FFFD aparece quando o arquivo foi salvo com encoding errado).
            rename_map: dict[str, str] = {
                "Id":        "id_deradsa",
                "Município": "municipio",
                "Área/ha":   "area_ha",   # UTF-8 correto
                "Area/ha":   "area_ha",   # sem acento
                "Ano":       "ano",
            }
            # Variante com replacement character (detectada dinamicamente para evitar
            # problemas de encoding no código-fonte):
            for col in gdf.columns:
                if col.endswith("rea/ha") and col != "area_ha":
                    rename_map[col] = "area_ha"

            gdf_up = gdf.rename(columns={k: v for k, v in rename_map.items()
                                         if k in gdf.columns})

            # Garantir coluna 'ano' (pode não existir se o arquivo não tiver esse campo)
            if "ano" not in gdf_up.columns:
                gdf_up = gdf_up.copy()
                gdf_up["ano"] = int(ano_val)

            keep = [c for c in ["id_deradsa", "municipio", "area_ha", "ano"]
                    if c in gdf_up.columns]

            # Geometry: proteger contra GDF sem coluna de geometria definida
            geom_col = gdf_up.geometry.name if gdf_up._geometry_column_name else None
            cols_upload = keep + ([geom_col] if geom_col else [])
            gdf_up = gdf_up[cols_upload]

            upload_geodataframe(
                gdf_up, table="deradsa",
                if_exists="upsert",
                conflict_col="id_deradsa,ano",
            )
        log.info("  [deradsa_semarh] Upload concluído → tabela deradsa")

    return {"status": "ok", "records": n_total, "message": f"{n_total} DERADSAs em {anos}"}
