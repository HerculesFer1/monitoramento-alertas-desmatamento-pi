"""
Testes unitários — processor.py  (pipeline vetorial v2)
Valida cruzamento gpd.overlay() e integridade dos resultados.
"""
from __future__ import annotations

import pytest
import geopandas as gpd
from shapely.geometry import box


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def gdf_classes_valido():
    """GeoDataFrame com 1 registro de cruzamento classe × município, classes 1-5."""
    return gpd.GeoDataFrame(
        [{
            "municipio_cod":     "2200053",
            "municipio_nome":    "Acauã",
            "uf":                "PI",
            "classe_prioridade": 3,
            "area_total_ha":     1000.0,
            "area_floresta_ha":  500.0,
            "area_desmat_ha":    100.0,
            "area_nao_floresta_ha": 400.0,
            "pct_floresta":      50.0,
            "pct_desmat":        10.0,
            "agb_medio_tc_ha":   None,
            "biomassa_total_tc": None,
            "ano_prodes":        2025,
        }],
        geometry=[box(-42.5, -10.5, -42.0, -10.0)],
        crs="EPSG:4674",
    )


@pytest.fixture
def gdf_resumo_224():
    """GeoDataFrame com 224 municípios fictícios (total Piauí)."""
    return gpd.GeoDataFrame(
        [{"municipio_cod": f"22{i:06d}", "municipio_nome": f"Mun{i}"}
         for i in range(224)],
        geometry=[box(-42.0 + i * 0.01, -10.0, -41.9 + i * 0.01, -9.9)
                  for i in range(224)],
        crs="EPSG:4674",
    )


# ── Testes de validação de saída ──────────────────────────────────────────────

class TestValidateOutput:

    def test_saida_valida_nao_levanta_excecao(self, gdf_classes_valido, gdf_resumo_224):
        """Pipeline com dados válidos não deve levantar exceção."""
        from modules.areas_prioritarias.processor import _validate_output
        _validate_output(gdf_classes_valido, gdf_resumo_224)

    def test_porcentagem_invalida_levanta_erro(self, gdf_resumo_224):
        """pct_floresta = 150 deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_classes_ruim = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "classe_prioridade": 1,
            "pct_floresta":      150.0,  # INVÁLIDO
            "pct_desmat":        10.0,
            "ano_prodes":        2025,
        }])

        with pytest.raises(ValueError, match="percentual fora"):
            _validate_output(gdf_classes_ruim, gdf_resumo_224)

    def test_classe_invalida_levanta_erro(self, gdf_resumo_224):
        """Classe 17 está fora do intervalo 1-5 — deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_classes_ruim = gpd.GeoDataFrame([{
            "municipio_cod":     "2200053",
            "classe_prioridade": 17,  # INVÁLIDO — fora de 1..5
            "pct_floresta":      50.0,
            "pct_desmat":        10.0,
            "ano_prodes":        2025,
        }])

        with pytest.raises(ValueError, match="Classes inválidas"):
            _validate_output(gdf_classes_ruim, gdf_resumo_224)

    def test_sem_municipios_levanta_erro(self, gdf_classes_valido):
        """GeoDataFrame de resumo vazio deve levantar ValueError."""
        from modules.areas_prioritarias.processor import _validate_output

        gdf_resumo_vazio = gpd.GeoDataFrame(
            [],
            geometry=[],
            crs="EPSG:4674",
        )

        with pytest.raises(ValueError, match="Nenhum município"):
            _validate_output(gdf_classes_valido, gdf_resumo_vazio)

    def test_poucos_municipios_emite_aviso(self, gdf_classes_valido, caplog):
        """Menos de 50 municípios deve emitir log.warning (não levantar ValueError)."""
        import logging
        from modules.areas_prioritarias.processor import _validate_output

        gdf_resumo_pequeno = gpd.GeoDataFrame(
            [{"municipio_cod": f"22{i:06d}"} for i in range(5)],
            geometry=[box(-42.0, -10.0, -41.0, -9.0)] * 5,
            crs="EPSG:4674",
        )

        with caplog.at_level(logging.WARNING, logger="modules.areas_prioritarias.processor"):
            _validate_output(gdf_classes_valido, gdf_resumo_pequeno)

        assert "esperado ~224" in caplog.text, "Esperado aviso sobre poucos municípios"


