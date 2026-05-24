"""modules/alertas_mapbiomas/manifest.py — Contrato do módulo Alertas MapBiomas."""
from __future__ import annotations

import json
import logging
import shutil
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning, module="geopandas")
warnings.filterwarnings("ignore", category=RuntimeWarning, module="shapely")

_ROOT = Path(__file__).resolve().parent.parent.parent
_OUT_DIR = _ROOT / "data" / "output"

log = logging.getLogger(__name__)

MODULE_MANIFEST = {
    "id":          "alertas_mapbiomas",
    "name":        "Alertas MapBiomas",
    "version":     "2.0.0",
    "description": "Pipeline completo: download, classificação em 4 classes e agregação municipal.",
    "icon":        "🌿",
    "frontend_module": "alertas_mapbiomas",
    "tags":        ["alertas", "mapbiomas", "classificacao", "desmatamento"],
    "schedule":    "0 3 1 * *",  # mensal — 1º de cada mês às 3h UTC
    "priority":    10,
    "enabled":     True,
    "outputs":     ["alertas_classificados", "agregado_municipios"],
}


def run(config: dict) -> dict:
    """
    Pipeline completo de classificação de alertas MapBiomas.

    Etapas: download → leitura → reprojeção → parse → classificação →
            indicadores → testes T1-T9 → agregação → exportação → upload.
    """
    import geopandas as gpd

    from core.constants import ANOS, ANOS_DERADSA, CRS_CALC, CRS_OUT, M2_HA, export_json
    from core.spatial_core import fix_geoms
    from core.uploader import upload_geodataframe, upload_json

    from .classify import AlertClassifier
    from .processor import build_asv_base, parse_alertas, parse_asvs, parse_deradsa
    from .readers import LocalGeoJSONReader
    from .validator import run_prodes_validation
    from .indicators import apply_indicators
    from .quality import run_all_tests
    from .aggregator import aggregate_monthly, aggregate_municipal, aggregate_resumo_estatico

    dry_run = config.get("dry_run", False)
    ano_filter = config.get("ano")
    anos = (ano_filter,) if ano_filter else ANOS

    t0 = time.time()
    _OUT_DIR.mkdir(exist_ok=True)

    # ── 1. DOWNLOAD ──────────────────────────────────────────────────────────
    if not config.get("skip_download", False):
        log.info("  Etapa 1: Download MapBiomas")
        from .downloader import main as dl_main
        _argv = sys.argv
        sys.argv = ["downloader"]
        try:
            dl_main()
        except SystemExit:
            pass
        finally:
            sys.argv = _argv

    # ── 2. LEITURA ───────────────────────────────────────────────────────────
    log.info("  Etapa 2: Leitura dos dados")
    data_dir = _ROOT / "data" / "raw"
    reader = LocalGeoJSONReader(data_dir)
    gdf_al    = reader.read_alertas()
    gdf_asv   = reader.read_asvs()
    gdf_der24 = reader.read_deradsa(2024)
    gdf_der25 = reader.read_deradsa(2025)
    gdf_prodes = reader.read_prodes()

    # Filtro temporal
    n_antes = len(gdf_al)
    gdf_al = gdf_al[gdf_al["ANODETEC"].isin([float(y) for y in anos])].copy()
    gdf_al["ANODETEC"] = gdf_al["ANODETEC"].astype(int)
    log.info("  Filtro temporal: %d → %d alertas (anos: %s)", n_antes, len(gdf_al), list(anos))

    # ── 3. REPROJEÇÃO ────────────────────────────────────────────────────────
    log.info("  Etapa 3: Reprojeção → %s", CRS_CALC)
    gdf_al    = fix_geoms(gdf_al.to_crs(CRS_CALC),    "alertas")
    gdf_asv   = fix_geoms(gdf_asv.to_crs(CRS_CALC),   "asvs")
    gdf_der24 = fix_geoms(gdf_der24.to_crs(CRS_CALC), "der24") if not gdf_der24.empty else gdf_der24
    gdf_der25 = fix_geoms(gdf_der25.to_crs(CRS_CALC), "der25") if not gdf_der25.empty else gdf_der25
    if gdf_prodes is not None:
        gdf_prodes = fix_geoms(gdf_prodes.to_crs(CRS_CALC), "prodes")

    # ── 4. PARSE + VALIDAÇÃO PRODES ──────────────────────────────────────────
    log.info("  Etapa 4: Parse de campos")
    gdf_al              = parse_alertas(gdf_al)
    gdf_asv, asv_id_col = parse_asvs(gdf_asv)
    _, _, der_id_col    = parse_deradsa(gdf_der24, gdf_der25)
    asv_base            = build_asv_base(gdf_asv)

    log.info("  Etapa 4-B: Validação cruzada PRODES-Cerrado")
    gdf_al = run_prodes_validation(gdf_al, gdf_prodes)

    # ── 5. FRAGMENTAÇÃO ──────────────────────────────────────────────────────
    log.info("  Etapa 5: Fragmentação espacial")
    classifier = AlertClassifier(anos=anos, anos_deradsa=ANOS_DERADSA)
    all_frags = classifier.classify(
        gdf_al, asv_base, asv_id_col,
        {2024: gdf_der24, 2025: gdf_der25},
        der_id_col,
    )
    if not all_frags:
        return {"status": "error", "records": 0,
                "message": "Nenhum fragmento gerado — verifique os dados de entrada"}

    # ── 6. CONSOLIDAÇÃO ──────────────────────────────────────────────────────
    log.info("  Etapa 6: Consolidação + áreas")
    gdf_out = gpd.GeoDataFrame(all_frags, geometry="geometry", crs=CRS_CALC)
    gdf_out.drop(
        columns=[c for c in ["_area_m2_orig", "_det_norm", "_dti", "_dtf", "_status_valido"]
                 if c in gdf_out.columns],
        inplace=True, errors="ignore",
    )
    gdf_out = fix_geoms(gdf_out, "output")
    gdf_out["area_ha"] = (gdf_out.geometry.area / M2_HA).round(4)
    if "AREAHA" in gdf_out.columns:
        gdf_out = gdf_out.rename(columns={"AREAHA": "area_original_ha"})
    else:
        gdf_out["area_original_ha"] = None

    # ── 7. INDICADORES ───────────────────────────────────────────────────────
    log.info("  Etapa 7: Indicadores")
    gdf_out = apply_indicators(gdf_out)

    # ── 8. TESTES T1-T9 ──────────────────────────────────────────────────────
    log.info("  Etapa 8: Testes T1-T9")
    report = run_all_tests(gdf_out, anos, ANOS_DERADSA)
    if not report.all_passed:
        log.warning("  %d teste(s) falharam — corrija antes do uso institucional",
                    report.n_total - report.n_passed)

    # ── 9. AGREGAÇÃO ─────────────────────────────────────────────────────────
    log.info("  Etapa 9: Agregação municipal")
    agg_rows = aggregate_municipal(gdf_out)
    monthly  = aggregate_monthly(gdf_out)
    resumo   = aggregate_resumo_estatico(gdf_out)

    _dump_json(agg_rows, _OUT_DIR / "agregado_municipios.json")
    _dump_json(monthly,  _OUT_DIR / "monthly_alertas.json")
    _dump_json(resumo,   _OUT_DIR / "resumo_estatico.json")

    _frontend = _ROOT / "frontend" / "public" / "data"
    _frontend.mkdir(parents=True, exist_ok=True)
    for fname in ["monthly_alertas.json", "resumo_estatico.json"]:
        shutil.copy2(_OUT_DIR / fname, _frontend / fname)

    # ── 10. EXPORTAÇÃO ───────────────────────────────────────────────────────
    log.info("  Etapa 10: Exportação GeoJSON")
    gdf_out = _export(gdf_out, _OUT_DIR / "alertas_classificados.geojson", CRS_OUT, fix_geoms)
    export_json()

    n = len(gdf_out)
    log.info("  %d fragmentos | %d municípios | testes %d/%d | %.0fs",
             n, len(agg_rows), report.n_passed, report.n_total, time.time() - t0)

    # ── 11. UPLOAD ───────────────────────────────────────────────────────────
    if not dry_run:
        log.info("  Etapa 11: Upload Supabase")
        upload_geodataframe(gdf_out, table="alertas_classificados", if_exists="upsert")
        upload_json(agg_rows, table="agregado_municipios", if_exists="upsert")

    return {
        "status":  "ok",
        "records": n,
        "message": (
            f"{n} fragmentos | {len(agg_rows)} municípios | "
            f"testes {report.n_passed}/{report.n_total}"
        ),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _export(gdf_out, out_path: Path, crs_out: str, fix_geoms_fn) -> "gpd.GeoDataFrame":
    import pandas as pd
    gdf_out = gdf_out.to_crs(crs_out)
    gdf_out.geometry = gdf_out.geometry.simplify(tolerance=0.0001, preserve_topology=True)
    gdf_out = fix_geoms_fn(gdf_out, "final")
    gdf_out["fonte_list"] = gdf_out["fonte_list"].apply(
        lambda x: json.dumps(x if isinstance(x, list) else [])
    )
    gdf_out["datadetec"] = gdf_out["datadetec"].apply(
        lambda x: str(x.date()) if pd.notna(x) and hasattr(x, "date") else
                  str(x) if pd.notna(x) else None
    )
    for bc in ["matopiba", "reincidente"]:
        if bc in gdf_out.columns:
            gdf_out[bc] = gdf_out[bc].apply(lambda v: bool(v) if pd.notna(v) else False)
    gdf_out.to_file(out_path, driver="GeoJSON")
    sz_mb = out_path.stat().st_size / (1024 * 1024)
    log.info("  → %s: %d features, %.1f MB", out_path.name, len(gdf_out), sz_mb)
    return gdf_out


def _dump_json(data, path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    log.info("  → %s", path.name)
