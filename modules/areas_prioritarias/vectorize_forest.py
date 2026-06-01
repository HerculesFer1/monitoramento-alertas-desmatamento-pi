"""
vectorize_forest.py — Módulo areas_prioritarias
Converte a máscara florestal raster para GPKG vetorial.

NOTA: O pipeline NÃO usa mais este GPKG para cálculo de área.
O processor.py agora usa rasterstats diretamente no TIF original,
que é ordens de magnitude mais rápido (~96k patches → inviável para overlay).

Este script é OPCIONAL — usado apenas para visualização da camada florestal
em um SIG ou para validação visual da máscara.

Uso:
    python -m modules.areas_prioritarias.vectorize_forest

Input  : C:/11. REDD+/Forest_mask/Forest_mask/Mascara_de_floresta_2025.tif
Output : C:/11. REDD+/Forest_mask/floresta_2025.gpkg (display only)
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s %(levelname)s %(message)s",
    handlers= [logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ── Caminhos ──────────────────────────────────────────────────────────────────
FOREST_TIF  = Path("C:/11. REDD+/Forest_mask/Forest_mask/Mascara_de_floresta_2025.tif")
OUTPUT_GPKG = Path("C:/11. REDD+/Forest_mask/floresta_2025.gpkg")
LAYER_NAME  = "floresta_2025"

# Valor de floresta na máscara (0 = sem floresta, 100 = floresta)
FOREST_VALUE = 100
# Janela de leitura (px por lado) — evita OOM para rasters grandes
WINDOW_SIZE  = 4096


def run() -> None:
    """Executa a vetorização. Idempotente — pula se GPKG já existir."""
    if OUTPUT_GPKG.exists():
        log.info("Arquivo já existe: %s — vetorização pulada.", OUTPUT_GPKG)
        log.info("Para reprocessar, delete o arquivo e execute novamente.")
        return

    if not FOREST_TIF.exists():
        raise FileNotFoundError(
            f"Máscara florestal não encontrada: {FOREST_TIF}\n"
            "Verifique o caminho e tente novamente."
        )

    import geopandas as gpd
    import rasterio
    import rasterio.features
    import rasterio.windows
    from shapely.geometry import shape
    from shapely.validation import make_valid

    log.info("Iniciando vetorização: %s", FOREST_TIF.name)

    shapes_list: list = []

    with rasterio.open(str(FOREST_TIF)) as src:
        log.info(
            "Raster: %d × %d px | CRS=%s | dtype=%s",
            src.width, src.height, src.crs, src.dtypes[0],
        )
        src_crs = src.crs

        # Iterar por janelas de tamanho fixo
        n_row_wins = (src.height + WINDOW_SIZE - 1) // WINDOW_SIZE
        n_col_wins = (src.width  + WINDOW_SIZE - 1) // WINDOW_SIZE
        total_wins = n_row_wins * n_col_wins
        log.info("Processando %d × %d = %d janelas...", n_row_wins, n_col_wins, total_wins)

        processed = 0
        for row_off in range(0, src.height, WINDOW_SIZE):
            for col_off in range(0, src.width, WINDOW_SIZE):
                win = rasterio.windows.Window(
                    col_off, row_off,
                    min(WINDOW_SIZE, src.width  - col_off),
                    min(WINDOW_SIZE, src.height - row_off),
                )
                data             = src.read(1, window=win)
                forest_mask      = (data == FOREST_VALUE).astype("uint8")
                processed       += 1

                if forest_mask.sum() == 0:
                    continue  # janela sem floresta

                win_transform = src.window_transform(win)

                for geom_dict, _ in rasterio.features.shapes(
                    source    = forest_mask,
                    mask      = forest_mask,
                    transform = win_transform,
                ):
                    geom = shape(geom_dict)
                    if geom.is_empty:
                        continue
                    geom = make_valid(geom)
                    if not geom.is_empty:
                        shapes_list.append(geom)

                if processed % 20 == 0:
                    log.info(
                        "  Janelas: %d/%d | patches coletados: %d",
                        processed, total_wins, len(shapes_list),
                    )

    log.info("Vetorização concluída: %d patches florestais", len(shapes_list))

    if not shapes_list:
        raise ValueError(
            "Nenhum pixel florestal encontrado na máscara. "
            "Verifique se o valor de floresta é %d.", FOREST_VALUE
        )

    gdf = gpd.GeoDataFrame({"geometry": shapes_list}, crs=src_crs)
    log.info("GeoDataFrame criado: %d patches | CRS=%s", len(gdf), src_crs)

    # ── Dissolve de patches contíguos ────────────────────────────────────────
    # 96k patches individuais → ~1k–5k polígonos contíguos.
    # Reduz dramaticamente o tempo do gpd.overlay() no processor.py.
    log.info("Dissolve de patches contíguos (pode demorar 1–2 min)...")
    from shapely.ops import unary_union

    merged = unary_union(gdf.geometry.tolist())
    if merged.geom_type == "Polygon":
        geoms = [merged]
    else:
        geoms = list(merged.geoms)

    gdf = gpd.GeoDataFrame({"geometry": geoms}, crs=src_crs)
    log.info("Após dissolve: %d polígonos contíguos (redução de %.0fx)",
             len(gdf), len(shapes_list) / max(len(gdf), 1))

    # Reprojetar para EPSG:4326 se necessário
    if gdf.crs.to_epsg() != 4326:
        log.info("Reprojetando %s → EPSG:4326...", gdf.crs)
        gdf = gdf.to_crs("EPSG:4326")

    OUTPUT_GPKG.parent.mkdir(parents=True, exist_ok=True)
    log.info("Salvando em %s...", OUTPUT_GPKG)
    gdf.to_file(str(OUTPUT_GPKG), driver="GPKG", layer=LAYER_NAME)

    size_mb = OUTPUT_GPKG.stat().st_size / 1_048_576
    log.info("Salvo: %d polígonos | %.1f MB", len(gdf), size_mb)
    log.info("Pronto. Use este GPKG como 'forest_mask_gpkg' no manifest.py.")


if __name__ == "__main__":
    run()
