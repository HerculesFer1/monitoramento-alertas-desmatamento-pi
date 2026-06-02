"""
platform/spatial_core.py — Operações geométricas puras.

Todas as funções são stateless (sem efeitos colaterais, sem I/O).
Dependem apenas de Shapely e GeoPandas — nenhuma dependência interna do pipeline.

CRS — contrato explícito:
    Funções que filtram por `area >= min_area` (safe_intersection, safe_difference)
    comparam o valor de `geom.area` na unidade do CRS da geometria passada.
    O default `MIN_AREA_M2 = 1.0` só faz sentido em CRS projetado métrico
    (EPSG:5880 Brasil Policônico, 3857 Web Mercator, UTM). Em CRS geográfico
    (4326, 4674) a unidade é grau² — 1 grau² ≈ 12.000 km², descarte catastrófico.

    Caller responsável por reprojetar para CRS métrico antes de invocar.
    O helper `assert_projected_crs(gdf, label)` aborta em CRS geográfico —
    use no início do pipeline de classificação.
"""
from __future__ import annotations

import logging
from typing import Optional

import geopandas as gpd
from shapely.geometry.base import BaseGeometry as Geometry
from shapely.ops import unary_union
from shapely.validation import make_valid

from core.constants import MIN_AREA_M2

log = logging.getLogger(__name__)

# Guard de performance: unary_union com >5k polígonos pode levar minutos
# e arriscar TopologyException. Acima desse limite, log de alerta sugere
# usar dissolve(by=...) chunked ou STRtree pré-construído.
_UNARY_UNION_WARN_THRESHOLD = 5000

# CRS geográficos comuns no projeto — área em grau², filtros métricos não se aplicam.
# Inclui também 4267 (NAD27) e 4269 (NAD83) por completude geodésica.
_CRS_GEOGRAFICOS_BLOQUEADOS = frozenset({4326, 4674, 4267, 4269})


def assert_projected_crs(gdf: gpd.GeoDataFrame, label: str = "") -> None:
    """Aborta se o GeoDataFrame está em CRS geográfico (grau²).

    Operações de área e filtros como `MIN_AREA_M2` exigem CRS projetado métrico.
    Esta função protege chamadores de `safe_intersection`/`safe_difference`
    contra o erro silencioso de filtrar polígonos por área em grau².

    Args:
        gdf:   GeoDataFrame a validar.
        label: Rótulo para mensagem de erro (ex: nome do módulo/etapa).

    Raises:
        ValueError: CRS ausente, geográfico (4326/4674/4267/4269), ou não-EPSG.
    """
    if gdf.crs is None:
        raise ValueError(
            f"[{label}] GeoDataFrame sem CRS — defina antes de operar com áreas. "
            "Use gdf.set_crs() ou reproject explicitamente."
        )
    epsg = gdf.crs.to_epsg()
    if epsg is None:
        raise ValueError(
            f"[{label}] CRS sem EPSG identificável ({gdf.crs}). "
            "Reprojetar para projeção equivalente (ex: EPSG:5880)."
        )
    if epsg in _CRS_GEOGRAFICOS_BLOQUEADOS:
        raise ValueError(
            f"[{label}] CRS EPSG:{epsg} é geográfico (grau²). "
            f"Reprojete para CRS projetado métrico (EPSG:5880 Brasil Policônico) "
            "antes de calcular áreas ou aplicar filtros métricos. "
            "Caso contrário, MIN_AREA_M2 e similares descartam polígonos "
            "≈12.000 km² como 'artefato'."
        )


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
    n = len(gdf)
    if n > _UNARY_UNION_WARN_THRESHOLD:
        log.warning(
            "[%s] unary_union em %d polígonos (limite %d) — considere dissolve(by=...) "
            "chunked ou STRtree para evitar TopologyException.",
            label, n, _UNARY_UNION_WARN_THRESHOLD,
        )
    try:
        union = unary_union(gdf.geometry.tolist())
        return make_valid(union) if not union.is_valid else union
    except Exception as exc:
        n_lost = n - 1
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
    geom_a:   Geometry,
    geom_b:   Geometry,
    label:    str   = "",
    min_area: float = MIN_AREA_M2,
) -> Optional[Geometry]:
    """Calcula a interseção entre dois polígonos com tratamento de erro.

    Retorna None se o resultado for menor que `min_area` (artefato geométrico).

    IMPORTANTE — unidades de `min_area`:
        O filtro compara `result.area` na unidade do CRS da geometria. O default
        `MIN_AREA_M2 = 1.0` pressupõe que geom_a e geom_b estão em CRS projetado
        métrico (EPSG:5880). Em CRS geográfico (4326/4674), passe `min_area=0`
        ou um valor em grau² adequado — a função NÃO valida o CRS (recebe
        Geometry shapely sem metadata). Use `assert_projected_crs(gdf)` no
        nível do pipeline para garantir.
    """
    try:
        result = geom_a.intersection(geom_b)
        if not result.is_valid:
            result = make_valid(result)
        result = extract_polygons(result)
        return result if (result and result.area >= min_area) else None
    except Exception as exc:
        log.warning("[intersection/%s] %s", label, exc)
        return None


def safe_difference(
    geom_a:   Geometry,
    geom_b:   Geometry,
    label:    str   = "",
    min_area: float = MIN_AREA_M2,
) -> Optional[Geometry]:
    """Subtrai geom_b de geom_a com tratamento de erro.

    Retorna None se o resultado for menor que `min_area` (resíduo desprezível)
    ou se a operação falhar.

    Em caso de falha NÃO retorna geom_a — isso violaria a precedência ASV > DERADSA:
    se a diferença falha no path AUTORIZADO_PARCIALMENTE, retornar a área total faria
    o DERADSA processar área já coberta por ASV. O caller trata None como
    'residual não classificável' (fragmento perdido, não reclassificado).

    Sobre `min_area`: ver docstring de `safe_intersection` — mesmo contrato.
    """
    try:
        result = geom_a.difference(geom_b)
        if not result.is_valid:
            result = make_valid(result)
        result = extract_polygons(result)
        return result if (result and result.area >= min_area) else None
    except Exception as exc:
        log.error("[difference/%s] %s — retornando None (residual não classificável)", label, exc)
        return None
