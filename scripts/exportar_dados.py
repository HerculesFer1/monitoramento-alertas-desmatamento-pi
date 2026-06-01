#!/usr/bin/env python3
"""
exportar_dados.py — Exportação geoespacial para ArcGIS/QGIS.

Exporta dados do dashboard REDD+ Piauí do Supabase para:
  - GeoPackage (.gpkg)  — multicamada, recomendado para QGIS/ArcGIS
  - Shapefile  (.shp)   — compatibilidade máxima (zipa automaticamente)
  - GeoJSON    (.geojson) — troca de dados web/Python
  - CSV        (.csv)   — tabelas sem geometria (ranking, resumo)

Uso:
    conda activate desmatamento
    $env:PYTHONUTF8 = "1"
    python scripts/exportar_dados.py --modulo alertas --formato gpkg --ano 2025
    python scripts/exportar_dados.py --modulo all     --formato gpkg
    python scripts/exportar_dados.py --modulo areas_prioritarias --formato shp --ano 2025

Argumentos:
    --modulo    alertas | areas_prioritarias | queimadas | all  (padrão: all)
    --formato   gpkg | shp | geojson | csv                      (padrão: gpkg)
    --ano       2022..2025 | all                                (padrão: all)
    --output    diretório de saída                              (padrão: data/exports/)
    --sem-geom  exportar apenas tabelas tabulares (sem geometry)

Requisitos:
    geopandas>=1.0, fiona>=1.10, supabase>=2.9, python-dotenv>=1.0
    pyogrio opcional (mais rápido para GPKG/SHP)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
from dotenv import load_dotenv

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

ROOT   = Path(__file__).parent.parent
OUTDIR = ROOT / "data" / "exports"

# Metadados para o DISCLAIMER.txt em cada export
_DISCLAIMER = """NOTA TÉCNICA — CGEO / SEMARH-PI
Programa Jurisdicional de REDD+ do Piauí

Este produto é uma ESTIMATIVA EXPLORATÓRIA gerada pela Plataforma de Monitoramento
de Alertas de Desmatamento. NÃO deve ser utilizado como dado para autuação ou
procedimentos administrativos sem validação institucional prévia.

Incerteza posicional MapBiomas Alerta: ±15 m.
CRS de cálculo: EPSG:5880 (SIRGAS 2000 / Brasil Policônico).
CRS de exportação: EPSG:4326 (WGS 84 geográfico).

