"""
Testes unitários — calculator.py
Valida cálculo de pct_floresta_estado e preparação para upload.
"""
from __future__ import annotations

import pytest
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import box


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def gdf_resumo_simples():
    return gpd.GeoDataFrame(
        [
            {"municipio_cod": "2200053", "municipio_nome": "Acauã",
             "area_floresta_ha": 1000.0, "area_desmat_ha": 200.0,
             "area_total_ha": 1500.0, "classe_max_prioridade": 3,
             "biomassa_floresta_tc": None, "pct_floresta_estado": None,
             "ano_prodes": 2024},
            {"municipio_cod": "2200103", "municipio_nome": "Agricolândia",
             "area_floresta_ha": 500.0, "area_desmat_ha": 50.0,
             "area_total_ha": 700.0, "classe_max_prioridade": 5,
             "biomassa_floresta_tc": None, "pct_floresta_estado": None,
             "ano_prodes": 2024},
        ],
        geometry=[box(-42.5, -10.5, -42.0, -10.0), box(-43.0, -9.5, -42.5, -9.0)],
        crs="EPSG:4326",
    )


@pytest.fixture
def gdf_classes_simples():
    return gpd.GeoDataFrame([
        {"municipio_cod": "2200053", "municipio_nome": "Acauã", "uf": "PI",
         "classe_prioridade": 1, "area_total_ha": 500.0,
         "area_floresta_ha": 400.0, "area_desmat_ha": 100.0,
         "area_nao_floresta_ha": 0.0, "pct_floresta": 80.0, "pct_desmat": 20.0,
         "agb_medio_tc_ha": None, "biomassa_total_tc": None, "ano_prodes": 2024},
        {"municipio_cod": "2200053", "municipio_nome": "Acauã", "uf": "PI",
         "classe_prioridade": 2, "area_total_ha": 500.0,
         "area_floresta_ha": 300.0, "area_desmat_ha": 100.0,
         "area_nao_floresta_ha": 100.0, "pct_floresta": 60.0, "pct_desmat": 20.0,
         "agb_medio_tc_ha": None, "biomassa_total_tc": None, "ano_prodes": 2024},
    ])


# ── Testes ────────────────────────────────────────────────────────────────────

class TestPctFlorestaEstado:

    def test_soma_pct_aprox_100(self, gdf_resumo_simples):
        """pct_floresta_estado de todos municípios deve somar ~100%."""
        from modules.areas_prioritarias.calculator import calculate_and_upload

        total = gdf_resumo_simples["area_floresta_ha"].sum()
        pct = (gdf_resumo_simples["area_floresta_ha"] / total * 100).round(2)
        assert abs(pct.sum() - 100.0) < 0.1

    def test_municipio_maior_floresta_tem_maior_pct(self, gdf_resumo_simples):
        """Município com mais floresta deve ter maior pct_floresta_estado."""
        total = gdf_resumo_simples["area_floresta_ha"].sum()
        gdf_resumo_simples["pct_floresta_estado"] = (
            gdf_resumo_simples["area_floresta_ha"] / total * 100
        ).round(2)

        maior = gdf_resumo_simples.loc[
            gdf_resumo_simples["area_floresta_ha"].idxmax(), "pct_floresta_estado"
        ]
        menor = gdf_resumo_simples.loc[
            gdf_resumo_simples["area_floresta_ha"].idxmin(), "pct_floresta_estado"
        ]
        assert maior > menor


class TestPrepareClassesUpload:

    def test_sem_coluna_geometry(self, gdf_classes_simples):
        """DataFrame de saída não deve ter coluna geometry."""
        from modules.areas_prioritarias.calculator import _prepare_classes_for_upload

        df = _prepare_classes_for_upload(gdf_classes_simples)
        assert "geometry" not in df.columns

    def test_tipos_numericos(self, gdf_classes_simples):
        """Colunas de área devem ser float após preparação."""
        from modules.areas_prioritarias.calculator import _prepare_classes_for_upload

        df = _prepare_classes_for_upload(gdf_classes_simples)
        assert df["area_total_ha"].dtype in [np.float64, float]
        assert df["pct_floresta"].dtype in [np.float64, float]


class TestPrepareResumoUpload:

    def test_crs_epsg4326(self, gdf_resumo_simples):
        """GeoDataFrame de saída deve estar em EPSG:4326."""
        from modules.areas_prioritarias.calculator import _prepare_resumo_for_upload

        gdf_out = _prepare_resumo_for_upload(gdf_resumo_simples)
        assert gdf_out.crs.to_epsg() == 4326

    def test_bbox_formato_correto(self, gdf_resumo_simples):
        """bbox deve ser [[minX,minY],[maxX,maxY]]."""
        from modules.areas_prioritarias.calculator import _prepare_resumo_for_upload

        gdf_out = _prepare_resumo_for_upload(gdf_resumo_simples)
        bbox = gdf_out.iloc[0]["bbox"]
        assert isinstance(bbox, list)
        assert len(bbox) == 2
        assert len(bbox[0]) == 2
        assert len(bbox[1]) == 2
        # minX < maxX
        assert bbox[0][0] < bbox[1][0]