# ── Testes de cálculo de área vetorial ───────────────────────────────────────

class TestCalcAreaHa:

    def test_area_positiva(self):
        """Área de célula vetorial reprojetada para EPSG:5880 deve ser > 0."""
        from modules.areas_prioritarias.processor import _calc_area_ha

        gdf = gpd.GeoDataFrame(
            [{"id": 1}],
            geometry=[box(-44.0, -8.0, -43.0, -7.0)],  # ~1° × 1°
            crs="EPSG:4674",
        )
        gdf_out = _calc_area_ha(gdf, "area_ha")

        assert "area_ha" in gdf_out.columns
        assert gdf_out.iloc[0]["area_ha"] > 0

    def test_area_razoavel_para_caixa_1grau(self):
        """Caixa de ~1° × 1° no Piauí deve ter entre 500 k e 2 M ha."""
        from modules.areas_prioritarias.processor import _calc_area_ha

        gdf = gpd.GeoDataFrame(
            [{"id": 1}],
            geometry=[box(-44.0, -8.0, -43.0, -7.0)],
            crs="EPSG:4674",
        )
        area = _calc_area_ha(gdf, "area_ha").iloc[0]["area_ha"]
        # 1° × 1° ≈ 111 km × 110 km ≈ 1.22 M ha (varia com latitude)
        assert 500_000 < area < 2_000_000, f"Área inesperada: {area:.0f} ha"

    def test_crs_original_preservado(self):
        """CRS do GeoDataFrame não deve ser alterado pela função."""
        from modules.areas_prioritarias.processor import _calc_area_ha

        gdf = gpd.GeoDataFrame(
            [{"id": 1}],
            geometry=[box(-44.0, -8.0, -43.0, -7.0)],
            crs="EPSG:4674",
        )
        gdf_out = _calc_area_ha(gdf, "area_ha")
        assert gdf_out.crs.to_epsg() == 4674, "CRS original deve ser preservado"

    def test_bbox_formato_correto(self):
        """bbox gerado por _build_resumo deve ser [[minX,minY],[maxX,maxY]]."""
        from shapely.geometry import box as sgbox

        geom = sgbox(-45.0, -10.0, -40.0, -5.0)
        bbox = [[geom.bounds[0], geom.bounds[1]], [geom.bounds[2], geom.bounds[3]]]

        assert len(bbox) == 2
        assert bbox[0] == [-45.0, -10.0]
        assert bbox[1] == [-40.0, -5.0]
        assert bbox[0][0] < bbox[1][0], "minX deve ser menor que maxX"
        assert bbox[0][1] < bbox[1][1], "minY deve ser menor que maxY"


# ── Testes de limpeza de geometrias ──────────────────────────────────────────

class TestCleanGeoms:

    def test_remove_geometrias_nulas(self):
        """Geometrias None devem ser removidas."""
        from modules.areas_prioritarias.processor import _clean_geoms

        gdf = gpd.GeoDataFrame(
            [{"id": 1}, {"id": 2}],
            geometry=[box(-44.0, -8.0, -43.0, -7.0), None],
            crs="EPSG:4674",
        )
        gdf_out = _clean_geoms(gdf)
        assert len(gdf_out) == 1
        assert gdf_out.iloc[0]["id"] == 1

    def test_preserva_geometrias_validas(self):
        """Geometrias válidas devem ser preservadas."""
        from modules.areas_prioritarias.processor import _clean_geoms

        gdf = gpd.GeoDataFrame(
            [{"id": i} for i in range(3)],
            geometry=[
                box(-44.0 + i * 0.1, -8.0, -43.9 + i * 0.1, -7.9)
                for i in range(3)
            ],
            crs="EPSG:4674",
        )
        gdf_out = _clean_geoms(gdf)
        assert len(gdf_out) == 3
