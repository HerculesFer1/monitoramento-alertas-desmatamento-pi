"""
pipeline/classify.py — Etapa 5: Fragmentação e classificação espacial.

AlertClassifier encapsula o algoritmo de classificação em 4 classes:
  AUTORIZADO | AUTORIZADO_PARCIALMENTE | REGULARIZADO | IRREGULAR

Metodologia (irrevogável — cf. CLAUDE.md § 4):
  Passo 1: Interseção alerta × ASVs válidas (temporalmente)
  Passo 2: DERADSA aplicada somente no residual pós-ASV
  Passo 3: Residual restante → IRREGULAR

Precedência: ASV > DERADSA. NUNCA inverter.
"""
from __future__ import annotations

import itertools
import logging
from typing import Optional

import geopandas as gpd
import pandas as pd

from core.constants import (
    ANOS,
    ANOS_DERADSA,
    CRS_CALC,
    MIN_AREA_M2,
    SUFIXO_CLASSE,
    THRESHOLD_AUTORIZADO,
)
from core.spatial_core import (
    assert_projected_crs,
    dissolve_safe,
    safe_difference,
    safe_intersection,
)
from core.utils import strip_tz

log = logging.getLogger(__name__)


class AlertClassifier:
    """Classifica alertas de desmatamento em fragmentos geoespaciais.

    Args:
        threshold: Cobertura mínima ASV para AUTORIZADO (padrão 0.99).
        min_area_m2: Área mínima de fragmento em m² (padrão 1.0).
        anos: Tuple de anos a processar.
        anos_deradsa: Subset de anos com dados DERADSA disponíveis.
    """

    def __init__(
        self,
        threshold:    float = THRESHOLD_AUTORIZADO,
        min_area_m2:  float = MIN_AREA_M2,
        anos:         tuple[int, ...] = ANOS,
        anos_deradsa: tuple[int, ...] = ANOS_DERADSA,
    ) -> None:
        self.threshold    = threshold
        self.min_area_m2  = min_area_m2
        self.anos         = anos
        self.anos_deradsa = anos_deradsa
        self._counter     = itertools.count(1)

    # ── API pública ───────────────────────────────────────────────────────

    def classify(
        self,
        gdf_al:   gpd.GeoDataFrame,  # alertas parseados (saída de parsers.parse_alertas)
        asv_base: gpd.GeoDataFrame,   # ASVs filtradas (saída de parsers.build_asv_base)
        asv_id_col: Optional[str],
        der_by_year: dict[int, gpd.GeoDataFrame],  # {2024: gdf_der24, 2025: gdf_der25}
        der_id_col: Optional[str],
    ) -> list[dict]:
        """Executa a fragmentação para todos os anos. Retorna lista de dicts (fragmentos)."""
        all_frags: list[dict] = []
        log.info("  Limiar AUTORIZADO: %d%%", int(self.threshold * 100))
        log.info("  Precedência: ASV > DERADSA")

        # C2 da auditoria GIS — garante CRS projetado antes do filtro MIN_AREA_M2.
        # Sem isso, qualquer regressão futura passando CRS geográfico descartaria
        # silenciosamente polígonos correspondentes a ~12.000 km² como "artefato".
        if not gdf_al.empty:
            assert_projected_crs(gdf_al, "classify/alertas")
        if not asv_base.empty:
            assert_projected_crs(asv_base, "classify/asvs")
        for ano, gdf_der in der_by_year.items():
            if not gdf_der.empty:
                assert_projected_crs(gdf_der, f"classify/deradsa_{ano}")

        for year in self.anos:
            all_frags.extend(
                self._classify_year(
                    gdf_al, asv_base, asv_id_col,
                    der_by_year.get(year, gpd.GeoDataFrame(geometry=[], crs=CRS_CALC)),
                    der_id_col, year,
                )
            )

        log.info("  Fragmentação concluída: %d fragmentos", len(all_frags))
        return all_frags

    # ── Nível ANO ─────────────────────────────────────────────────────────

    def _classify_year(
        self,
        gdf_al:    gpd.GeoDataFrame,
        asv_base:  gpd.GeoDataFrame,
        asv_id_col: Optional[str],
        der_yr:    gpd.GeoDataFrame,
        der_id_col: Optional[str],
        year:      int,
    ) -> list[dict]:
        al_yr = gdf_al[gdf_al["ANODETEC"] == year].copy()
        log.info("  Ano %d: %d alertas | %d DERADSAs %s",
                 year, len(al_yr), len(der_yr),
                 "(Série B)" if year in self.anos_deradsa else "(Série A)")

        # Dissolve único das DERADSAs do ano (sem restrição temporal: são instrumentos permanentes)
        union_der = dissolve_safe(der_yr, f"der_{year}") if not der_yr.empty else None

        der_ids_str: Optional[str] = None
        if der_id_col and der_id_col in der_yr.columns and not der_yr.empty:
            der_ids_str = ",".join(der_yr[der_id_col].astype(str).tolist()[:10])
        elif not der_yr.empty:
            der_ids_str = f"DERADSA_{year}"

        frags: list[dict] = []
        for bioma in al_yr["BIOMA"].dropna().unique():
            frags.extend(
                self._classify_biome(
                    al_yr[al_yr["BIOMA"].str.lower() == bioma.lower()].copy(),
                    asv_base[asv_base["bioma_pamg"].str.lower() == bioma.lower()].copy(),
                    asv_id_col,
                    union_der, der_ids_str,
                    year, bioma,
                )
            )
        return frags

    # ── Nível BIOMA ───────────────────────────────────────────────────────

    def _classify_biome(
        self,
        al_b:       gpd.GeoDataFrame,
        asv_b:      gpd.GeoDataFrame,
        asv_id_col: Optional[str],
        union_der:  Optional[object],
        der_ids_str: Optional[str],
        year: int,
        bioma: str,
    ) -> list[dict]:
        log.info("    Bioma %s: %d alertas × %d ASVs", bioma, len(al_b), len(asv_b))

        al_b = al_b.copy()
        al_b["_det_norm"] = strip_tz(pd.to_datetime(al_b["DATADETEC"], errors="coerce"))

        frags: list[dict] = []

        # Alertas sem data de detecção → IRREGULAR direto (sem cruzamento espacial)
        sem_data = al_b[al_b["_det_norm"].isna()]
        if not sem_data.empty:
            log.warning("      %d alertas sem DATADETEC → IRREGULAR", len(sem_data))
            for _, row in sem_data.iterrows():
                frags.extend(self._make_irregular_no_date(row))

        # Alertas com data de detecção: agrupar por data (otimização de dissolve)
        al_com = al_b[al_b["_det_norm"].notna()].copy()
        unique_dates = al_com["_det_norm"].unique()
        log.info("      %d alertas com data → %d datas únicas", len(al_com), len(unique_dates))

        for det_date in unique_dates:
            al_dt = al_com[al_com["_det_norm"] == det_date]
            det_ts = pd.Timestamp(det_date)

            # Filtro temporal fino: dt_valid_i ≤ DATADETEC ≤ dt_valid_f
            asv_valid = (
                asv_b[(asv_b["_dti"] <= det_ts) & (asv_b["_dtf"] >= det_ts)].copy()
                if not asv_b.empty else gpd.GeoDataFrame(geometry=[], crs=CRS_CALC)
            )
            union_asv, asv_ids_str, dtf_str = self._prepare_asv_union(
                asv_valid, asv_id_col, year, bioma, det_date
            )

            for _, al_row in al_dt.iterrows():
                frags.extend(
                    self._classify_single_alert(
                        al_row, union_asv, union_der,
                        asv_ids_str, dtf_str, der_ids_str,
                    )
                )

        return frags

    # ── Nível ALERTA ──────────────────────────────────────────────────────

    def _classify_single_alert(
        self,
        al_row:      pd.Series,
        union_asv:   Optional[object],
        union_der:   Optional[object],
        asv_ids_str: Optional[str],
        dtf_str:     Optional[str],
        der_ids_str: Optional[str],
    ) -> list[dict]:
        """Classifica um alerta individual em 1-3 fragmentos."""
        alert_geom = al_row.geometry
        if alert_geom is None or alert_geom.is_empty:
            return []

        # Guarda explícita: `or` falha se _area_m2_orig == 0 (valor falsy mas válido).
        # None → não calculado; 0 → artefato geométrico; ambos recaem em area da geometria.
        alert_area = al_row.get("_area_m2_orig")
        if alert_area is None or alert_area <= 0:
            alert_area = alert_geom.area
        if alert_area <= 0:
            return []  # geometria degenerada (linha/ponto) — evita divisão por zero

        codeal   = al_row.get("CODEALERTA", f"AL_{id(al_row)}")
        base_row = al_row.to_dict()
        frags: list[dict] = []
        remaining = alert_geom

        # Passo 1 — ASV (temporalmente válida)
        if union_asv is not None:
            frag_asv = safe_intersection(remaining, union_asv, f"{codeal}/asv")
            if frag_asv is not None and frag_asv.area > 0:
                pct = min(frag_asv.area / alert_area, 1.0)

                if pct >= self.threshold:
                    frags.append(self._make_frag(
                        base_row, alert_geom, codeal,
                        "AUTORIZADO", pct, "ASV", asv_ids_str, dtf_str,
                    ))
                    remaining = None
                else:
                    frags.append(self._make_frag(
                        base_row, frag_asv, codeal,
                        "AUTORIZADO_PARCIALMENTE", pct, "ASV", asv_ids_str, dtf_str,
                    ))
                    remaining = safe_difference(alert_geom, union_asv, f"{codeal}/diff_asv")

        # Passo 2 — DERADSA no residual (precedência após ASV)
        if remaining is not None and union_der is not None:
            frag_der = safe_intersection(remaining, union_der, f"{codeal}/der")
            if frag_der is not None and frag_der.area > 0:
                pct_der = min(frag_der.area / alert_area, 1.0)
                frags.append(self._make_frag(
                    base_row, frag_der, codeal,
                    "REGULARIZADO", pct_der, "DERADSA", der_ids_str, None,
                ))
                remaining = safe_difference(remaining, union_der, f"{codeal}/diff_der")

        # Passo 3 — Residual → IRREGULAR
        if remaining is not None and remaining.area >= self.min_area_m2:
            pct_irr = min(remaining.area / alert_area, 1.0)
            frags.append(self._make_frag(
                base_row, remaining, codeal,
                "IRREGULAR", pct_irr, "SEM_INSTRUMENTO", None, None,
            ))

        return frags

    # ── Helpers internos ──────────────────────────────────────────────────

    def _next_id(self) -> int:
        return next(self._counter)

    def _make_frag(
        self,
        base_row:    dict,
        geometry:    object,
        codeal:      str,
        classe:      str,
        pct_cob:     float,
        fonte:       str,
        instrumento: Optional[str],
        validade:    Optional[str],
    ) -> dict:
        fid = self._next_id()
        sufixo = SUFIXO_CLASSE[classe]
        return {
            **base_row,
            "geometry":                  geometry,
            "id_fragmento":              f"{codeal}_{sufixo}_{fid:06d}",
            "classificacao":             classe,
            "pct_cobertura":             round(pct_cob * 100, 2),
            "fonte_classificacao":       fonte,
            "instrumento_ref":           instrumento,
            "data_validade_instrumento": validade,
        }

    def _make_irregular_no_date(self, al_row: pd.Series) -> list[dict]:
        """Alerta sem DATADETEC → IRREGULAR sem cruzamento espacial.

        pct_cobertura = 0.0 (nenhum instrumento cobre a área — não confundir com
        cobertura total, que seria 100%). Alertas sem data não podem receber
        validação temporal de ASV, portanto não há cobertura instrumental.
        """
        codeal = al_row.get("CODEALERTA", f"AL_{id(al_row)}")
        fid    = self._next_id()
        row    = al_row.to_dict()
        row.update({
            "id_fragmento":              f"{codeal}_IRR_{fid:06d}",
            "classificacao":             "IRREGULAR",
            "pct_cobertura":             0.0,   # 0% de cobertura por instrumento
            "fonte_classificacao":       "SEM_INSTRUMENTO",
            "instrumento_ref":           None,
            "data_validade_instrumento": None,
        })
        return [row]

    @staticmethod
    def _prepare_asv_union(
        asv_valid:  gpd.GeoDataFrame,
        asv_id_col: Optional[str],
        year:       int,
        bioma:      str,
        det_date,
    ) -> tuple[Optional[object], Optional[str], Optional[str]]:
        """Dissolve ASVs válidas e extrai IDs/validade para rastreabilidade."""
        union_asv = dissolve_safe(asv_valid, f"asv_{year}/{bioma}/{det_date}") \
                    if not asv_valid.empty else None

        if asv_id_col and asv_id_col in asv_valid.columns and not asv_valid.empty:
            asv_ids_str = ",".join(asv_valid[asv_id_col].astype(str).tolist()[:10])
            dtf_max     = asv_valid["_dtf"].max()
            dtf_str     = (str(dtf_max.date())
                           if pd.notna(dtf_max) and hasattr(dtf_max, "date") else None)
        elif not asv_valid.empty:
            asv_ids_str = f"ASV_{year}_{bioma}"
            dtf_str     = None
        else:
            asv_ids_str = None
            dtf_str     = None

        return union_asv, asv_ids_str, dtf_str
