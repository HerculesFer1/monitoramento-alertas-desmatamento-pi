"""Testes unitários para pipeline/quality.py (T1-T9)."""
import pandas as pd
import pytest
import geopandas as gpd
from shapely.geometry import Point

from modules.alertas_mapbiomas.quality import (
    run_all_tests,
    _t1_unique_ids,
    _t2_classification_filled,
    _t3_pct_cobertura_range,
    _t4_autp_max_99,
    _t5_aut_min_99,
    _t6_anos_presentes,
    _t7_volume_minimo,
    _t8_regularizado_restrito,
    _t9_reconciliacao_area,
)


def _base_gdf(**overrides) -> gpd.GeoDataFrame:
    data = dict(
        id_fragmento    =["A_IRR_000001", "B_AUT_000001", "C_REG_000001"],
        classificacao   =["IRREGULAR", "AUTORIZADO", "REGULARIZADO"],
        pct_cobertura   =[0.0, 99.5, 50.0],
        area_ha         =[10.0, 5.0, 3.0],
        area_original_ha=[10.0, 5.0, 3.0],
        ano             =[2022, 2023, 2024],
        codealerta      =[1, 2, 3],
        geometry        =[Point(0,0), Point(1,1), Point(2,2)],
    )
    data.update(overrides)
    return gpd.GeoDataFrame(data, crs=4326)


# ── T1 — id_fragmento únicos ──────────────────────────────────────────────

def test_t1_passes_unique():
    assert _t1_unique_ids(_base_gdf()).passed

def test_t1_fails_on_duplicates():
    gdf = _base_gdf()
    gdf2 = gpd.GeoDataFrame(pd.concat([gdf, gdf], ignore_index=True), crs=4326)
    assert not _t1_unique_ids(gdf2).passed


# ── T2 — classificacao preenchida ─────────────────────────────────────────

def test_t2_passes():
    assert _t2_classification_filled(_base_gdf()).passed

def test_t2_fails_on_null():
    gdf = _base_gdf(classificacao=[None, "AUTORIZADO", "REGULARIZADO"])
    assert not _t2_classification_filled(gdf).passed


# ── T3 — pct_cobertura em [0, 100] ───────────────────────────────────────

def test_t3_passes_valid():
    assert _t3_pct_cobertura_range(_base_gdf()).passed

def test_t3_fails_negative():
    gdf = _base_gdf(pct_cobertura=[-1.0, 99.5, 50.0])
    assert not _t3_pct_cobertura_range(gdf).passed

def test_t3_fails_above_100():
    gdf = _base_gdf(pct_cobertura=[0.0, 101.0, 50.0])
    assert not _t3_pct_cobertura_range(gdf).passed


# ── T4 — AUTORIZADO_PARCIALMENTE ≤ 99% ───────────────────────────────────

def test_t4_passes():
    gdf = _base_gdf(
        classificacao=["AUTORIZADO_PARCIALMENTE", "AUTORIZADO", "IRREGULAR"],
        pct_cobertura=[50.0, 99.5, 0.0],
    )
    assert _t4_autp_max_99(gdf).passed

def test_t4_fails_above_99():
    gdf = _base_gdf(
        classificacao=["AUTORIZADO_PARCIALMENTE", "AUTORIZADO", "IRREGULAR"],
        pct_cobertura=[100.0, 99.5, 0.0],
    )
    assert not _t4_autp_max_99(gdf).passed


# ── T5 — AUTORIZADO ≥ 99% ────────────────────────────────────────────────

def test_t5_passes():
    assert _t5_aut_min_99(_base_gdf()).passed

def test_t5_fails_below_99():
    gdf = _base_gdf(
        classificacao=["IRREGULAR", "AUTORIZADO", "REGULARIZADO"],
        pct_cobertura=[0.0, 50.0, 50.0],  # AUTORIZADO com 50% → inválido
    )
    assert not _t5_aut_min_99(gdf).passed


# ── T6 — cobertura de todos os anos ──────────────────────────────────────

def test_t6_passes_all_present():
    r = _t6_anos_presentes(_base_gdf(), anos=(2022, 2023, 2024))
    assert r.passed

def test_t6_fails_missing_year():
    gdf = _base_gdf(ano=[2022, 2022, 2022])
    r = _t6_anos_presentes(gdf, anos=(2022, 2023, 2024))
    assert not r.passed


# ── T7 — volume mínimo por ano ────────────────────────────────────────────

def test_t7_passes():
    r = _t7_volume_minimo(_base_gdf(), anos=(2022, 2023, 2024))
    assert r.passed

def test_t7_fails_empty_year():
    gdf = _base_gdf(ano=[2022, 2022, 2022])
    r = _t7_volume_minimo(gdf, anos=(2022, 2023, 2024))
    assert not r.passed


# ── T8 — REGULARIZADO restrito a anos_deradsa ─────────────────────────────

def test_t8_passes():
    r = _t8_regularizado_restrito(_base_gdf(), anos_deradsa=(2024, 2025))
    assert r.passed  # REGULARIZADO está em 2024, que é válido

def test_t8_fails_invalid_year():
    gdf = _base_gdf(
        classificacao=["IRREGULAR", "AUTORIZADO", "REGULARIZADO"],
        ano=[2022, 2023, 2022],  # REGULARIZADO em 2022 → inválido
    )
    r = _t8_regularizado_restrito(gdf, anos_deradsa=(2024, 2025))
    assert not r.passed


# ── T9 — reconciliação de área ────────────────────────────────────────────

def test_t9_passes_within_10pct():
    gdf = _base_gdf(
        classificacao   =["IRREGULAR", "IRREGULAR"],
        pct_cobertura   =[0.0, 0.0],
        area_ha         =[9.5, 0.5],       # soma = 10 = area_original
        area_original_ha=[10.0, 10.0],
        ano             =[2022, 2022],
        codealerta      =[1, 1],
        id_fragmento    =["1_IRR_000001", "1_IRR_000002"],
        geometry        =[Point(0,0), Point(1,1)],
    )
    r = _t9_reconciliacao_area(gdf)
    assert r.passed

def test_t9_fails_large_divergence():
    gdf = _base_gdf(
        classificacao   =["IRREGULAR"],
        pct_cobertura   =[0.0],
        area_ha         =[5.0],   # 50% da area_original → desvio 50%
        area_original_ha=[10.0],
        ano             =[2022],
        codealerta      =[1],
        id_fragmento    =["1_IRR_000001"],
        geometry        =[Point(0,0)],
    )
    r = _t9_reconciliacao_area(gdf)
    assert not r.passed


# ── run_all_tests ─────────────────────────────────────────────────────────

def test_run_all_tests_returns_9_results():
    gdf = _base_gdf()
    report = run_all_tests(gdf, anos=(2022, 2023, 2024), anos_deradsa=(2024, 2025))
    assert report.n_total == 9

def test_run_all_tests_summary_string():
    gdf = _base_gdf()
    report = run_all_tests(gdf, anos=(2022, 2023, 2024), anos_deradsa=(2024, 2025))
    s = report.summary()
    assert "9" in s
