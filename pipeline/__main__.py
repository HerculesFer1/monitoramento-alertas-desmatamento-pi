"""
pipeline/__main__.py — Orquestrador do pipeline de desmatamento PI.

Execução:
    python -m pipeline                    (usa base de dados/ padrão)
    python -m pipeline --data-dir <path>  (diretório personalizado)

Etapas:
    1  Leitura         — DataReader carrega os GeoJSONs brutos
    2  Filtro Temporal — Manter apenas 2022–2025
    3  Reprojeção      — Todos → EPSG:5880 (cálculo de área)
    4  Parse de Campos — Datas, flags, normalização
    4B Validação PRODES— Cruzamento com PRODES-Cerrado (condicional)
    5  Fragmentação    — AlertClassifier produz fragmentos classificados
    6  Consolidação    — GeoDataFrame único + cálculo de áreas em ha
    7  Indicadores     — Reincidência, defasagem, schema de saída
    8  Testes          — T1-T9; pipeline continua mas avisa sobre falhas
    9  Malha IBGE      — Download da malha municipal do Piauí
   10  Agregado        — JSON por município × ano
   11  Exportação      — EPSG:4326, simplificação, GeoJSON final
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import time
import warnings
from datetime import datetime
from pathlib import Path

# Suprimir avisos conhecidos de bibliotecas externas sem esconder nossos próprios.
# Não usar filterwarnings("ignore") globalmente — mascara erros reais.
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning, module="geopandas")
warnings.filterwarnings("ignore", category=DeprecationWarning, module="fiona")
warnings.filterwarnings("ignore", category=RuntimeWarning,    module="shapely")
warnings.filterwarnings("ignore", message=".*Fiona.*")
warnings.filterwarnings("ignore", message=".*CRS.*mismatch.*")

# ── Paths ─────────────────────────────────────────────────────────────────
_ROOT    = Path(__file__).resolve().parent.parent
_OUT_DIR = _ROOT / "Resultado"
_OUT_DIR.mkdir(exist_ok=True)

# ── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_OUT_DIR / "pipeline.log", mode="w", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

# ── Imports do pipeline (após logging para capturar warnings de import) ───
try:
    import geopandas as gpd
    import numpy as np
    import pandas as pd

    log.info("geopandas=%s  pandas=%s  numpy=%s",
             gpd.__version__, pd.__version__, np.__version__)
except ImportError as exc:
    log.error("Dependência faltando: %s", exc)
    sys.exit(1)

from .aggregate   import aggregate_municipal, aggregate_monthly, aggregate_resumo_estatico, download_municipios_ibge
from .classify    import AlertClassifier
from .constants   import ANOS, ANOS_DERADSA, CRS_CALC, CRS_OUT, M2_HA, export_json
from .indicators  import apply_indicators
from .parsers     import build_asv_base, parse_alertas, parse_asvs, parse_deradsa
from .quality     import run_all_tests
from .readers     import LocalGeoJSONReader
from .spatial     import fix_geoms
from .utils       import elapsed
from .validation  import run_prodes_validation


# ══════════════════════════════════════════════════════════════════════════

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline de desmatamento PI v2")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=_ROOT / "base de dados",
        help="Diretório com os GeoJSONs brutos (padrão: base de dados/)",
    )
    return parser.parse_args()


def main() -> None:
    t0 = time.time()
    log.info("=" * 60)
    log.info("Pipeline v2 iniciado em %s", datetime.now().isoformat())
    log.info("Metodologia: 4 classes | validação temporal ASV | precedência ASV > DERADSA")

    args = _parse_args()
    data_dir = args.data_dir

    # ── 1. LEITURA ────────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 1: Leitura")
    reader = LocalGeoJSONReader(data_dir)

    gdf_al    = reader.read_alertas()
    gdf_asv   = reader.read_asvs()
    gdf_der24 = reader.read_deradsa(2024)
    gdf_der25 = reader.read_deradsa(2025)
    gdf_prodes = reader.read_prodes()
    log.info("  Leitura concluída [%s]", elapsed(t0))

    # ── 2. FILTRO TEMPORAL ────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 2: Filtro temporal 2022–2025")
    vc = gdf_al["ANODETEC"].value_counts().sort_index().to_dict()
    log.info("  Contagem bruta por ano: %s", vc)

    n_2026 = int((gdf_al["ANODETEC"] == 2026).sum())
    if n_2026:
        log.warning("  Alertas de 2026 descartados: %d", n_2026)

    n_antes = len(gdf_al)
    gdf_al  = gdf_al[gdf_al["ANODETEC"].isin([float(y) for y in ANOS])].copy()
    gdf_al["ANODETEC"] = gdf_al["ANODETEC"].astype(int)
    log.info("  Descartados: %d | Mantidos: %d", n_antes - len(gdf_al), len(gdf_al))
    log.info("  Por ano: %s", {int(y): int(v) for y, v in gdf_al["ANODETEC"].value_counts().sort_index().items()})

    # ── 3. REPROJEÇÃO ─────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 3: Reprojeção → %s", CRS_CALC)
    gdf_al    = fix_geoms(gdf_al.to_crs(CRS_CALC),    "alertas")
    gdf_asv   = fix_geoms(gdf_asv.to_crs(CRS_CALC),   "asvs")
    gdf_der24 = fix_geoms(gdf_der24.to_crs(CRS_CALC), "der24") if not gdf_der24.empty else gdf_der24
    gdf_der25 = fix_geoms(gdf_der25.to_crs(CRS_CALC), "der25") if not gdf_der25.empty else gdf_der25
    if gdf_prodes is not None:
        gdf_prodes = fix_geoms(gdf_prodes.to_crs(CRS_CALC), "prodes")
    log.info("  Reprojeção concluída [%s]", elapsed(t0))

    # ── 4. PARSE DE CAMPOS ────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 4: Parse de campos")
    gdf_al              = parse_alertas(gdf_al)
    gdf_asv, asv_id_col = parse_asvs(gdf_asv)
    _, _, der_id_col    = parse_deradsa(gdf_der24, gdf_der25)
    asv_base            = build_asv_base(gdf_asv)

    # ── 4-B. VALIDAÇÃO PRODES (condicional) ──────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 4-B: Validação cruzada PRODES-Cerrado")
    gdf_al = run_prodes_validation(gdf_al, gdf_prodes)

    # ── 5. CLASSIFICAÇÃO ──────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 5: Fragmentação espacial")
    classifier = AlertClassifier()
    all_frags  = classifier.classify(
        gdf_al, asv_base, asv_id_col,
        {2024: gdf_der24, 2025: gdf_der25},
        der_id_col,
    )
    log.info("  %d fragmentos gerados [%s]", len(all_frags), elapsed(t0))

    if not all_frags:
        log.error("Nenhum fragmento gerado — verifique os dados de entrada.")
        sys.exit(1)

    # ── 6. CONSOLIDAÇÃO ───────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 6: Consolidação e cálculo de áreas")
    gdf_out = gpd.GeoDataFrame(all_frags, geometry="geometry", crs=CRS_CALC)
    gdf_out.drop(
        columns=[c for c in ["_area_m2_orig", "_det_norm", "_dti", "_dtf",
                              "_status_valido"] if c in gdf_out.columns],
        inplace=True, errors="ignore",
    )
    gdf_out = fix_geoms(gdf_out, "output")
    gdf_out["area_ha"] = (gdf_out.geometry.area / M2_HA).round(4)

    if "AREAHA" in gdf_out.columns:
        irr_mask = (gdf_out["classificacao"] == "IRREGULAR") & (gdf_out["AREAHA"] > 0)
        div = gdf_out[irr_mask].copy()
        if not div.empty:
            div["_div"] = (div["area_ha"] - div["AREAHA"]).abs() / div["AREAHA"]
            n_div = int((div["_div"] > 0.10).sum())
            log.warning("  IRREGULAR com divergência área >10%%: %d (%s%%)",
                        n_div, round(n_div / len(div) * 100, 1))
        gdf_out = gdf_out.rename(columns={"AREAHA": "area_original_ha"})
    else:
        gdf_out["area_original_ha"] = None

    log.info("  Total: %d fragmentos | %s ha", len(gdf_out), f"{gdf_out['area_ha'].sum():,.0f}")
    log.info("  Por classe: %s", gdf_out["classificacao"].value_counts().to_dict())

    # ── 7. INDICADORES ────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 7: Indicadores derivados")
    gdf_out = apply_indicators(gdf_out)

    # ── 8. TESTES DE QUALIDADE ────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 8: Testes T1-T9")
    report = run_all_tests(gdf_out, ANOS, ANOS_DERADSA)
    if not report.all_passed:
        log.warning("  %d teste(s) falharam — corrija antes do uso institucional.",
                    report.n_total - report.n_passed)
    else:
        log.info("  Todos os %d testes passaram ✓", report.n_total)

    # ── 9. MALHA IBGE ─────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 9: Malha municipal IBGE")
    download_municipios_ibge(_OUT_DIR / "municipios_pi.geojson")

    # ── 10. AGREGADO MUNICIPAL ────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 10: Agregado municipal + mensal")
    agg_rows = aggregate_municipal(gdf_out)
    agg_path = _OUT_DIR / "agregado_municipios.json"
    with open(agg_path, "w", encoding="utf-8") as f:
        json.dump(agg_rows, f, ensure_ascii=False, indent=2, default=str)
    log.info("  → %s: %d registros", agg_path.name, len(agg_rows))

    monthly = aggregate_monthly(gdf_out)
    monthly_path = _OUT_DIR / "monthly_alertas.json"
    with open(monthly_path, "w", encoding="utf-8") as f:
        json.dump(monthly, f, ensure_ascii=False, indent=2)
    log.info("  → %s: %d anos", monthly_path.name, len(monthly))

    # Copia para frontend/public/data/ — Vite serve como ativo estático em /data/
    _frontend_data = _ROOT / "frontend" / "public" / "data"
    _frontend_data.mkdir(parents=True, exist_ok=True)
    shutil.copy2(monthly_path, _frontend_data / "monthly_alertas.json")
    log.info("  → frontend/public/data/monthly_alertas.json (ativo estático)")

    resumo_est      = aggregate_resumo_estatico(gdf_out)
    resumo_est_path = _OUT_DIR / "resumo_estatico.json"
    with open(resumo_est_path, "w", encoding="utf-8") as f:
        json.dump(resumo_est, f, ensure_ascii=False, indent=2, default=str)
    log.info("  → %s", resumo_est_path.name)
    shutil.copy2(resumo_est_path, _frontend_data / "resumo_estatico.json")
    log.info("  → frontend/public/data/resumo_estatico.json (ativo estático)")

    # ── 11. EXPORTAÇÃO ────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("ETAPA 11: Reprojeção → %s + exportação", CRS_OUT)
    gdf_out = _export(gdf_out, _OUT_DIR / "alertas_classificados.geojson")

    # Exporta constants.json para bridge com frontend TypeScript
    const_path = export_json()
    log.info("  → %s (bridge TypeScript)", const_path.name)

    # ── SUMÁRIO ───────────────────────────────────────────────────────────
    _log_summary(gdf_out, report, agg_path, _OUT_DIR, elapsed(t0))

    # ── UPLOAD SUPABASE (automático se .env configurado) ──────────────────
    _maybe_upload(len(gdf_out), len(agg_rows))


def _export(gdf_out: gpd.GeoDataFrame, out_path: Path) -> gpd.GeoDataFrame:
    """Etapa 11: reprojeção, simplificação e exportação GeoJSON."""
    gdf_out = gdf_out.to_crs(CRS_OUT)
    gdf_out.geometry = gdf_out.geometry.simplify(tolerance=0.0001, preserve_topology=True)
    gdf_out = fix_geoms(gdf_out, "final")

    # Serializar campos incompatíveis com Fiona/GeoJSON
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

    for col in gdf_out.select_dtypes(include="object").columns:
        if col == "geometry":
            continue
        if gdf_out[col].dropna().apply(lambda v: isinstance(v, list)).any():
            gdf_out[col] = gdf_out[col].apply(
                lambda v: json.dumps(v) if isinstance(v, list) else v
            )

    log.info("  Exportando %d features → %s", len(gdf_out), out_path.name)
    gdf_out.to_file(out_path, driver="GeoJSON")
    sz_mb = out_path.stat().st_size / (1024 * 1024)
    log.info("  → %s: %d features, %.1f MB", out_path.name, len(gdf_out), sz_mb)
    return gdf_out


def _log_summary(gdf_out, report, agg_path, out_dir, elapsed_str) -> None:
    log.info("=" * 60)
    log.info("PIPELINE v2 CONCLUÍDO | Tempo total: %s", elapsed_str)
    log.info("")
    log.info("Classificação:")
    for cls in ["AUTORIZADO", "AUTORIZADO_PARCIALMENTE", "REGULARIZADO", "IRREGULAR"]:
        sub = gdf_out[gdf_out["classificacao"] == cls]
        if not sub.empty:
            log.info("  %-30s: %6d fragmentos | %12,.0f ha",
                     cls, len(sub), sub["area_ha"].sum())
    log.info("")
    log.info("Consistência metodológica:")
    log.info("  Testes passados: %d/%d", report.n_passed, report.n_total)
    log.info("")
    log.info("Outputs:")
    for p in [
        out_dir / "alertas_classificados.geojson",
        agg_path,
        out_dir / "municipios_pi.geojson",
        out_dir / "pipeline.log",
    ]:
        log.info("  %s", p)
    log.info("")
    log.info("Nota metodológica:")
    log.info("  Série A (sem DERADSA): 2022–2025 — comparabilidade histórica")
    log.info("  Série B (com DERADSA): 2024–2025 — campo serie_b=True no agregado")


def _maybe_upload(n_fragmentos: int, n_mun: int) -> None:
    """
    Faz upload para o Supabase se SUPABASE_URL estiver configurado no .env.
    Silenciosamente ignora se as dependências não estiverem instaladas ou se
    as credenciais não estiverem definidas — permite uso offline sem alteração.
    """
    import os
    try:
        from dotenv import load_dotenv
        load_dotenv(_ROOT / ".env")
    except ImportError:
        pass   # python-dotenv opcional no modo offline

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not url or not key or "[project-ref]" in url:
        log.info("  SUPABASE_URL não configurado — upload automático ignorado.")
        log.info("  Para ativar: preencha .env e execute 'python pipeline/_upload_supabase.py'")
        return

    log.info("=" * 60)
    log.info("UPLOAD SUPABASE (automático)")
    try:
        from pipeline._upload_supabase import main as _upload
        _upload()
    except ImportError:
        log.warning("  supabase-py não instalado — instale com:")
        log.warning("  conda install -c conda-forge supabase python-dotenv")
    except Exception as exc:
        log.error("  Upload falhou: %s", exc)
        log.error("  Execute manualmente: python pipeline/_upload_supabase.py")


if __name__ == "__main__":
    main()