Contato: CGEO — Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI
"""


# ── Supabase ──────────────────────────────────────────────────────────────────

def _get_client():
    load_dotenv(ROOT / ".env")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL e SUPABASE_SERVICE_KEY (ou ANON_KEY) devem estar no .env"
        )
    from supabase import create_client
    return create_client(url, key)


# ── Download helpers ──────────────────────────────────────────────────────────

def _rpc(sb, fn: str, params: dict) -> dict | list:
    resp = sb.rpc(fn, params).execute()
    if hasattr(resp, "error") and resp.error:
        raise RuntimeError(f"RPC {fn} erro: {resp.error}")
    return resp.data


def _table(sb, tbl: str, filters: dict | None = None, limit: int = 100_000) -> list[dict]:
    q = sb.table(tbl).select("*").limit(limit)
    for col, val in (filters or {}).items():
        q = q.eq(col, val)
    resp = q.execute()
    if hasattr(resp, "error") and resp.error:
        raise RuntimeError(f"Tabela {tbl} erro: {resp.error}")
    return resp.data or []


# ── Download por módulo ───────────────────────────────────────────────────────

def _download_alertas(sb, ano: str) -> dict[str, gpd.GeoDataFrame | pd.DataFrame]:
    log.info("Baixando módulo alertas_mapbiomas...")
    layers: dict[str, gpd.GeoDataFrame | pd.DataFrame] = {}

    # Alertas classificados (geometrias)
    ano_filter = None if ano == "all" else int(ano)
    geojson = _rpc(sb, "get_alertas_geojson", {
        "p_ano":   ano_filter,
        "p_limit": 100_000,
    })
    if geojson and geojson.get("features"):
        gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs=4326)
        layers["alertas_classificados"] = gdf
        log.info("  alertas_classificados: %d fragmentos", len(gdf))

    # Agregado municipal (tabular)
    filters = {} if ano == "all" else {"ano": int(ano)}
    rows = _table(sb, "agregado_municipios", filters)
    if rows:
        layers["agregado_municipios"] = pd.DataFrame(rows)
        log.info("  agregado_municipios: %d linhas", len(rows))

    return layers


def _download_areas_prioritarias(sb, ano: str) -> dict[str, gpd.GeoDataFrame | pd.DataFrame]:
    log.info("Baixando módulo areas_prioritarias...")
    layers: dict[str, gpd.GeoDataFrame | pd.DataFrame] = {}
    ano_param = 2025 if ano == "all" else int(ano)

    # Municípios resumo com geometria (GeoJSON via RPC completo)
    geojson = _rpc(sb, "get_ap_geojson", {"p_ano": ano_param, "p_cod": None})
    if geojson and geojson.get("features"):
        gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs=4326)
        layers["ap_municipios_resumo"] = gdf
        log.info("  ap_municipios_resumo: %d municípios", len(gdf))

    # Classes por município (tabular)
    rows = _table(sb, "ap_classes_municipio", {"ano_prodes": ano_param})
    if rows:
        layers["ap_classes_municipio"] = pd.DataFrame(rows)
        log.info("  ap_classes_municipio: %d registros", len(rows))

    # Ranking
    ranking = _rpc(sb, "get_ap_ranking", {
        "p_ano": ano_param, "p_orderby": "area_desmat_ha", "p_limit": 224,
    })
    if ranking:
        layers["ap_ranking"] = pd.DataFrame(ranking if isinstance(ranking, list) else [])
        log.info("  ap_ranking: %d municípios", len(layers["ap_ranking"]))

    return layers


def _download_queimadas(sb, ano: str) -> dict[str, gpd.GeoDataFrame | pd.DataFrame]:
    log.info("Baixando módulo queimadas_bdq...")
    layers: dict[str, gpd.GeoDataFrame | pd.DataFrame] = {}
    ano_param = 2025 if ano == "all" else int(ano)

    # Municípios resumo com geometria
    muns = _rpc(sb, "get_qb_municipios", {"p_ano": ano_param})
    if muns and isinstance(muns, list) and len(muns) > 0:
        records = muns
        feats = []
        for r in records:
            geom_raw = r.pop("geom", None)
            if geom_raw:
                import json as _json
                from shapely.geometry import shape
                geom = shape(_json.loads(geom_raw) if isinstance(geom_raw, str) else geom_raw)
                feats.append({**r, "geometry": geom})
            else:
                feats.append({**r, "geometry": None})
        if any(f["geometry"] is not None for f in feats):
            from shapely.geometry import shape as _shape  # noqa: F811
            gdf = gpd.GeoDataFrame(feats, crs=4326)
            layers["qb_municipios_resumo"] = gdf
            log.info("  qb_municipios_resumo: %d municípios", len(gdf))
        else:
            layers["qb_municipios_resumo"] = pd.DataFrame(feats)

    # Classes por mês (tabular)
    rows = _table(sb, "qb_cicatrizes_classes", {"ano": ano_param})
    if rows:
        layers["qb_cicatrizes_classes"] = pd.DataFrame(rows)
        log.info("  qb_cicatrizes_classes: %d registros", len(rows))

    if not muns or len(muns) == 0:
        log.warning("  Sem dados de queimadas para ano=%s. Execute o pipeline primeiro.", ano_param)

    return layers


# ── Exportadores ──────────────────────────────────────────────────────────────

def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_disclaimer(outdir: Path, modulo: str, ano: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    (outdir / "DISCLAIMER.txt").write_text(
        f"{_DISCLAIMER}\nMódulo: {modulo} | Ano: {ano} | Gerado em: {ts}\n",
        encoding="utf-8",
    )


def _write_metadata(outdir: Path, layers: dict, modulo: str, ano: str) -> None:
    meta = {
        "titulo":     f"REDD+ Piauí — {modulo}",
        "orgao":      "CGEO / SEMARH-PI",
        "ano_dados":  ano,
        "crs":        "EPSG:4326 (WGS 84)",
        "gerado_em":  datetime.now(timezone.utc).isoformat(),
        "camadas":    [
            {"nome": k, "n_registros": len(v), "tipo": "GeoDataFrame" if isinstance(v, gpd.GeoDataFrame) else "DataFrame"}
            for k, v in layers.items()
        ],
        "nota": "Estimativa exploratória — ver DISCLAIMER.txt",
    }
    (outdir / "metadata.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def export_gpkg(layers: dict, outdir: Path, stem: str) -> Path:
    path = outdir / f"{stem}.gpkg"
    n_geo = 0
    for name, data in layers.items():
        if isinstance(data, gpd.GeoDataFrame) and data.geometry.notna().any():
            data.to_file(str(path), layer=name, driver="GPKG")
            n_geo += 1
        elif isinstance(data, pd.DataFrame) and not data.empty:
            # Escreve tabelas sem geometria como atributo no GPKG
            import sqlite3
            conn = sqlite3.connect(str(path))
            data.to_sql(name, conn, if_exists="replace", index=False)
            conn.close()
    log.info("  GPKG: %s (%d camadas geoespaciais)", path.name, n_geo)
    return path


def export_shp(layers: dict, outdir: Path, stem: str) -> Path:
    shp_dir = outdir / stem
    shp_dir.mkdir(exist_ok=True)
    for name, data in layers.items():
        if isinstance(data, gpd.GeoDataFrame) and data.geometry.notna().any():
            # Trunca nomes de campo a 10 chars (limite DBF)
            gdf = data.copy()
            gdf.columns = [c[:10] for c in gdf.columns]
            gdf.to_file(str(shp_dir / f"{name[:10]}.shp"), driver="ESRI Shapefile")
        elif isinstance(data, pd.DataFrame) and not data.empty:
            data.to_csv(shp_dir / f"{name}.csv", index=False, encoding="utf-8-sig")
    # Zipar tudo
    zip_path = outdir / f"{stem}_shp.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in shp_dir.rglob("*"):
            zf.write(f, f.relative_to(shp_dir))
    import shutil; shutil.rmtree(shp_dir)
    log.info("  SHP zip: %s", zip_path.name)
    return zip_path


def export_geojson(layers: dict, outdir: Path, stem: str) -> list[Path]:
    paths = []
    for name, data in layers.items():
        if isinstance(data, gpd.GeoDataFrame) and data.geometry.notna().any():
            p = outdir / f"{stem}_{name}.geojson"
            data.to_file(str(p), driver="GeoJSON")
            paths.append(p)
            log.info("  GeoJSON: %s (%d feições)", p.name, len(data))
    return paths


def export_csv(layers: dict, outdir: Path, stem: str) -> list[Path]:
    paths = []
    for name, data in layers.items():
        df = data.drop(columns=["geometry"], errors="ignore") if isinstance(data, gpd.GeoDataFrame) else data
        if not df.empty:
            p = outdir / f"{stem}_{name}.csv"
            df.to_csv(p, index=False, encoding="utf-8-sig")
            paths.append(p)
            log.info("  CSV: %s (%d linhas)", p.name, len(df))
    return paths


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exporta dados REDD+ Piauí do Supabase para ArcGIS/QGIS.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--modulo",  default="all",
        choices=["alertas", "areas_prioritarias", "queimadas", "all"],
        help="Módulo a exportar (padrão: all)")
    parser.add_argument("--formato", default="gpkg",
        choices=["gpkg", "shp", "geojson", "csv"],
        help="Formato de saída (padrão: gpkg)")
    parser.add_argument("--ano", default="all",
        help="Ano dos dados: 2022..2025 ou 'all' (padrão: all)")
    parser.add_argument("--output", default=str(OUTDIR),
        help="Diretório de saída")
    parser.add_argument("--sem-geom", action="store_true",
        help="Exportar apenas tabelas tabulares (sem geometry)")
    args = parser.parse_args()

    outdir = _ensure_dir(Path(args.output))
    log.info("=" * 60)
    log.info("Exportação REDD+ Piauí — módulo=%s | formato=%s | ano=%s",
             args.modulo, args.formato, args.ano)
    log.info("Destino: %s", outdir)
    log.info("=" * 60)

    sb = _get_client()
    modulos = (
        ["alertas", "areas_prioritarias", "queimadas"]
        if args.modulo == "all" else [args.modulo]
    )

    for modulo in modulos:
        log.info("─── Módulo: %s ───", modulo)
        try:
            if modulo == "alertas":
                layers = _download_alertas(sb, args.ano)
            elif modulo == "areas_prioritarias":
                layers = _download_areas_prioritarias(sb, args.ano)
            elif modulo == "queimadas":
                layers = _download_queimadas(sb, args.ano)
            else:
                continue

            if not layers:
                log.warning("Nenhum dado retornado para %s. Pulando.", modulo)
                continue

            # Remover geometria se pedido
            if args.sem_geom:
                layers = {k: (v.drop(columns=["geometry"], errors="ignore")
                              if isinstance(v, gpd.GeoDataFrame) else v)
                          for k, v in layers.items()}

            stem = f"redd_piaui_{modulo}_{args.ano}_{date.today().isoformat()}"
            mod_dir = _ensure_dir(outdir / modulo)

            if args.formato == "gpkg":
                export_gpkg(layers, mod_dir, stem)
            elif args.formato == "shp":
                export_shp(layers, mod_dir, stem)
            elif args.formato == "geojson":
                export_geojson(layers, mod_dir, stem)
            elif args.formato == "csv":
                export_csv(layers, mod_dir, stem)

            _write_disclaimer(mod_dir, modulo, args.ano)
            _write_metadata(mod_dir, layers, modulo, args.ano)
            log.info("✓ %s exportado → %s", modulo, mod_dir)

        except Exception as exc:
            log.error("Erro ao exportar %s: %s", modulo, exc)
            if "--debug" in sys.argv:
                raise

    log.info("=" * 60)
    log.info("Exportação concluída → %s", outdir)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
