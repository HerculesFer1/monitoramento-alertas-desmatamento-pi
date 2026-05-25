"""
modules/alertas_mapbiomas/quality.py — Testes de qualidade T1-T9.

Cada teste é uma função pura que recebe o GeoDataFrame de saída e retorna
um TestResult. run_all_tests() executa a bateria completa.

Uso:
    from modules.alertas_mapbiomas.quality import run_all_tests
    report = run_all_tests(gdf_out, anos=[2022, 2023, 2024, 2025])
    if not report.all_passed:
        raise RuntimeError(report.summary())
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import geopandas as gpd
import numpy as np

log = logging.getLogger(__name__)


@dataclass
class TestResult:
    code: str        # ex: "T1"
    name: str        # descrição curta
    passed: bool
    detail: str = ""  # mensagem extra em caso de falha


@dataclass
class QualityReport:
    results: list[TestResult] = field(default_factory=list)

    @property
    def all_passed(self) -> bool:
        return all(r.passed for r in self.results)

    @property
    def n_passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def n_total(self) -> int:
        return len(self.results)

    def summary(self) -> str:
        lines = [f"Qualidade: {self.n_passed}/{self.n_total} testes OK"]
        for r in self.results:
            status = "✓" if r.passed else "✗"
            msg = f"  {status} {r.code} — {r.name}"
            if not r.passed:
                msg += f": {r.detail}"
            lines.append(msg)
        return "\n".join(lines)

    def log_all(self) -> None:
        for r in self.results:
            if r.passed:
                log.info("  %s OK — %s", r.code, r.name)
            else:
                log.error("  %s FALHOU — %s: %s", r.code, r.name, r.detail)


# ── Testes individuais ────────────────────────────────────────────────────

def _t1_unique_ids(gdf: gpd.GeoDataFrame) -> TestResult:
    n_dup = int(gdf["id_fragmento"].duplicated().sum())
    return TestResult(
        "T1", "id_fragmento únicos",
        passed=(n_dup == 0),
        detail=f"{n_dup} duplicatas" if n_dup else "",
    )


def _t2_classification_filled(gdf: gpd.GeoDataFrame) -> TestResult:
    n_null = int(gdf["classificacao"].isna().sum())
    return TestResult(
        "T2", "classificacao preenchida",
        passed=(n_null == 0),
        detail=f"{n_null} nulos" if n_null else "",
    )


def _t3_pct_cobertura_range(gdf: gpd.GeoDataFrame) -> TestResult:
    vals = gdf["pct_cobertura"].dropna()
    n_bad = int(((vals < 0) | (vals > 100.1)).sum())
    return TestResult(
        "T3", "pct_cobertura em [0, 100]",
        passed=(n_bad == 0),
        detail=f"{n_bad} fora do intervalo" if n_bad else "",
    )


def _t4_autp_max_99(gdf: gpd.GeoDataFrame) -> TestResult:
    autp = gdf.loc[gdf["classificacao"] == "AUTORIZADO_PARCIALMENTE", "pct_cobertura"]
    # Usar >= 99 (não > 99.0): consistente com T5 que usa < 99.
    # AUTORIZADO_PARCIALMENTE deve ter pct < 99; >= 99 indica erro de classificação.
    n_bad = int((autp >= 99).sum()) if not autp.empty else 0
    return TestResult(
        "T4", "AUTORIZADO_PARCIALMENTE < 99%",
        passed=(n_bad == 0),
        detail=f"{n_bad} fragmentos com pct_cob >= 99%" if n_bad else "",
    )


def _t5_aut_min_99(gdf: gpd.GeoDataFrame) -> TestResult:
    aut = gdf.loc[gdf["classificacao"] == "AUTORIZADO", "pct_cobertura"]
    # AUTORIZADO deve ter pct >= 99 (limiar THRESHOLD_AUTORIZADO = 0.99).
    n_bad = int((aut < 99).sum()) if not aut.empty else 0
    return TestResult(
        "T5", "AUTORIZADO ≥ 99%",
        passed=(n_bad == 0),
        detail=f"{n_bad} fragmentos com pct_cob < 99%" if n_bad else "",
    )


def _t6_anos_presentes(gdf: gpd.GeoDataFrame, anos: tuple[int, ...]) -> TestResult:
    presentes = set(gdf["ano"].dropna().astype(int).unique())
    faltando = set(anos) - presentes
    return TestResult(
        "T6", "cobertura de todos os anos",
        passed=(not faltando),
        detail=f"ausentes: {sorted(faltando)}" if faltando else "",
    )


def _t7_volume_minimo(gdf: gpd.GeoDataFrame, anos: tuple[int, ...]) -> TestResult:
    vol = gdf.groupby("ano").size().to_dict()
    vazios = [a for a in anos if vol.get(a, 0) == 0]
    return TestResult(
        "T7", "volume mínimo por ano (≥1 fragmento)",
        passed=(not vazios),
        detail=f"anos sem fragmentos: {vazios}" if vazios else "",
    )


def _t8_regularizado_restrito(gdf: gpd.GeoDataFrame, anos_deradsa: tuple[int, ...]) -> TestResult:
    reg_anos = set(gdf.loc[gdf["classificacao"] == "REGULARIZADO", "ano"].unique())
    invalidos = reg_anos - set(anos_deradsa)
    return TestResult(
        "T8", f"REGULARIZADO restrito a {list(anos_deradsa)}",
        passed=(not invalidos),
        detail=f"anos inválidos: {sorted(invalidos)}" if invalidos else "",
    )


def _t9_reconciliacao_area(gdf: gpd.GeoDataFrame) -> TestResult:
    if "area_original_ha" not in gdf.columns:
        return TestResult("T9", "reconciliação de área", passed=True, detail="campo area_original_ha ausente — ignorado")

    grp = gdf.groupby("codealerta").agg(
        soma_ha=("area_ha", "sum"),
        area_orig=("area_original_ha", "first"),
    )
    grp["ratio"] = grp["soma_ha"] / grp["area_orig"].replace(0, np.nan)
    outliers = grp[(grp["ratio"] < 0.90) | (grp["ratio"] > 1.10)].dropna()
    n = len(outliers)
    amostras = outliers.index[:5].tolist() if n else []
    return TestResult(
        "T9", "reconciliação de área ±10%",
        passed=(n == 0),
        detail=f"{n} alertas com desvio >10%: {amostras}…" if n else "",
    )


# ── Bateria completa ──────────────────────────────────────────────────────

def run_all_tests(
    gdf: gpd.GeoDataFrame,
    anos: tuple[int, ...] = (2022, 2023, 2024, 2025),
    anos_deradsa: tuple[int, ...] = (2024, 2025),
) -> QualityReport:
    """Executa T1-T9 e retorna QualityReport com todos os resultados."""
    report = QualityReport(results=[
        _t1_unique_ids(gdf),
        _t2_classification_filled(gdf),
        _t3_pct_cobertura_range(gdf),
        _t4_autp_max_99(gdf),
        _t5_aut_min_99(gdf),
        _t6_anos_presentes(gdf, anos),
        _t7_volume_minimo(gdf, anos),
        _t8_regularizado_restrito(gdf, anos_deradsa),
        _t9_reconciliacao_area(gdf),
    ])
    report.log_all()
    return report
