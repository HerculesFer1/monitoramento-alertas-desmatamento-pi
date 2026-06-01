"""
Testes unitários — módulo queimadas_bdq / processor.py

Testa a lógica de processamento sem acesso à rede nem ao Supabase.
Usa geometrias sintéticas dentro do bbox do Piauí.
"""
from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Polygon

# Fixtures sintéticas ────────────────────────────────────────────────────────

def _make_poly(lon: float, lat: float, side: float = 0.1) -> Polygon:
    """Quadrado centrado em (lon, lat) com lado `side` graus."""
    h = side / 2
    return Polygon([
        (lon - h, lat - h), (lon + h, lat - h),
        (lon + h, lat + h), (lon - h, lat + h),
    ])


@pytest.fixture
def cicatrizes_pi():
    """3 cicatrizes sintéticas dentro do Piauí."""
    return gpd.GeoDataFrame(
        {
            "mes":      [8, 8, 9],
            "area_km":  [0.5, 1.0, 2.0],
            "geometry": [
                _make_poly(-43.5, -7.0),
                _make_poly(-43.0, -6.5),
                _make_poly(-44.0, -8.0),
            ],
        },
        crs="EPSG:4326",
    )


@pytest.fixture
def classes_gdf():
    """5 classes de prioridade cobrindo a região sintética."""
    geom = _make_poly(-43.5, -7.0, side=4.0)
    return gpd.GeoDataFrame(
        {
            "classe_prioridade": [1, 2, 3, 4, 5],
            "prioridade_label":  ["Muito Baixo", "Baixo", "Médio", "Alto", "Muito Alto"],
            "geometry":          [geom] * 5,
        },
        crs="EPSG:4674",
    )


@pytest.fixture
def municipios_gdf():
    """3 municípios sintéticos."""
    return gpd.GeoDataFrame(
        {
            "CD_MUN":  ["2200000", "2200001", "2200002"],
            "NM_MUN":  ["Mun A", "Mun B", "Mun C"],
            "SIGLA_UF": ["PI", "PI", "PI"],
            "geometry": [
                _make_poly(-43.5, -7.0, 2.0),
                _make_poly(-43.0, -6.5, 2.0),
                _make_poly(-44.0, -8.0, 2.0),
            ],
        },
        crs="EPSG:4674",
    )


# Testes ──────────────────────────────────────────────────────────────────────

class TestDetectAreaCol:
    def test_detecta_area_km(self):
        from modules.queimadas_bdq.processor import _detect_area_col
        gdf = gpd.GeoDataFrame({"area_km": [1.0], "geometry": [_make_poly(0, 0)]})
        assert _detect_area_col(gdf) == "area_km"

    def test_detecta_maiusculo(self):
        from modules.queimadas_bdq.processor import _detect_area_col
        gdf = gpd.GeoDataFrame({"AREAKM2": [1.0], "geometry": [_make_poly(0, 0)]})
        assert _detect_area_col(gdf) is not None

    def test_retorna_none_se_ausente(self):
        from modules.queimadas_bdq.processor import _detect_area_col
        gdf = gpd.GeoDataFrame({"outra_col": [1.0], "geometry": [_make_poly(0, 0)]})
        assert _detect_area_col(gdf) is None


class TestMesFromPath:
    def test_padrao_canonico(self):
        from modules.queimadas_bdq.processor import _mes_from_path
        p = Path("aq2025_08.shp")
        assert _mes_from_path(p, 2025) == 8

    def test_padrao_original_inpe(self):
        from modules.queimadas_bdq.processor import _mes_from_path
        p = Path("2025_08_01_aq1km_V6.shp")
        assert _mes_from_path(p, 2025) == 8

    def test_mes_janeiro(self):
        from modules.queimadas_bdq.processor import _mes_from_path
        p = Path("aq2025_01.shp")
        assert _mes_from_path(p, 2025) == 1

    def test_mes_dezembro(self):
        from modules.queimadas_bdq.processor import _mes_from_path
        p = Path("aq2025_12.shp")
        assert _mes_from_path(p, 2025) == 12


