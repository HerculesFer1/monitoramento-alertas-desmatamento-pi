"""
Testes unitários — processor.py
Valida cruzamento raster × vetor e integridade dos resultados.
"""
from __future__ import annotations

import numpy as np
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

import geopandas as gpd
from shapely.geometry import box


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def municipio_simples():
    """Município fictício 10x10 graus (simplificado para teste)."""
    return gpd.GeoDataFrame(
        [{"CD_MUN": "2200053", "NM_MUN": "Acauã", "SIGLA_UF": "PI"}],
        geometry=[box(-42.5, -10.5, -42.0, -10.0)],
        crs="EPSG:4674",
    )


@pytest.fixture
def raster_info_mock():
    """Mock de rasterio para testes sem arquivos reais."""
    mock = MagicMock()
    mock.height = 100
    mock.width  = 100
    mock.crs    = MagicMock()
    mock.crs.to_epsg.return_value = 4674
    mock.crs.is_geographic = True
    mock.transform = MagicMock()
    return mock


# ── Testes de validação ───────────────────────────────────────────────────────

class TestValidateOutput:

    def test_porcentagens_validas(self):
        """pct_floresta deve estar entre 0 e 100."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_classes = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "municipio_nome":    "Acauã",
            "uf":                "PI",
            "classe_prioridade": 1,
            "area_total_ha":     1000.0,
            "area_floresta_ha":  500.0,
            "area_desmat_ha":    100.0,
            "area_nao_floresta_ha": 400.0,
            "pct_floresta":      50.0,
            "pct_desmat":        10.0,
            "agb_medio_tc_ha":   None,
            "biomassa_total_tc": None,
            "ano_prodes":        2024,
        }])

        gdf_resumo = gpd.GeoDataFrame(
            [{"municipio_cod": "2200053", "municipio_nome": "Acauã"}],
            geometry=[box(-42.5, -10.5, -42.0, -10.0)],
            crs="EPSG:4674",
        )
        # Preencher campo necessário para count
        for i in range(200):
            gdf_resumo = gpd.GeoDataFrame(
                [{"municipio_cod": f"22000{i:02d}", "municipio_nome": f"Mun{i}"}
                 for i in range(224)],
                geometry=[box(-42.5 + i*0.01, -10.5, -42.0 + i*0.01, -10.0)
                          for i in range(224)],
                crs="EPSG:4674",
            )
            break

        # Não deve levantar exceção
        _validate_output(gdf_classes, gdf_resumo)

    def test_porcentagem_invalida_levanta_erro(self):
        """pct_floresta = 150 deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output
        import pandas as pd

        gdf_classes = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "classe_prioridade": 1,
            "pct_floresta":      150.0,  # INVÁLIDO
            "pct_desmat":        10.0,
            "ano_prodes":        2024,
        }])

        gdf_resumo = gpd.GeoDataFrame(
            [{"municipio_cod": f"22{i:06d}"} for i in range(224)],
            geometry=[box(-42.0, -10.0, -41.0, -9.0)] * 224,
            crs="EPSG:4674",
        )

        with pytest.raises(ValueError, match="percentual fora"):
            _validate_output(gdf_classes, gdf_resumo)

    def test_classe_invalida_levanta_erro(self):
        """Classe 17 não existe no raster (1-16) — deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_classes = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "classe_prioridade": 17,  # INVÁLIDO
            "pct_floresta":      50.0,
            "pct_desmat":        10.0,
            "ano_prodes":        2024,
        }])

        gdf_resumo = gpd.GeoDataFrame(
            [{"municipio_cod": f"22{i:06d}"} for i in range(224)],
            geometry=[box(-42.0, -10.0, -41.0, -9.0)] * 224,
            crs="EPSG:4674",
        )

        with pytest.raises(ValueError, match="Classes inválidas"):
            _validate_output(gdf_classes, gdf_resumo)

    def test_municipios_insuficientes_levanta_erro(self):
        """Menos de 200 municípios deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_classes = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "classe_prioridade": 1,
            "pct_floresta":      50.0,
            "pct_desmat":        10.0,
            "ano_prodes":        2024,
        }])

        gdf_resumo = gpd.GeoDataFrame(
            [{"municipio_cod": f"22{i:06d}"} for i in range(5)],  # só 5
            geometry=[box(-42.0, -10.0, -41.0, -9.0)] * 5,
            crs="EPSG:4674",
        )

        with pytest.raises(ValueError, match="224"):
            _validate_output(gdf_classes, gdf_resumo)


# ── Testes de cálculo de área ─────────────────────────────────────────────────

class TestCalcPixelArea:

    def test_pixel_area_positiva(self):
        """Área do pixel deve ser > 0 e compatível com resolução ~30m."""
        from modules.areas_prioritarias.processor import _calc_pixel_area_ha
        from rasterio.transform import from_bounds

        # Simula raster 30m: 100×100 pixels cobrindo ~0.027° × 0.027° (~3km × 3km)
        # Cada pixel ≈ 0.000269° ≈ 30m → ~0.09 ha
        transform = from_bounds(-44.0, -8.0, -43.973, -7.973, 100, 100)

        class FakeCRS:
            is_geographic = True
            def to_epsg(self): return 4674

        area = _calc_pixel_area_ha(transform, FakeCRS())
        assert area > 0,   "Área do pixel deve ser positiva"
        assert area < 1.0, "Pixel de ~30m deve ter menos de 1 ha"

    def test_bbox_para_fitbounds(self):
        """bbox deve ter formato [[minX,minY],[maxX,maxY]]."""
        from modules.areas_prioritarias.processor import _geom_to_bbox
        from shapely.geometry import box

        geom = box(-45.0, -10.0, -40.0, -5.0)
        bbox = _geom_to_bbox(geom)

        assert len(bbox) == 2
        assert bbox[0] == [-45.0, -10.0]
        assert bbox[1] == [-40.0,  -5.0]
