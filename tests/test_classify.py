"""
Testes unitários para pipeline/classify.py — Núcleo metodológico.

Cenários críticos cobertos:
  TC1: Alerta sem DATADETEC → IRREGULAR direto (sem cruzamento espacial)
  TC2: DERADSA-only sem ASV → REGULARIZADO (precedência respeitada)
  TC3: Precedência ASV > DERADSA (AUTORIZADO pleno bloqueia DERADSA, parcial libera resíduo)
  TC4: safe_difference falha → DERADSA não invade área já coberta por ASV
"""
from __future__ import annotations

import pandas as pd
import geopandas as gpd
import pytest
from shapely.geometry import Polygon

from modules.alertas_mapbiomas.classify import AlertClassifier
from core.constants import CRS_CALC, THRESHOLD_AUTORIZADO


# ── Helpers ────────────────────────────────────────────────────────────────

def sq(x0, y0, x1, y1) -> Polygon:
    return Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def _alert_gdf(
    geom: Polygon,
    codealerta: int = 1001,
    ano: int = 2024,
    bioma: str = "Cerrado",
    datadetec: str | None = "2024-06-01",
) -> gpd.GeoDataFrame:
    """GeoDataFrame mínimo de alerta no formato de saída de parsers.parse_alertas."""
    det = pd.NaT if datadetec is None else pd.Timestamp(datadetec)
    return gpd.GeoDataFrame(
        {
            "CODEALERTA":    [codealerta],
            "ANODETEC":      [ano],
            "BIOMA":         [bioma],
            "DATADETEC":     [det],
            "_area_m2_orig": [float(geom.area)],
        },
        geometry=[geom],
        crs=CRS_CALC,
    )


def _asv_gdf(
    geom: Polygon,
    dti: str = "2020-01-01",
    dtf: str = "2030-12-31",
    bioma: str = "Cerrado",
    nu_autoriz: str = "ASV001",
) -> gpd.GeoDataFrame:
    """GeoDataFrame mínimo de ASV no formato de saída de parsers.build_asv_base."""
    return gpd.GeoDataFrame(
        {
            "nu_autoriz": [nu_autoriz],
            "bioma_pamg": [bioma],
            "_dti":       [pd.Timestamp(dti)],
            "_dtf":       [pd.Timestamp(dtf)],
        },
        geometry=[geom],
        crs=CRS_CALC,
    )


def _empty_asv_gdf() -> gpd.GeoDataFrame:
    """ASV vazia com todas as colunas obrigatórias para evitar KeyError no filtro de bioma."""
    dummy = _asv_gdf(sq(0, 0, 1, 1))
    return dummy[dummy["nu_autoriz"] == "__never__"].copy()


def _deradsa_gdf(geom: Polygon) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({"geometry": [geom]}, crs=CRS_CALC)


def _empty_der_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(geometry=gpd.GeoSeries(dtype="geometry", crs=CRS_CALC))


# ── TC1: Alerta sem DATADETEC → IRREGULAR ─────────────────────────────────