class TestCleanGeoms:
    def test_remove_nulas(self):
        from modules.queimadas_bdq.processor import _clean_geoms
        gdf = gpd.GeoDataFrame(
            {"geometry": [_make_poly(0, 0), None, _make_poly(1, 1)]},
            crs="EPSG:4326",
        )
        result = _clean_geoms(gdf)
        assert len(result) == 2

    def test_mantem_validas(self):
        from modules.queimadas_bdq.processor import _clean_geoms
        gdf = gpd.GeoDataFrame(
            {"geometry": [_make_poly(0, 0), _make_poly(1, 1)]},
            crs="EPSG:4326",
        )
        result = _clean_geoms(gdf)
        assert len(result) == 2


class TestBuildResumo:
    def test_colunas_obrigatorias(self, cicatrizes_pi, municipios_gdf):
        from modules.queimadas_bdq.processor import _build_resumo

        gdf_classes = pd.DataFrame({
            "municipio_cod":    ["2200000", "2200000"],
            "municipio_nome":   ["Mun A",   "Mun A"],
            "classe_prioridade": [4, 5],
            "prioridade_label": ["Alto", "Muito Alto"],
            "mes":              [8, 9],
            "area_queimada_ha": [100.0, 50.0],
            "n_cicatrizes":     [3, 2],
            "uf":               ["PI", "PI"],
            "ano":              [2025, 2025],
        })

        resumo = _build_resumo(gdf_classes, municipios_gdf, 2025)
        obrigatorias = {
            "municipio_cod", "area_queimada_total_ha", "n_cicatrizes_total",
            "mes_pico", "classe_max_queimada", "pct_area_prioritaria", "ano",
        }
        assert obrigatorias.issubset(set(resumo.columns))

    def test_area_total_correta(self, municipios_gdf):
        from modules.queimadas_bdq.processor import _build_resumo

        gdf_classes = pd.DataFrame({
            "municipio_cod":    ["2200000", "2200000"],
            "municipio_nome":   ["Mun A",   "Mun A"],
            "classe_prioridade": [4, 5],
            "prioridade_label": ["Alto", "Muito Alto"],
            "mes":              [8, 9],
            "area_queimada_ha": [100.0, 50.0],
            "n_cicatrizes":     [2, 1],
            "uf":               ["PI", "PI"],
            "ano":              [2025, 2025],
        })

        resumo = _build_resumo(gdf_classes, municipios_gdf, 2025)
        row = resumo[resumo["municipio_cod"] == "2200000"].iloc[0]
        assert row["area_queimada_total_ha"] == pytest.approx(150.0, abs=0.01)

    def test_pct_prioritaria_100_quando_tudo_classe_alta(self, municipios_gdf):
        from modules.queimadas_bdq.processor import _build_resumo

        gdf_classes = pd.DataFrame({
            "municipio_cod":    ["2200000"],
            "municipio_nome":   ["Mun A"],
            "classe_prioridade": [5],
            "prioridade_label": ["Muito Alto"],
            "mes":              [8],
            "area_queimada_ha": [200.0],
            "n_cicatrizes":     [5],
            "uf":               ["PI"],
            "ano":              [2025],
        })

        resumo = _build_resumo(gdf_classes, municipios_gdf, 2025)
        row = resumo[resumo["municipio_cod"] == "2200000"].iloc[0]
        assert row["pct_area_prioritaria"] == pytest.approx(100.0, abs=0.01)


class TestPrepareClasses:
    def test_normaliza_tipos(self):
        from modules.queimadas_bdq.calculator import _prepare_classes_for_upload

        df = pd.DataFrame({
            "municipio_cod":    ["2200000"],
            "municipio_nome":   ["Mun A"],
            "classe_prioridade": [4],
            "mes":              [8],
            "area_queimada_ha": ["123.456"],
            "n_cicatrizes":     ["7"],
            "uf":               ["PI"],
            "ano":              [2025],
        })
        result = _prepare_classes_for_upload(df)
        assert result["area_queimada_ha"].dtype in (float, "float64")
        assert result["n_cicatrizes"].dtype in (int, "int64", "int32")

    def test_adiciona_prioridade_label(self):
        from modules.queimadas_bdq.calculator import _prepare_classes_for_upload

        df = pd.DataFrame({
            "municipio_cod":    ["2200000"],
            "municipio_nome":   ["Mun A"],
            "classe_prioridade": [5],
            "mes":              [9],
            "area_queimada_ha": [50.0],
            "n_cicatrizes":     [2],
            "uf":               ["PI"],
            "ano":              [2025],
        })
        result = _prepare_classes_for_upload(df)
        assert result.iloc[0]["prioridade_label"] == "Muito Alto"
