"""Testes unitários para pipeline/indicators.py."""
import pytest
import geopandas as gpd
from shapely.geometry import Point

from pipeline.indicators import apply_indicators


def _base_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({
        "CODEALERTA":    [101, 102, 103, 104, 105],
        "id_fragmento":  ["101_IRR_000001", "102_AUT_000001", "103_IRR_000001",
                          "104_IRR_000001", "105_IRR_000001"],
        "classificacao": ["IRREGULAR", "AUTORIZADO", "IRREGULAR", "IRREGULAR", "IRREGULAR"],
        "pct_cobertura": [0.0, 99.5, 0.0, 0.0, 0.0],
        "fonte_classificacao": ["SEM_INSTRUMENTO", "ASV", "SEM_INSTRUMENTO",
                                "SEM_INSTRUMENTO", "SEM_INSTRUMENTO"],
        "instrumento_ref":           [None, "ASV-001", None, None, None],
        "data_validade_instrumento": [None, None, None, None, None],
        "BIOMA":    ["Cerrado", "Cerrado", "Cerrado", "Cerrado", "Cerrado"],
        "MUNICIPIO":["Uruçuí", "Uruçuí", "Uruçuí", "Uruçuí", "Uruçuí"],
        "ANODETEC": [2022, 2023, 2024, 2022, 2023],
        "area_ha":  [10.0, 5.0, 8.0, 4.0, 6.0],
        "area_original_ha": [10.0, 5.0, 8.0, 4.0, 6.0],
        "VPRESSAO": ["Agriculture"] * 5,
        "vpressao_ptbr": ["Agricultura"] * 5,
        "fonte_list": [[], ["ASV-001"], [], [], []],
        "DATADETEC": [None] * 5,
        "dias_pub":  [None] * 5,
        "matopiba":  [True] * 5,
        "geometry":  [Point(i, 0) for i in range(5)],
    }, crs=4326)


def test_apply_indicators_renames_codealerta():
    result = apply_indicators(_base_gdf())
    assert "codealerta" in result.columns
    assert "CODEALERTA" not in result.columns


def test_apply_indicators_renames_bioma():
    result = apply_indicators(_base_gdf())
    assert "bioma" in result.columns
    assert "BIOMA" not in result.columns


def test_apply_indicators_renames_municipio():
    result = apply_indicators(_base_gdf())
    assert "municipio" in result.columns
    assert "MUNICIPIO" not in result.columns


def test_apply_indicators_renames_anodetec_to_ano():
    result = apply_indicators(_base_gdf())
    assert "ano" in result.columns
    assert "ANODETEC" not in result.columns


def test_apply_indicators_adds_reincidente():
    result = apply_indicators(_base_gdf())
    assert "reincidente" in result.columns
    assert result["reincidente"].dtype == bool


def test_apply_indicators_reincidente_below_threshold():
    # Uruçuí tem IRREGULAR em 2022, 2023, 2024 → 3 anos → reincidente
    result = apply_indicators(_base_gdf())
    irr_uruçui = result[(result["municipio"] == "Uruçuí") & (result["classificacao"] == "IRREGULAR")]
    assert irr_uruçui["reincidente"].all()


def test_apply_indicators_preserves_geometry():
    result = apply_indicators(_base_gdf())
    assert "geometry" in result.columns
    assert not result.geometry.isna().any()


def test_apply_indicators_applies_schema_order():
    result = apply_indicators(_base_gdf())
    # Os primeiros campos devem seguir o schema canônico
    cols = list(result.columns)
    assert cols[0] == "id_fragmento"
    assert "classificacao" in cols
    assert "area_ha" in cols
