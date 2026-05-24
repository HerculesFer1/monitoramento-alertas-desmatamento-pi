"""
pipeline/aggregate.py — Etapas 9 e 10: IBGE + Agregação municipal.

aggregate_municipal() produz a lista de dicts que alimenta
agregado_municipios.json e a tabela Supabase de mesmo nome.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
import requests

from core.constants import ANOS_DERADSA, VP_PTBR

log = logging.getLogger(__name__)


def _safe_pct(num: float, ha_tot: float) -> float:
    return round(num / ha_tot * 100, 1) if ha_tot > 0 else 0.0

_IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/22"
    "?formato=application/vnd.geo+json&resolucao=5"
)


def download_municipios_ibge(out_path: Path, timeout: int = 60) -> Path:
    """Baixa a malha municipal do Piauí via API IBGE. Reutiliza arquivo se já existir."""
    if out_path.exists():
        log.info("  %s já existe — reutilizando", out_path.name)
        return out_path
    log.info("  Baixando malha municipal IBGE: %s", _IBGE_URL)
    try:
        r = requests.get(_IBGE_URL, timeout=timeout)
        r.raise_for_status()
        out_path.write_bytes(r.content)
        log.info("  → %s (%d KB)", out_path.name, out_path.stat().st_size // 1024)
    except Exception as exc:
        log.warning("  Download IBGE falhou: %s", exc)
    return out_path


def aggregate_municipal(gdf_out: gpd.GeoDataFrame) -> list[dict]:
    """Agrega fragmentos por município × ano para o dashboard.

    Retorna lista de dicts com todas as colunas do schema agregado_municipios.
    """
    # Pré-computar anos com IRREGULAR por município (evita O(grupos × n) por grupo)
    irr_anos_por_mun: dict[str, list[int]] = (
        gdf_out[gdf_out["classificacao"] == "IRREGULAR"]
        .groupby("municipio")["ano"]
        .apply(lambda s: sorted(s.unique().tolist()))
        .to_dict()
    )

    # Operar sem geometria (mais eficiente)
    tab = pd.DataFrame(gdf_out.drop(columns="geometry"))

    agg_rows: list[dict] = []
    for (mun, ano), grp in tab.groupby(["municipio", "ano"]):
        ano = int(ano)

        ha_irr  = float(grp[grp["classificacao"] == "IRREGULAR"              ]["area_ha"].sum())
        ha_aut  = float(grp[grp["classificacao"] == "AUTORIZADO"             ]["area_ha"].sum())
        ha_autp = float(grp[grp["classificacao"] == "AUTORIZADO_PARCIALMENTE"]["area_ha"].sum())
        ha_reg  = float(grp[grp["classificacao"] == "REGULARIZADO"           ]["area_ha"].sum())
        ha_autt = ha_aut + ha_autp
        ha_tot  = ha_irr + ha_aut + ha_autp + ha_reg

        bioma_pred = (
            grp["bioma"].mode().iloc[0]
            if "bioma" in grp.columns and not grp["bioma"].mode().empty else ""
        )
        vp_dom = (
            grp["vpressao"].mode().iloc[0]
            if "vpressao" in grp.columns and not grp["vpressao"].mode().empty else ""
        )

        def_med: Optional[float] = None
        if "dias_ate_publicacao" in grp.columns:
            d = grp["dias_ate_publicacao"].dropna()
            if not d.empty:
                def_med = round(float(d.mean()), 1)

        agg_rows.append({
            # Identificação
            "municipio":                   str(mun),
            "ano":                         ano,
            "bioma_predominante":          bioma_pred,
            "matopiba":                    bool(grp["matopiba"].any()),
            "serie_b":                     ano in ANOS_DERADSA,
            # Áreas por classe (ha)
            "ha_irregular":                round(ha_irr,  2),
            "ha_autorizado":               round(ha_aut,  2),
            "ha_autorizado_parcialmente":  round(ha_autp, 2),
            "ha_autorizado_total":         round(ha_autt, 2),
            "ha_regularizado":             round(ha_reg,  2),
            "ha_total":                    round(ha_tot,  2),
            # Percentuais
            "pct_irregular":               _safe_pct(ha_irr,  ha_tot),
            "pct_autorizado":              _safe_pct(ha_aut,  ha_tot),
            "pct_autorizado_parcialmente": _safe_pct(ha_autp, ha_tot),
            "pct_autorizado_total":        _safe_pct(ha_autt, ha_tot),
            "pct_regularizado":            _safe_pct(ha_reg,  ha_tot),
            # Indicadores
            "num_alertas":                 int(grp["codealerta"].nunique()) if "codealerta" in grp.columns else 0,
            "vpressao_dominante":          str(vp_dom),
            "vpressao_dominante_ptbr":     VP_PTBR.get(str(vp_dom), str(vp_dom)),
            "reincidente":                 bool(grp["reincidente"].any()),
            "anos_com_alerta_irregular":   irr_anos_por_mun.get(str(mun), []),
            "defasagem_media_dias":        def_med,
        })

    log.info("  Agregado gerado: %d registros município×ano", len(agg_rows))
    return agg_rows


def aggregate_resumo_estatico(gdf_out: gpd.GeoDataFrame) -> dict:
    """Gera resumo estático completo para o frontend.

    Substitui os dados hardcoded em constants.ts quando escrito em
    frontend/public/data/resumo_estatico.json pelo __main__.py.
    """
    tab = pd.DataFrame(gdf_out.drop(columns="geometry"))
    anos = sorted(int(a) for a in tab["ano"].dropna().unique())

    alert_yr:    dict = {}
    classif_yr:  dict = {}
    ipi_yr:      dict = {}
    matopiba_yr: dict = {}

    for ano in anos:
        sub      = tab[tab["ano"] == ano]
        area_tot = float(sub["area_ha"].sum())
        irr      = float(sub[sub["classificacao"] == "IRREGULAR"]["area_ha"].sum())
        aut      = float(sub[sub["classificacao"] == "AUTORIZADO"]["area_ha"].sum())
        autp     = float(sub[sub["classificacao"] == "AUTORIZADO_PARCIALMENTE"]["area_ha"].sum())
        reg      = float(sub[sub["classificacao"] == "REGULARIZADO"]["area_ha"].sum())
        cerrado  = float(sub[sub["bioma"].str.lower().fillna("") == "cerrado"]["area_ha"].sum())
        caatinga = float(sub[sub["bioma"].str.lower().fillna("") == "caatinga"]["area_ha"].sum())

        alert_yr[ano] = {
            "count":    int(sub["codealerta"].nunique()) if "codealerta" in sub.columns else 0,
            "area":     round(area_tot, 2),
            "cerrado":  round(cerrado,  2),
            "caatinga": round(caatinga, 2),
        }
        classif_yr[ano] = {
            "irregular":    round(irr,  2),
            "autorizado":   round(aut,  2),
            "autorizado_p": round(autp, 2),
            "regularizado": round(reg,  2),
        }
        ipi_yr[ano] = round(irr / area_tot * 100, 1) if area_tot > 0 else 0.0

        irr_sub = sub[sub["classificacao"] == "IRREGULAR"]
        if "matopiba" in irr_sub.columns:
            mat_irr  = float(irr_sub[irr_sub["matopiba"] == True]["area_ha"].sum())   # noqa: E712
            rest_irr = float(irr_sub[irr_sub["matopiba"] != True]["area_ha"].sum())   # noqa: E712
        else:
            mat_irr, rest_irr = 0.0, 0.0
        matopiba_yr[ano] = {"mat": round(mat_irr, 2), "rest": round(rest_irr, 2)}

    # Top 20 municípios por área total acumulada
    mun_tot  = tab.groupby("municipio")["area_ha"].sum().sort_values(ascending=False)
    top20    = [[m, round(float(v), 2)] for m, v in mun_tot.head(20).items()]

    # ha_irregular por município (todos)
    mun_irr_s    = (
        tab[tab["classificacao"] == "IRREGULAR"]
        .groupby("municipio")["area_ha"].sum()
    )
    mun_irr_real = {m: round(float(v), 2) for m, v in mun_irr_s.items()}

    # Bioma dominante por município
    mun_biome = (
        tab.groupby("municipio")["bioma"]
        .agg(lambda s: str(s.mode().iloc[0]) if not s.mode().empty else "Cerrado")
        .to_dict()
    )

    # PRODES summary (desduplicado por codealerta, somente alertas Cerrado)
    prodes_summary: Optional[dict] = None
    has_prodes = (
        "flag_validacao_externa" in tab.columns
        and "ano_prodes_ref" in tab.columns
        and tab["flag_validacao_externa"].notna().any()
    )
    if has_prodes:
        pr = (
            tab[tab["bioma"].str.lower().fillna("") == "cerrado"]
            [["codealerta", "ano_prodes_ref", "flag_validacao_externa", "concordancia_prodes_pct"]]
            .drop_duplicates(subset=["codealerta"])
        )
        ciclos: dict = {}
        for ciclo_raw in sorted(pr["ano_prodes_ref"].dropna().astype(int).unique()):
            ciclo = int(ciclo_raw)
            c_sub  = pr[pr["ano_prodes_ref"] == ciclo]
            validos = c_sub[c_sub["flag_validacao_externa"].isin(["CONCORDANTE", "DISCORDANTE"])]
            conc   = int((validos["flag_validacao_externa"] == "CONCORDANTE").sum())
            disc   = int((validos["flag_validacao_externa"] == "DISCORDANTE").sum())
            n      = conc + disc
            ciclos[ciclo] = {
                "n": n, "concordantes": conc, "discordantes": disc,
                "pct": round(conc / n * 100, 1) if n > 0 else 0.0,
            }
        sem      = int((pr["flag_validacao_externa"] == "SEM_PRODES_NO_CICLO").sum())
        tot_val  = sum(v["n"]            for v in ciclos.values())
        tot_conc = sum(v["concordantes"] for v in ciclos.values())
        prodes_summary = {
            "ciclos":            ciclos,
            "totalValidados":    tot_val,
            "totalConcordantes": tot_conc,
            "totalDiscordantes": tot_val - tot_conc,
            "semProdes":         sem,
        }
        log.info("  PRODES summary: %d ciclos | %d validados | %d concordantes",
                 len(ciclos), tot_val, tot_conc)

    # ── prodesExtra: análises complementares PRODES para o frontend ─────────
    prodes_extra: Optional[dict] = None
    has_prodes_full = (
        has_prodes
        and "concordancia_prodes_pct" in tab.columns
        and "vpressao_ptbr" in tab.columns
    )
    if has_prodes_full:
        # Cerrado fragmentos com dados PRODES (desduplicado por codealerta)
        pr_full = (
            tab[tab["bioma"].str.lower().fillna("") == "cerrado"]
            [["codealerta", "ano", "ano_prodes_ref", "flag_validacao_externa",
              "concordancia_prodes_pct", "municipio", "area_ha", "vpressao_ptbr"]]
            .drop_duplicates(subset=["codealerta"])
        )
        # Caatinga irregular (sem PRODES equivalente)
        caatinga_irr = tab[
            (tab["bioma"].str.lower().fillna("") == "caatinga")
            & (tab["classificacao"] == "IRREGULAR")
        ]

        # irrAnual — área irregular por ano de detecção (fragmentos IRREGULAR)
        irr_tab = tab[tab["classificacao"] == "IRREGULAR"]
        anos_det = sorted(int(a) for a in irr_tab["ano"].dropna().unique())
        irr_anos, irr_confirmado, irr_discordante, irr_caatinga, irr_sem_prodes = [], [], [], [], []
        for a in anos_det:
            irr_anos.append(a)
            irr_confirmado.append(round(float(
                irr_tab[
                    (irr_tab["ano"] == a)
                    & (irr_tab["bioma"].str.lower().fillna("") == "cerrado")
                    & (irr_tab["flag_validacao_externa"] == "CONCORDANTE")
                ]["area_ha"].sum()
            ), 2))
            irr_discordante.append(round(float(
                irr_tab[
                    (irr_tab["ano"] == a)
                    & (irr_tab["bioma"].str.lower().fillna("") == "cerrado")
                    & (irr_tab["flag_validacao_externa"] == "DISCORDANTE")
                ]["area_ha"].sum()
            ), 2))
            irr_caatinga.append(round(float(
                caatinga_irr[caatinga_irr["ano"] == a]["area_ha"].sum()
            ), 2))
            irr_sem_prodes.append(round(float(
                irr_tab[
                    (irr_tab["ano"] == a)
                    & (irr_tab["bioma"].str.lower().fillna("") == "cerrado")
                    & (irr_tab["flag_validacao_externa"] == "SEM_PRODES_NO_CICLO")
                ]["area_ha"].sum()
            ), 2))

        # distCob — distribuição de cobertura PRODES por faixa (6 buckets)
        COB_LABELS = ["0%", "1–24%", "25–49%", "50–74%", "75–89%", "90–100%"]
        def _bucket(pct: float) -> int:
            if pct <= 0:
                return 0
            if pct < 25:
                return 1
            if pct < 50:
                return 2
            if pct < 75:
                return 3
            if pct < 90:
                return 4
            return 5
        pr_val = pr_full[pr_full["flag_validacao_externa"].isin(["CONCORDANTE", "DISCORDANTE"])].copy()
        pr_val["_bucket"] = pr_val["concordancia_prodes_pct"].fillna(0).apply(_bucket)
        dist_n, dist_ha = [], []
        for b in range(6):
            g = pr_val[pr_val["_bucket"] == b]
            # soma de ha_total do alerta original (área_ha do fragmento IRREGULAR)
            irr_g = irr_tab[irr_tab["codealerta"].isin(g["codealerta"])]
            dist_n.append(int(len(g)))
            dist_ha.append(round(float(irr_g["area_ha"].sum()), 2))

        # mediaCob — cobertura média PRODES por ciclo (alertas CONCORDANTE)
        conc_pr = pr_full[pr_full["flag_validacao_externa"] == "CONCORDANTE"]
        media_cob: dict = {}
        for ciclo_raw in sorted(pr_full["ano_prodes_ref"].dropna().astype(int).unique()):
            ciclo = int(ciclo_raw)
            c_conc = conc_pr[conc_pr["ano_prodes_ref"] == ciclo]["concordancia_prodes_pct"].dropna()
            media_cob[ciclo] = round(float(c_conc.mean()), 1) if not c_conc.empty else 0.0

        # topMun — top 10 municípios por área irregular PRODES-confirmada (Cerrado)
        mun_conc = (
            irr_tab[
                (irr_tab["bioma"].str.lower().fillna("") == "cerrado")
                & (irr_tab["flag_validacao_externa"] == "CONCORDANTE")
            ]
            .groupby("municipio")["area_ha"].sum()
            .sort_values(ascending=False)
            .head(10)
        )
        mun_tot_irr = (
            irr_tab[irr_tab["bioma"].str.lower().fillna("") == "cerrado"]
            .groupby("municipio")["area_ha"].sum()
        )
        top_mun = []
        for mun, conc_ha in mun_conc.items():
            tot_ha = float(mun_tot_irr.get(mun, conc_ha))
            top_mun.append({
                "mun":   str(mun),
                "conc":  round(float(conc_ha), 2),
                "total": round(tot_ha, 2),
                "pct":   round(conc_ha / tot_ha * 100) if tot_ha > 0 else 0,
            })

        # porVetor — concordância por vetor de pressão (português)
        por_vetor = []
        if "vpressao_ptbr" in pr_full.columns:
            for vp, grp in pr_full.groupby("vpressao_ptbr"):
                validos = grp[grp["flag_validacao_externa"].isin(["CONCORDANTE", "DISCORDANTE"])]
                n_val   = int(len(validos))
                n_conc  = int((validos["flag_validacao_externa"] == "CONCORDANTE").sum())
                if n_val > 0:
                    por_vetor.append({
                        "vp":   str(vp),
                        "n":    n_val,
                        "conc": n_conc,
                        "pct":  round(n_conc / n_val * 100, 1),
                    })
            por_vetor.sort(key=lambda d: d["n"], reverse=True)

        # haIrrConfirmado / pctIrrConfirmado
        # Denominador = TOTAL irregular (Cerrado + Caatinga, todos os anos).
        # Interpreta o KPI como: "% da área irregular total do PI confirmada
        # por PRODES-Cerrado". A Caatinga e alertas SEM_PRODES_NO_CICLO
        # entram no denominador mas NUNCA no numerador → métrica conservadora.
        # Para taxa de confirmação restrita ao Cerrado validável
        # (excl. Caatinga e SEM_PRODES), compute:
        #   ha_disponivel = sum(irr_confirmado) + sum(irr_discordante)
        #   pct_cerrado_disponivel = ha_irr_conc / ha_disponivel * 100
        ha_irr_conc = sum(irr_confirmado)
        ha_irr_total = float(irr_tab["area_ha"].sum())
        ha_irr_disponivel = ha_irr_conc + sum(irr_discordante)   # Cerrado c/ PRODES
        pct_irr_conc = round(ha_irr_conc / ha_irr_total * 100, 1) if ha_irr_total > 0 else 0.0
        pct_irr_cerrado_disp = round(ha_irr_conc / ha_irr_disponivel * 100, 1) if ha_irr_disponivel > 0 else 0.0

        prodes_extra = {
            "irrAnual": {
                "anos":       irr_anos,
                "confirmado": irr_confirmado,
                "discordante": irr_discordante,
                "caatinga":   irr_caatinga,
                "semProdes":  irr_sem_prodes,
            },
            "distCob": {
                "labels": COB_LABELS,
                "n":  dist_n,
                "ha": dist_ha,
            },
            "mediaCob":        media_cob,
            "topMun":          top_mun,
            "porVetor":        por_vetor,
            "haIrrConfirmado":       round(ha_irr_conc, 2),
            # % do total irregular PI (Cerrado + Caatinga) — denominador conservador
            "pctIrrConfirmado":      pct_irr_conc,
            # % do Cerrado irregular com PRODES disponível (excl. Caatinga e SEM_PRODES)
            "pctIrrCerradoDisponivel": pct_irr_cerrado_disp,
        }
        log.info("  PRODES extra: irrAnual %d anos | topMun %d | porVetor %d",
                 len(irr_anos), len(top_mun), len(por_vetor))

    result = {
        "alertYr":       alert_yr,
        "classifYr":     classif_yr,
        "ipiYr":         ipi_yr,
        "matopibaYr":    matopiba_yr,
        "top20":         top20,
        "munIrrReal":    mun_irr_real,
        "munBiome":      mun_biome,
        "prodesSummary": prodes_summary,
        "prodesExtra":   prodes_extra,
    }
    log.info("  Resumo estático gerado: %d anos | %d municípios", len(anos), len(mun_tot))
    return result


def aggregate_monthly(gdf_out: gpd.GeoDataFrame) -> dict[int, list[float]]:
    """Agrega área total alertada por ano × mês usando a data de detecção.

    Retorna {ano: [jan_ha, fev_ha, ..., dez_ha]}.
    Fragmentos sem datadetec são excluídos.
    """
    tab = pd.DataFrame(gdf_out.drop(columns="geometry"))

    if "datadetec" not in tab.columns or tab["datadetec"].isna().all():
        log.warning("aggregate_monthly: 'datadetec' ausente ou vazia — retornando vazio")
        return {}

    if not pd.api.types.is_datetime64_any_dtype(tab["datadetec"]):
        tab["datadetec"] = pd.to_datetime(tab["datadetec"], errors="coerce")

    tab = tab.dropna(subset=["datadetec"]).copy()
    if tab.empty:
        return {}

    tab["_mes"] = tab["datadetec"].dt.month.astype(int)
    tab["_ano"] = tab["ano"].astype(int)

    grp = tab.groupby(["_ano", "_mes"])["area_ha"].sum()

    result: dict[int, list[float]] = {}
    for ano in sorted(tab["_ano"].unique()):
        result[int(ano)] = [round(float(grp.get((ano, mes), 0.0)), 2) for mes in range(1, 13)]

    log.info("  Mensal gerado: %d anos × 12 meses", len(result))
    return result
