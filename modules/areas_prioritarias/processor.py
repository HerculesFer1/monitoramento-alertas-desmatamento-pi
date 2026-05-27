"""
processor.py — Módulo areas_prioritarias
Cruzamento raster × vetor para quantificação de áreas.

Responsabilidades:
  1. Reprojetar todos os dados para SIRGAS 2000 Geographic (EPSG:4674)
  2. Rasterizar PRODES para grade do raster de prioridades
  3. Aplicar máscara florestal
  4. Cruzamento pixel-a-pixel: prioridade × cobertura × município
  5. Converter contagem de pixels → hectares
  6. Retornar dois GeoDataFrames: classes_municipio + municipios_resumo

Stateless — sem efeitos colaterais, sem I/O além dos paths recebidos.
Usa spatial_core.py para operações geométricas (fix_geoms, safe_intersection).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import geopandas as gpd
import rasterio
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.mask import mask as rasterio_mask
import pandas as pd
from shapely.geometry import box, mapping

from core.spatial_core import fix_geoms, safe_intersection

log = logging.getLogger(__name__)

# Projeção de trabalho — SIRGAS 2000 Geográfico
_CRS_WORK = "EPSG:4674"
# Projeção de upload — WGS84 (padrão do projeto)
_CRS_UPLOAD = "EPSG:4326"

# Classes válidas no raster de prioridades
_VALID_CLASSES = set(range(1, 17))  # 1 a 16

# Valor de pixel PRODES que indica desmatamento (verificar na fonte)
_PRODES_DEMAT_VALUE = 1


def process(
    prodes_path:     Path,
    municipios_path: Path,
    config:          dict[str, Any],
    ano:             int = 2024,
    verbose:         bool = False,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """
    Executa o cruzamento raster × vetor.

    Retorna:
        gdf_classes : GeoDataFrame — (municipio_cod, classe_prioridade, area_*_ha, ...)
        gdf_resumo  : GeoDataFrame — (municipio_cod, resumo por município + geom + bbox)
    """
    log.info("Iniciando processamento areas_prioritarias | ano=%s", ano)

    # ── 1. Carregar e validar dados vetoriais ────────────────────────────────
    municipios = _load_municipios(municipios_path)
    prodes     = _load_prodes(prodes_path)

    # ── 2. Abrir raster de prioridade como referência de grade ──────────────
    priority_path = Path(config["priority_raster"])
    forest_path   = Path(config["forest_mask"])

    _validate_raster_paths(priority_path, forest_path)

    with rasterio.open(priority_path) as src_prio:

        prio_crs   = src_prio.crs
        transform  = src_prio.transform
        out_shape  = (src_prio.height, src_prio.width)
        pixel_area = _calc_pixel_area_ha(transform, prio_crs)

        log.info("Raster prioridade: %s | shape=%s | pixel_area=%.6f ha | CRS=%s",
                 priority_path.name, out_shape, pixel_area, prio_crs)

        prio_data = src_prio.read(1)

        # Reprojetar vetores para o CRS do raster de prioridade
        municipios = municipios.to_crs(prio_crs)
        prodes     = prodes.to_crs(prio_crs)

        # Reprojetar máscara florestal para a grade do raster de prioridade
        forest_data = _load_forest_aligned(forest_path, src_prio)

        # ── 4. Rasterizar PRODES para grade do raster de prioridade ──────────
        prodes_raster = _rasterize_prodes(prodes, transform, out_shape)

        # ── 5. Processar cada município ───────────────────────────────────────
        records_classes = []
        records_resumo  = []

        total = len(municipios)
        for i, row in municipios.iterrows():
            mun_cod  = row["CD_MUN"]
            mun_nome = row["NM_MUN"]

            if verbose and i % 20 == 0:
                log.info("  Processando %s/%s — %s", i + 1, total, mun_nome)

            result = _process_municipio(
                geom         = row.geometry,
                mun_cod      = mun_cod,
                mun_nome     = mun_nome,
                prio_data    = prio_data,
                forest_data  = forest_data,
                prodes_raster= prodes_raster,
                transform    = transform,
                pixel_area   = pixel_area,
                ano          = ano,
            )

            if result is None:
                log.warning("Município ignorado (sem interseção): %s", mun_nome)
                continue

            records_classes.extend(result["classes"])
            records_resumo.append(result["resumo"])

    # ── 6. Montar DataFrames ──────────────────────────────────────────────────
    # gdf_classes é tabular — sem coluna de geometria
    gdf_classes = pd.DataFrame(records_classes)

    gdf_resumo  = gpd.GeoDataFrame(
        records_resumo,
        geometry="geom",
        crs=prio_crs,
    ).to_crs(_CRS_UPLOAD)

    # Adicionar bbox como coluna JSON para fitBounds no MapLibre GL
    gdf_resumo["bbox"] = gdf_resumo.geometry.apply(_geom_to_bbox)

    # ── 7. Validações pós-processamento ──────────────────────────────────────
    _validate_output(gdf_classes, gdf_resumo)

    log.info(
        "Processamento concluído: %d municípios, %d registros de classe",
        len(gdf_resumo), len(gdf_classes),
    )
    return gdf_classes, gdf_resumo


# ── Funções auxiliares ────────────────────────────────────────────────────────

def _load_municipios(path: Path) -> gpd.GeoDataFrame:
    """Carrega e valida municípios do Piauí."""
    gdf = gpd.read_file(path)
    gdf = fix_geoms(gdf, "municipios_ibge")

    required = {"CD_MUN", "NM_MUN"}
    missing = required - set(gdf.columns)
    if missing:
        raise ValueError(f"Colunas ausentes nos municípios IBGE: {missing}")

    # Filtrar Piauí se arquivo nacional
    if "SIGLA_UF" in gdf.columns:
        gdf = gdf[gdf["SIGLA_UF"] == "PI"].copy()

    if len(gdf) == 0:
        raise ValueError("Nenhum município do Piauí encontrado no shapefile IBGE.")

    log.info("Municípios carregados: %d", len(gdf))
    return gdf


def _load_prodes(path: Path) -> gpd.GeoDataFrame:
    """Carrega e valida dados PRODES."""
    gdf = gpd.read_file(path)
    gdf = fix_geoms(gdf, "prodes")
    log.info("PRODES carregado: %d feições", len(gdf))
    return gdf


def _validate_raster_paths(*paths: Path) -> None:
    for p in paths:
        if not p.exists():
            raise FileNotFoundError(f"Raster não encontrado: {p}")


def _load_forest_aligned(forest_path: Path, src_prio) -> np.ndarray:
    """
    Carrega máscara florestal reprojetada para a grade do raster de prioridade.
    Se já estiver na mesma grade, lê diretamente. Caso contrário usa rasterio.warp.
    """
    from rasterio.warp import reproject, Resampling

    with rasterio.open(forest_path) as src_forest:
        same_grid = (
            src_forest.crs  == src_prio.crs and
            src_forest.transform == src_prio.transform and
            src_forest.shape == src_prio.shape
        )
        if same_grid:
            return src_forest.read(1)

        log.info(
            "Reprojetando máscara florestal: %s → %s",
            src_forest.crs, src_prio.crs,
        )
        dst = np.zeros((src_prio.height, src_prio.width), dtype=src_forest.dtypes[0])
        reproject(
            source        = rasterio.band(src_forest, 1),
            destination   = dst,
            src_transform = src_forest.transform,
            src_crs       = src_forest.crs,
            dst_transform = src_prio.transform,
            dst_crs       = src_prio.crs,
            resampling    = Resampling.nearest,
            src_nodata    = src_forest.nodata,
            dst_nodata    = 0,
        )
        return dst


def _calc_pixel_area_ha(transform: Affine, crs) -> float:
    """
    Calcula área de um pixel em hectares.
    Para CRS geográficos (graus), estima via projeção equal-area.
    """
    import pyproj
    from pyproj import Transformer

    if crs.is_geographic:
        # Projeta para Albers Equal Area centrado no Piauí
        transformer = Transformer.from_crs(
            crs.to_epsg(),
            "ESRI:102033",  # South America Albers Equal Area Conic
            always_xy=True,
        )
        # Pega centro do pixel (0,0)
        x0, y0 = transform * (0, 0)
        x1, y1 = transform * (1, 1)
        x0p, y0p = transformer.transform(x0, y0)
        x1p, y1p = transformer.transform(x1, y1)
        pixel_area_m2 = abs((x1p - x0p) * (y1p - y0p))
    else:
        pixel_area_m2 = abs(transform.a * transform.e)

    return pixel_area_m2 / 10_000  # m² → ha


def _rasterize_prodes(
    prodes:     gpd.GeoDataFrame,
    transform:  Affine,
    out_shape:  tuple[int, int],
) -> np.ndarray:
    """
    Rasteriza feições PRODES para a grade do raster de prioridade.
    prodes deve estar no mesmo CRS do raster de prioridade.
    Pixels com desmatamento = 1, sem desmatamento = 0.
    """
    if len(prodes) == 0:
        log.warning("PRODES vazio — nenhuma feição de desmatamento.")
        return np.zeros(out_shape, dtype=np.uint8)

    shapes = [(mapping(geom), 1) for geom in prodes.geometry if geom is not None]

    if not shapes:
        return np.zeros(out_shape, dtype=np.uint8)

    return rasterize(
        shapes     = shapes,
        out_shape  = out_shape,
        transform  = transform,
        fill       = 0,
        dtype      = np.uint8,
        all_touched= False,
    )


def _process_municipio(
    geom,
    mun_cod:      str,
    mun_nome:     str,
    prio_data:    np.ndarray,
    forest_data:  np.ndarray,
    prodes_raster:np.ndarray,
    transform:    Affine,
    pixel_area:   float,
    ano:          int,
) -> dict | None:
    """
    Processa um município: clip dos rasters + contagem por classe.

    Retorna dict com 'classes' (list) e 'resumo' (dict), ou None se sem dados.
    """
    from rasterio.transform import rowcol

    # Bbox do município para clip eficiente
    minx, miny, maxx, maxy = geom.bounds
    row_min, col_min = rowcol(transform, minx, maxy, op=int)
    row_max, col_max = rowcol(transform, maxx, miny, op=int)

    # Garantir dentro dos limites do raster
    h, w = prio_data.shape
    row_min = max(0, row_min)
    col_min = max(0, col_min)
    row_max = min(h, row_max + 1)
    col_max = min(w, col_max + 1)

    if row_min >= row_max or col_min >= col_max:
        return None

    # Slices dos rasters para o bbox do município
    prio_clip   = prio_data   [row_min:row_max, col_min:col_max]
    forest_clip = forest_data [row_min:row_max, col_min:col_max]
    prodes_clip = prodes_raster[row_min:row_max, col_min:col_max]

    # Máscara geométrica do município (pixels dentro do polígono)
    clip_transform = Affine(
        transform.a, transform.b, transform.c + col_min * transform.a,
        transform.d, transform.e, transform.f + row_min * transform.e,
    )
    mun_mask = rasterize(
        shapes    = [(mapping(geom), 1)],
        out_shape = prio_clip.shape,
        transform = clip_transform,
        fill      = 0,
        dtype     = np.uint8,
    ).astype(bool)

    # Aplicar máscara do município
    prio_mun   = np.where(mun_mask, prio_clip,   0)
    forest_mun = np.where(mun_mask, forest_clip, 0)
    prodes_mun = np.where(mun_mask, prodes_clip, 0)

    # Contagem por classe
    classes_records = []
    area_floresta_total = 0.0
    area_desmat_total   = 0.0

    for classe in range(1, 17):
        mask_classe = (prio_mun == classe)
        if not mask_classe.any():
            continue

        # Dentro da classe: floresta (forest>0 AND prodes=0), desmat (prodes=1), nao_floresta
        # forest mask: 0=sem floresta, >0=floresta (valor 100 = cobertura total)
        mask_floresta    = mask_classe & (forest_mun > 0) & (prodes_mun == 0)
        mask_desmat      = mask_classe & (prodes_mun == 1)
        mask_nao_floresta = mask_classe & (forest_mun == 0) & (prodes_mun == 0)

        n_total     = int(mask_classe.sum())
        n_floresta  = int(mask_floresta.sum())
        n_desmat    = int(mask_desmat.sum())
        n_nao_flor  = int(mask_nao_floresta.sum())

        area_total    = round(n_total    * pixel_area, 4)
        area_floresta = round(n_floresta * pixel_area, 4)
        area_desmat   = round(n_desmat   * pixel_area, 4)
        area_nao_flor = round(n_nao_flor * pixel_area, 4)

        pct_floresta = round(n_floresta / n_total * 100, 2) if n_total > 0 else 0.0
        pct_desmat   = round(n_desmat   / n_total * 100, 2) if n_total > 0 else 0.0

        classes_records.append({
            "municipio_cod":       mun_cod,
            "municipio_nome":      mun_nome,
            "uf":                  "PI",
            "classe_prioridade":   int(classe),
            "area_total_ha":       area_total,
            "area_floresta_ha":    area_floresta,
            "area_desmat_ha":      area_desmat,
            "area_nao_floresta_ha":area_nao_flor,
            "pct_floresta":        pct_floresta,
            "pct_desmat":          pct_desmat,
            "agb_medio_tc_ha":     None,  # preenchido por calculator.py
            "biomassa_total_tc":   None,  # preenchido por calculator.py
            "ano_prodes":          ano,
        })

        area_floresta_total += area_floresta
        area_desmat_total   += area_desmat

    if not classes_records:
        return None

    area_total_mun    = sum(r["area_total_ha"] for r in classes_records)
    floresta_records  = [r for r in classes_records if r["area_floresta_ha"] > 0]
    classe_max        = min(r["classe_prioridade"] for r in floresta_records) if floresta_records else None

    resumo = {
        "municipio_cod":        mun_cod,
        "municipio_nome":       mun_nome,
        "uf":                   "PI",
        "classe_max_prioridade":classe_max,
        "area_total_ha":        round(area_total_mun, 4),
        "area_floresta_ha":     round(area_floresta_total, 4),
        "area_desmat_ha":       round(area_desmat_total, 4),
        "pct_floresta_estado":  None,  # calculado após todos municípios
        "biomassa_floresta_tc": None,  # preenchido por calculator.py
        "geom":                 geom,
        "bbox":                 None,  # preenchido após to_crs
        "ano_prodes":           ano,
    }

    return {"classes": classes_records, "resumo": resumo}


def _geom_to_bbox(geom) -> list:
    """Converte geometria para [[minX,minY],[maxX,maxY]] para MapLibre fitBounds."""
    b = geom.bounds
    return [[b[0], b[1]], [b[2], b[3]]]


def _validate_output(
    gdf_classes: gpd.GeoDataFrame,
    gdf_resumo:  gpd.GeoDataFrame,
) -> None:
    """Validações críticas pós-processamento. Aborta se inconsistente."""
    if len(gdf_resumo) == 0:
        raise ValueError("Nenhum município processado — verificar dados de entrada.")

    if len(gdf_resumo) < 200:
        raise ValueError(
            f"Apenas {len(gdf_resumo)} municípios processados — esperado ~224 para o Piauí."
        )

    # Classes fora do range válido
    invalid_classes = set(gdf_classes["classe_prioridade"].unique()) - _VALID_CLASSES
    if invalid_classes:
        raise ValueError(f"Classes inválidas no resultado: {invalid_classes}")

    # Porcentagens fora de [0, 100]
    bad_pct = gdf_classes[
        (gdf_classes["pct_floresta"] < 0) | (gdf_classes["pct_floresta"] > 100) |
        (gdf_classes["pct_desmat"]   < 0) | (gdf_classes["pct_desmat"]   > 100)
    ]
    if len(bad_pct) > 0:
        raise ValueError(f"{len(bad_pct)} registros com percentual fora de [0,100].")

    log.info(
        "Validação OK: %d municípios, %d registros, classes %s",
        len(gdf_resumo), len(gdf_classes),
        sorted(gdf_classes["classe_prioridade"].unique()),
    )
