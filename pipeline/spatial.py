"""
pipeline/spatial.py — Operações geométricas puras.

Todas as funções são stateless (sem efeitos colaterais, sem I/O).
Dependem apenas de Shapely e GeoPandas — nenhuma dependência interna do pipeline.
"""
from __future__ import annotations

import logging
from typing import Optional

import geopandas as gpd
from shapely.geometry.base import BaseGeometry as Geometry
from shapely.ops import unary_union
from shapely.validation import make_valid

from .constants import MIN_AREA_M2

log = logging.getLogger(__name__)


def fix_geoms(gdf: gpd.GeoDataFrame, label: str = "") -> gpd.GeoDataFrame:
    """Corrige geometrias inválidas e remove vazias. Retorna novo GeoDataFrame."""
    if gdf.empty:
        return gdf

    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        log.warning("[%s] Corrigindo %d geometria(s) inválida(s)", label, invalid_mask.sum())
        gdf = gdf.copy()
        gdf.loc[invalid_mask, "geometry"] = (
            gdf.loc[invalid_mask, "geometry"].apply(make_valid)
        )

    empty_mask = gdf.geometry.is_empty | gdf.geometry.isna()
    if empty_mask.any():
        gdf = gdf[~empty_mask].copy()

    return gdf.reset_index(drop=True)


def dissolve_safe(gdf: gpd.GeoDataFrame, label: str = "") -> Optional[Geometry]:
    """Une todas as geometrias do GDF em uma única.

    Retorna None se o GDF for vazio. Em caso de falha no unary_union,
    faz fallback para a primeira geometria (comportamento conservador: não perde área).
    """
    if gdf.empty:
        return None
    try:
        union = unary_union(gdf.geometry.tolist())
        return make_valid(union) if not union.is_valid else union
    except Exception as exc:
        n_lost = len(gdf) - 1
        log.warning(
            "[%s] unary_union falhou (%s) — usando primeira geometria (%d ignoradas)",
            label, exc, n_lost,
        )
        return gdf.geometry.iloc[0]


def extract_polygons(geom: Optional[Geometry]) -> Optional[Geometry]:
    """Remove pontos e linhas de qualquer geometria, mantendo apenas polígonos.

    Útil para limpar resultados de interseção que produzem GeometryCollections mistas.
    """
    if geom is None or geom.is_empty:
        return None

    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom

    if geom.geom_type == "GeometryCollection":
        polys = [
            g for g in geom.geoms
            if g.geom_type in ("Polygon", "MultiPolygon")
        ]
        if not polys:
            return None
        result = unary_union(polys)
        return result if not result.is_empty else None

    return None  # Point, LineString, etc.


def safe_intersection(
    geom_a: Geometry,
    geom_b: Geometry,
    label: str = "",
) -> Optional[Geometry]:
    """Calcula a interseção entre dois polígonos com tratamento de erro.

    Retorna None se o resultado for menor que MIN_AREA_M2 (artefato geométrico).
    """
    try:
        result = geom_a.intersection(geom_b)
        if not result.is_valid:
            result = make_valid(result)
        result = extract_polygons(result)
        return result if (result and result.area >= MIN_AREA_M2) else None
    except Exception as exc:
        log.warning("[intersection/%s] %s", label, exc)
        return None


def safe_difference(
    geom_a: Geometry,
    geom_b: Geometry,
    label: str = "",
) -> Optional[Geometry]:
    """Subtrai geom_b de geom_a com tratamento de erro.

    Em caso de falha, retorna geom_a intacto (comportamento conservador:
    área não subtraída é preferível a área perdida silenciosamente).
    """
    try:
        result = geom_a.difference(geom_b)
        if not result.is_valid:
            result = make_valid(result)
        result = extract_polygons(result)
        return result if (result and result.area >= MIN_AREA_M2) else None
    except Exception as exc:
        log.warning("[difference/%s] %s — área não subtraída (fallback)", label, exc)
        return geom_a
