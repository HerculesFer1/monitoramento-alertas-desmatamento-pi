"""Testes unitários para pipeline/spatial.py."""
import pytest
import geopandas as gpd
from shapely.geometry import Polygon, Point, GeometryCollection, MultiPolygon

from pipeline.spatial import fix_geoms, dissolve_safe, extract_polygons, safe_intersection, safe_difference


def sq(x0, y0, x1, y1) -> Polygon:
    return Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

def make_gdf(*geoms) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(geometry=list(geoms), crs=4326)


# ── fix_geoms ─────────────────────────────────────────────────────────────

def test_fix_geoms_empty_gdf():
    gdf = make_gdf()
    result = fix_geoms(gdf)
    assert result.empty

def test_fix_geoms_removes_empty_geometry():
    empty = Point(0, 0).buffer(0)  # buffer(0) → geometria vazia
    gdf = make_gdf(sq(0, 0, 1, 1), empty)
    result = fix_geoms(gdf)
    assert len(result) == 1

def test_fix_geoms_preserves_valid():
    gdf = make_gdf(sq(0, 0, 1, 1), sq(2, 0, 3, 1))
    result = fix_geoms(gdf)
    assert len(result) == 2


# ── dissolve_safe ─────────────────────────────────────────────────────────

def test_dissolve_safe_empty():
    gdf = make_gdf()
    assert dissolve_safe(gdf) is None

def test_dissolve_safe_single_polygon():
    p = sq(0, 0, 1, 1)
    gdf = make_gdf(p)
    result = dissolve_safe(gdf)
    assert result is not None
    assert result.area == pytest.approx(1.0)

def test_dissolve_safe_two_adjacent():
    gdf = make_gdf(sq(0, 0, 1, 1), sq(1, 0, 2, 1))
    result = dissolve_safe(gdf)
    assert result is not None
    assert result.area == pytest.approx(2.0)

def test_dissolve_safe_two_disjoint():
    gdf = make_gdf(sq(0, 0, 1, 1), sq(5, 0, 6, 1))
    result = dissolve_safe(gdf)
    assert result is not None
    assert result.area == pytest.approx(2.0)


# ── extract_polygons ──────────────────────────────────────────────────────

def test_extract_polygons_polygon():
    p = sq(0, 0, 1, 1)
    assert extract_polygons(p) == p

def test_extract_polygons_multipolygon():
    mp = MultiPolygon([sq(0, 0, 1, 1), sq(3, 0, 4, 1)])
    result = extract_polygons(mp)
    assert result is not None
    assert result.geom_type == "MultiPolygon"

def test_extract_polygons_point_returns_none():
    assert extract_polygons(Point(0, 0)) is None

def test_extract_polygons_mixed_collection():
    gc = GeometryCollection([sq(0, 0, 1, 1), Point(5, 5)])
    result = extract_polygons(gc)
    assert result is not None
    assert result.geom_type in ("Polygon", "MultiPolygon")

def test_extract_polygons_collection_only_points():
    gc = GeometryCollection([Point(0, 0), Point(1, 1)])
    assert extract_polygons(gc) is None

def test_extract_polygons_none():
    assert extract_polygons(None) is None


# ── safe_intersection ─────────────────────────────────────────────────────

def test_safe_intersection_overlap():
    a = sq(0, 0, 2, 2)
    b = sq(1, 1, 3, 3)
    result = safe_intersection(a, b)
    assert result is not None
    assert result.area == pytest.approx(1.0)

def test_safe_intersection_no_overlap():
    a = sq(0, 0, 1, 1)
    b = sq(5, 5, 6, 6)
    result = safe_intersection(a, b)
    assert result is None

def test_safe_intersection_contained():
    outer = sq(0, 0, 10, 10)
    inner = sq(2, 2, 5, 5)
    result = safe_intersection(outer, inner)
    assert result is not None
    assert result.area == pytest.approx(inner.area)


# ── safe_difference ───────────────────────────────────────────────────────

def test_safe_difference_partial():
    a = sq(0, 0, 2, 2)   # área 4
    b = sq(0, 0, 1, 2)   # área 2
    result = safe_difference(a, b)
    assert result is not None
    assert result.area == pytest.approx(2.0)

def test_safe_difference_no_overlap_returns_a():
    a = sq(0, 0, 1, 1)
    b = sq(5, 5, 6, 6)
    result = safe_difference(a, b)
    assert result is not None
    assert result.area == pytest.approx(a.area)

def test_safe_difference_total_removes_all():
    a = sq(0, 0, 1, 1)
    b = sq(-1, -1, 2, 2)  # b contém a inteiramente
    result = safe_difference(a, b)
    # resultado é vazio → None
    assert result is None