class TestAlertSemDatadetec:

    def test_classificacao_irregular(self):
        alert = _alert_gdf(sq(0, 0, 1000, 1000), datadetec=None)
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: _empty_der_gdf()}, None)

        assert len(frags) == 1
        assert frags[0]["classificacao"] == "IRREGULAR"

    def test_pct_cobertura_zero(self):
        alert = _alert_gdf(sq(0, 0, 1000, 1000), datadetec=None)
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: _empty_der_gdf()}, None)

        assert frags[0]["pct_cobertura"] == 0.0

    def test_fonte_sem_instrumento(self):
        alert = _alert_gdf(sq(0, 0, 1000, 1000), datadetec=None)
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: _empty_der_gdf()}, None)

        assert frags[0]["fonte_classificacao"] == "SEM_INSTRUMENTO"

    def test_deradsa_disponivel_nao_muda_resultado(self):
        """Alerta sem data não cruza com DERADSA — classificação é direta, sem cruzamento."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000), datadetec=None)
        deradsa = _deradsa_gdf(sq(0, 0, 1000, 1000))  # DERADSA cobre 100% da área
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        assert "REGULARIZADO" not in classes
        assert classes == ["IRREGULAR"]


# ── TC2: DERADSA-only sem ASV → REGULARIZADO ──────────────────────────────

class TestDeradasaOnlySemAsv:

    def test_regularizado_presente(self):
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        deradsa = _deradsa_gdf(sq(0, 0, 600, 1000))  # cobre 60% da área
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        assert "REGULARIZADO" in classes

    def test_sem_classes_asv(self):
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        deradsa = _deradsa_gdf(sq(0, 0, 600, 1000))
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        assert "AUTORIZADO" not in classes
        assert "AUTORIZADO_PARCIALMENTE" not in classes

    def test_residual_irregular(self):
        """Parte não coberta pela DERADSA deve ser IRREGULAR."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        deradsa = _deradsa_gdf(sq(0, 0, 600, 1000))  # 60% → 40% residual
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, _empty_asv_gdf(), None, {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        assert "IRREGULAR" in classes

    def test_deradsa_nao_aplicada_fora_anos_deradsa(self):
        """Anos 2022–2023 não têm DERADSA geoespacial — não deve gerar REGULARIZADO."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000), ano=2022)
        clf = AlertClassifier(anos=(2022,), anos_deradsa=(2024, 2025))
        # der_by_year vazio — nenhuma DERADSA disponível para 2022
        frags = clf.classify(alert, _empty_asv_gdf(), None, {}, None)

        classes = [f["classificacao"] for f in frags]
        assert "REGULARIZADO" not in classes
        assert "IRREGULAR" in classes


# ── TC3: Precedência ASV > DERADSA ────────────────────────────────────────

class TestPrecedenciaAsvDeradsa:

    def test_autorizado_pleno_bloqueia_deradsa(self):
        """ASV ≥ 99% → AUTORIZADO; DERADSA não deve gerar REGULARIZADO."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        asv = _asv_gdf(sq(0, 0, 1000, 1000))         # 100% da área
        deradsa = _deradsa_gdf(sq(0, 0, 1000, 1000))  # DERADSA também disponível
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, asv, "nu_autoriz", {2024: deradsa}, None)

        assert len(frags) == 1
        assert frags[0]["classificacao"] == "AUTORIZADO"

    def test_asv_parcial_com_deradsa_no_residual(self):
        """ASV 50% → AUTORIZADO_PARCIALMENTE; DERADSA no resíduo → REGULARIZADO."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        asv = _asv_gdf(sq(0, 0, 500, 1000))              # 50% da área
        deradsa = _deradsa_gdf(sq(500, 0, 800, 1000))     # cobre parte do resíduo
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, asv, "nu_autoriz", {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        assert "AUTORIZADO_PARCIALMENTE" in classes
        assert "REGULARIZADO" in classes

    def test_asv_parcial_sem_deradsa_gera_irregular(self):
        """ASV 50% → AUTORIZADO_PARCIALMENTE + IRREGULAR residual (sem DERADSA)."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        asv = _asv_gdf(sq(0, 0, 500, 1000))
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, asv, "nu_autoriz", {2024: _empty_der_gdf()}, None)

        classes = [f["classificacao"] for f in frags]
        assert "AUTORIZADO_PARCIALMENTE" in classes
        assert "IRREGULAR" in classes
        assert "REGULARIZADO" not in classes

    def test_limiar_exato_99_pct_eh_autorizado(self):
        """ASV com exatamente 99% de cobertura → AUTORIZADO (não AUTORIZADO_PARCIALMENTE)."""
        alert = _alert_gdf(sq(0, 0, 1000, 1000))   # 1_000_000 m²
        asv = _asv_gdf(sq(0, 0, 990, 1000))          # 990_000 m² = exatamente 99%
        clf = AlertClassifier(
            anos=(2024,), anos_deradsa=(2024,), threshold=THRESHOLD_AUTORIZADO
        )
        frags = clf.classify(alert, asv, "nu_autoriz", {2024: _empty_der_gdf()}, None)

        classes = [f["classificacao"] for f in frags]
        assert "AUTORIZADO" in classes
        assert "AUTORIZADO_PARCIALMENTE" not in classes


# ── TC4: safe_difference falha → sem violação de precedência ──────────────

class TestSafeDifferenceFailureNoPrecedenceViolation:

    def test_diff_falha_nao_vaza_deradsa_na_area_asv(self, monkeypatch):
        """Se safe_difference retorna None (falha), DERADSA não processa área ASV."""
        import modules.alertas_mapbiomas.classify as cls_mod

        # Simula falha da diferença geométrica (ex: TopologyException)
        monkeypatch.setattr(cls_mod, "safe_difference", lambda *a, **kw: None)

        alert = _alert_gdf(sq(0, 0, 1000, 1000))
        asv = _asv_gdf(sq(0, 0, 500, 1000))               # 50% → AUTORIZADO_PARCIALMENTE
        deradsa = _deradsa_gdf(sq(0, 0, 1000, 1000))       # DERADSA cobre 100%
        clf = AlertClassifier(anos=(2024,), anos_deradsa=(2024,))
        frags = clf.classify(alert, asv, "nu_autoriz", {2024: deradsa}, None)

        classes = [f["classificacao"] for f in frags]
        # DERADSA não invadiu — sem violação de precedência
        assert "REGULARIZADO" not in classes
        assert "AUTORIZADO_PARCIALMENTE" in classes
