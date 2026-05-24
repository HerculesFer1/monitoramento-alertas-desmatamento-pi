"""Testes unitários para platform/utils.py."""
import pandas as pd
import pytest
import geopandas as gpd
from shapely.geometry import Point

from core.utils import norm_mun, parse_fonte, parse_date_col, strip_tz, detect_id_col, elapsed


# ── norm_mun ──────────────────────────────────────────────────────────────

def test_norm_mun_removes_accents():
    assert norm_mun("São Paulo") == "sao paulo"

def test_norm_mun_removes_cedilla():
    assert norm_mun("Uruçuí") == "urucui"

def test_norm_mun_strips_whitespace():
    assert norm_mun("  Teresina  ") == "teresina"

def test_norm_mun_lowercase():
    assert norm_mun("FLORIANO") == "floriano"


# ── parse_fonte ───────────────────────────────────────────────────────────

def test_parse_fonte_none():
    assert parse_fonte(None) == []

def test_parse_fonte_empty_string():
    assert parse_fonte("") == []

def test_parse_fonte_single():
    assert parse_fonte("{MAPBIOMAS}") == ["MAPBIOMAS"]

def test_parse_fonte_multi():
    result = parse_fonte("{MAPBIOMAS,SINAFLOR}")
    assert result == ["MAPBIOMAS", "SINAFLOR"]

def test_parse_fonte_strips_spaces():
    result = parse_fonte("{ A , B }")
    assert result == ["A", "B"]


# ── parse_date_col ────────────────────────────────────────────────────────

def test_parse_date_col_iso_date():
    s = pd.Series(["2023-05-15"])
    result = parse_date_col(s)
    assert result.iloc[0] == pd.Timestamp("2023-05-15")

def test_parse_date_col_iso_datetime():
    s = pd.Series(["2023-05-15T00:00:00Z"])
    result = parse_date_col(s)
    assert result.iloc[0] == pd.Timestamp("2023-05-15")

def test_parse_date_col_br_format():
    s = pd.Series(["15/05/2023"])
    result = parse_date_col(s)
    assert result.iloc[0] == pd.Timestamp("2023-05-15")

def test_parse_date_col_null():
    s = pd.Series([None])
    result = parse_date_col(s)
    assert pd.isna(result.iloc[0])

def test_parse_date_col_excel_serial():
    # Serial Excel para 2023-01-01 = 44927 dias desde 1899-12-30
    s = pd.Series([44927.0])
    result = parse_date_col(s)
    assert result.iloc[0] == pd.Timestamp("2023-01-01")

def test_parse_date_col_mixed():
    s = pd.Series(["2022-01-10", None, "2023-06-30"])
    result = parse_date_col(s)
    assert result.iloc[0] == pd.Timestamp("2022-01-10")
    assert pd.isna(result.iloc[1])
    assert result.iloc[2] == pd.Timestamp("2023-06-30")


# ── detect_id_col ─────────────────────────────────────────────────────────

def _gdf(*cols):
    data = {c: [1] for c in cols}
    data["geometry"] = [Point(0, 0)]
    return gpd.GeoDataFrame(data, crs=4326)

def test_detect_id_col_first_match():
    gdf = _gdf("nu_autoriz", "id")
    assert detect_id_col(gdf, ["nu_autoriz", "id"]) == "nu_autoriz"

def test_detect_id_col_second_match():
    gdf = _gdf("id")
    assert detect_id_col(gdf, ["nu_autoriz", "id"]) == "id"

def test_detect_id_col_no_match():
    gdf = _gdf("x", "y")
    assert detect_id_col(gdf, ["nu_autoriz", "id"]) is None


# ── elapsed ───────────────────────────────────────────────────────────────

def test_elapsed_returns_string():
    import time
    t0 = time.time()
    result = elapsed(t0)
    assert result.endswith("min")
    assert float(result.replace("min", "")) >= 0.0
