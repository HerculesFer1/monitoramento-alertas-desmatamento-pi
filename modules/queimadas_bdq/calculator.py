"""
calculator.py — Módulo queimadas_bdq
Preparação final e upload dos dados de queimadas para o Supabase.

Responsabilidades:
  1. Normalizar tipos para upload
  2. Calcular pct_queimada_estado (% da área queimada total do PI)
  3. Registrar execução em qb_execucoes
  4. Upload para Supabase via core/uploader.py

Stateless — sem efeitos colaterais além do upload ao Supabase.
"""
from __future__ import annotations

import logging
from typing import Any

import geopandas as gpd
import pandas as pd

log = logging.getLogger(__name__)

_CRS_UPLOAD = "EPSG:4326"


def calculate_and_upload(
    gdf_classes: pd.DataFrame,
    gdf_resumo:  gpd.GeoDataFrame,
    meta:        dict[str, Any],
    ano:         int  = 2025,
    dry_run:     bool = False,
    verbose:     bool = False,
) -> int:
    """
    Normaliza, enriquece e faz upload para Supabase.
    Retorna total de registros inseridos em qb_cicatrizes_classes.
    """
    # ── 1. pct_queimada_estado ────────────────────────────────────────────────
    total_queimada = gdf_resumo["area_queimada_total_ha"].sum()
    gdf_resumo = gdf_resumo.copy()
    if total_queimada > 0:
        gdf_resumo["pct_queimada_estado"] = (
            gdf_resumo["area_queimada_total_ha"] / total_queimada * 100
        ).round(2)
    else:
        gdf_resumo["pct_queimada_estado"] = 0.0

    log.info(
        "Área queimada total PI: %.1f ha | Municípios afetados: %d",
        total_queimada,
        int((gdf_resumo["area_queimada_total_ha"] > 0).sum()),
    )

    # ── 2. Preparar tabelas ───────────────────────────────────────────────────
    df_classes        = _prepare_classes_for_upload(gdf_classes)
    gdf_resumo_upload = _prepare_resumo_for_upload(gdf_resumo)

    if dry_run:
        log.info(
            "DRY RUN — sem upload. Prontos: classes=%d, resumo=%d",
            len(df_classes), len(gdf_resumo_upload),
        )
        if verbose:
            log.info("Amostra classes:\n%s", df_classes.head(5).to_string())
            log.info(
                "Amostra resumo:\n%s",
                gdf_resumo_upload.drop(columns=["geometry"], errors="ignore").head(5).to_string(),
            )
        return len(df_classes)

    # ── 3. Upload Supabase ────────────────────────────────────────────────────
    from core.uploader import upload_geodataframe, upload_json

    log.info(
        "Enviando qb_cicatrizes_classes (%d registros)...", len(df_classes)
    )
    upload_json(
        data         = df_classes.to_dict("records"),
        table        = "qb_cicatrizes_classes",
        conflict_col = "municipio_cod,classe_prioridade,mes,ano",
    )

    log.info(
        "Enviando qb_municipios_resumo (%d registros)...", len(gdf_resumo_upload)
    )
    upload_geodataframe(
        gdf          = gdf_resumo_upload,
        table        = "qb_municipios_resumo",
        conflict_col = "municipio_cod,ano",
    )

    # ── 4. Registrar execução ─────────────────────────────────────────────────
    _upload_execucao(meta, ano, len(df_classes))

    log.info("Upload queimadas_bdq concluído.")
    return len(df_classes)


# ── Preparação para upload ────────────────────────────────────────────────────

def _prepare_classes_for_upload(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza tipos e garante colunas obrigatórias."""
    df = df.copy()
    if isinstance(df, gpd.GeoDataFrame):
        df = pd.DataFrame(df.drop(columns=["geometry"], errors="ignore"))

    numeric_cols = ["area_queimada_ha"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").round(4)

    int_cols = ["n_cicatrizes", "classe_prioridade", "mes", "ano"]
    for col in int_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    if "prioridade_label" not in df.columns:
        _LABELS = {1: "Muito Baixo", 2: "Baixo", 3: "Médio", 4: "Alto", 5: "Muito Alto"}
        df["prioridade_label"] = df["classe_prioridade"].map(_LABELS)

    if "uf" not in df.columns:
        df["uf"] = "PI"

    df = df.where(pd.notnull(df), other=None)
    return df


def _prepare_resumo_for_upload(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reprojetar para EPSG:4326, normalizar tipos."""
    gdf = gdf.copy()

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(_CRS_UPLOAD)

    # bbox como lista para JSONB
    if "bbox" not in gdf.columns:
        gdf["bbox"] = gdf.geometry.apply(
            lambda g: [[g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]]
            if g is not None and not g.is_empty else None
        )

    float_cols = [
        "area_queimada_total_ha", "pct_area_prioritaria", "pct_queimada_estado",
    ]
    for col in float_cols:
        if col in gdf.columns:
            gdf[col] = pd.to_numeric(gdf[col], errors="coerce").round(4)

    # Colunas ha_classe_* (JSONB via dict)
    ha_classe_cols = [c for c in gdf.columns if c.startswith("ha_classe_")]
    if ha_classe_cols:
        gdf["area_ha_por_classe"] = gdf[ha_classe_cols].apply(
            lambda row: {c.replace("ha_classe_", ""): row[c]
                         for c in ha_classe_cols if row[c] > 0},
            axis=1,
        )
        gdf = gdf.drop(columns=ha_classe_cols)

    int_cols = ["mes_pico", "classe_max_queimada", "n_cicatrizes_total", "ano"]
    for col in int_cols:
        if col in gdf.columns:
            gdf[col] = pd.to_numeric(gdf[col], errors="coerce").fillna(0).astype(int)

    for col in gdf.select_dtypes(include=["object", "string"]).columns:
        if col != "geometry":
            gdf[col] = gdf[col].where(pd.notnull(gdf[col]), other=None)

    return gdf


def _upload_execucao(meta: dict[str, Any], ano: int, n_registros: int) -> None:
    """Registra a execução em qb_execucoes via INSERT simples (sem upsert — tabela usa SERIAL id)."""
    try:
        import os
        from pathlib import Path

        from dotenv import load_dotenv
        from supabase import create_client

        load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            log.warning("SUPABASE_URL/KEY ausentes — execução não registrada.")
            return

        sb = create_client(url, key)
        sb.table("qb_execucoes").insert({
            "ano":                    ano,
            "n_cicatrizes_piaui":     meta.get("n_cicatrizes_piaui", 0),
            "area_queimada_ha":       float(meta.get("area_queimada_total_ha", 0.0)),
            "n_municipios_afetados":  meta.get("n_municipios_afetados", 0),
            "meses_com_dados":        ",".join(
                str(m) for m in meta.get("meses_com_dados", [])
            ),
            "n_registros_classes":    n_registros,
            "fonte_dados":            "AQ1km_V6_colecao2",
        }).execute()
        log.info("Execução registrada em qb_execucoes.")
    except Exception as exc:
        log.warning("Falha ao registrar execução em qb_execucoes: %s", exc)
