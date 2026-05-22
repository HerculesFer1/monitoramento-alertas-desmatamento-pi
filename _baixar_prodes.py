#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_baixar_prodes.py — Download automatizado PRODES-Cerrado recortado para o Piauí
GCGEO — Gerência do Centro de Geotecnologia Fundiária e Ambiental / SEMARH-PI

Fonte: TerraBrasilis / INPE
WFS endpoint verificado ativo: https://terrabrasilis.dpi.inpe.br/geoserver/prodes-cerrado-nb/ows
Layer: prodes-cerrado-nb:yearly_deforestation  (CRS nativo: EPSG:4674 ≈ EPSG:4326)

Estratégia: WFS GetFeature com bbox do Piauí → nunca baixa o GPKG de 1 GB.
Tráfego esperado: ~5–30 MB por execução (apenas polígonos dentro do PI).

Uso:
    conda activate desmatamento
    python _baixar_prodes.py                   # baixa todos os anos configurados
    python _baixar_prodes.py --anos 2023 2024  # anos específicos
    python _baixar_prodes.py --dry-run         # verifica conexão sem salvar
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTHONUTF8", "1")

import requests
import geopandas as gpd
import pandas as pd
import shapely
from shapely.geometry import box

# ── Configuração ──────────────────────────────────────────────────────────────

BASE     = Path(__file__).resolve().parent
DATA_RAW = BASE / "base de dados"
SAIDA    = DATA_RAW / "PRODES_Cerrado_PI.geojson"
MUN_PI   = BASE / "Resultado" / "municipios_pi.geojson"

# WFS endpoint verificado ativo (GetCapabilities retorna 200 OK)
WFS_BASE = "https://terrabrasilis.dpi.inpe.br/geoserver/prodes-cerrado-nb/ows"
LAYER    = "prodes-cerrado-nb:yearly_deforestation"

# Bounding box conservador do Piauí (EPSG:4326)
# lon_min, lat_min, lon_max, lat_max
BBOX_PI  = (-45.98, -11.80, -40.37, -2.75)

# Anos de interesse do projeto
ANOS_PROJETO = [2022, 2023, 2024, 2025]

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("prodes")


# ── Funções ───────────────────────────────────────────────────────────────────

def verificar_conexao() -> bool:
    """Confirma que o WFS responde antes de tentar download."""
    try:
        r = requests.get(
            WFS_BASE,
            params={"service": "WFS", "version": "2.0.0", "request": "GetCapabilities"},
            timeout=30,
        )
        ok = r.status_code == 200 and "FeatureTypeList" in r.text
        if ok:
            log.info(f"  WFS OK (status {r.status_code}) — serviço TerraBrasilis ativo")
        else:
            log.error(f"  WFS retornou status {r.status_code} ou resposta inesperada")
        return ok
    except requests.exceptions.RequestException as e:
        log.error(f"  Falha de conexão: {e}")
        return False


def _detectar_coluna_geom(gdf: gpd.GeoDataFrame) -> str:
    """Retorna o nome da coluna de geometria ativa do GeoDataFrame."""
    return gdf.geometry.name if hasattr(gdf, "geometry") else "geom"


def baixar_por_wfs(anos: list[int], timeout: int = 180) -> gpd.GeoDataFrame | None:
    """
    Consulta WFS usando CQL_FILTER com filtro espacial (BBOX) + filtro de ano embutidos.
    Não mistura parâmetro 'bbox' com CQL_FILTER — comportamento indefinido no GeoServer.
    Retorna GeoDataFrame em EPSG:4326 ou None em caso de erro.

    Estratégia de fallback:
      1ª tentativa: CQL_FILTER com BBOX(geom,...) AND year IN (...)
      2ª tentativa: só bbox WFS padrão, sem CQL_FILTER (filtro de ano fica no cliente)
    """
    anos_sql  = ",".join(str(a) for a in anos)
    b = BBOX_PI  # (lon_min, lat_min, lon_max, lat_max)

    # CQL_FILTER com filtro espacial e temporal embutidos (GeoServer extension)
    # Coluna de geometria confirmada como 'geometry' (inspecionado no layer em 2026-05-19)
    cql_com_ano = f"BBOX(geometry,{b[0]},{b[1]},{b[2]},{b[3]}) AND year IN ({anos_sql})"

    # Fallback: só bbox WFS padrão (sem CQL), filtragem de ano fica em Python
    bbox_wfs = f"{b[0]},{b[1]},{b[2]},{b[3]},EPSG:4326"

    # Filtro por estado confirmado: state = 'PIAUÍ' (valor exato do WFS, inspecionado 2026-05-19)
    # Evita o limite de 50k features do GeoServer que trunca dados multi-estado.
    cql_state_ano   = f"state = 'PIAUÍ' AND year IN ({anos_sql})"
    cql_state_ascii = f"state = 'PIAUI' AND year IN ({anos_sql})"   # fallback sem acento

    estrategias = [
        {
            # PRIMÁRIA: filtro por estado — retorna todos os polígonos sem limite 50k
            # Valor confirmado em inspeção real do WFS em 2026-05-19: state = 'PIAUÍ'
            "nome": "CQL_FILTER state=PIAUÍ + year (primaria confirmada)",
            "params": {
                "service": "WFS", "version": "2.0.0", "request": "GetFeature",
                "typeNames": LAYER, "outputFormat": "application/json",
                "CQL_FILTER": cql_state_ano, "srsName": "EPSG:4326",
            }
        },
        {
            "nome": "CQL_FILTER state=PIAUI + year (fallback ASCII)",
            "params": {
                "service": "WFS", "version": "2.0.0", "request": "GetFeature",
                "typeNames": LAYER, "outputFormat": "application/json",
                "CQL_FILTER": cql_state_ascii, "srsName": "EPSG:4326",
            }
        },
        {
            "nome": "CQL_FILTER spatial+year (fallback geometrico)",
            "params": {
                "service": "WFS", "version": "2.0.0", "request": "GetFeature",
                "typeNames": LAYER, "outputFormat": "application/json",
                "CQL_FILTER": cql_com_ano, "srsName": "EPSG:4326",
            }
        },
        {
            # Fallback final: bbox sem filtro de estado — truncado em 50k features
            # Mantido apenas como último recurso
            "nome": "bbox WFS padrao (year filtrado no cliente - fallback final)",
            "params": {
                "service": "WFS", "version": "2.0.0", "request": "GetFeature",
                "typeNames": LAYER, "outputFormat": "application/json",
                "bbox": bbox_wfs, "srsName": "EPSG:4326",
            }
        },
    ]

    for estrategia in estrategias:
        log.info(f"  Estratégia: {estrategia['nome']}")
        log.info(f"  URL: {WFS_BASE}")

        try:
            t0 = time.time()
            r = requests.get(
                WFS_BASE, params=estrategia["params"], timeout=timeout, stream=True
            )

            # Verifica status antes de consumir o stream
            if r.status_code != 200:
                log.warning(f"  HTTP {r.status_code} — tentando próxima estratégia")
                continue

            content_type = r.headers.get("Content-Type", "")
            if "json" not in content_type and "gml" not in content_type:
                log.warning(f"  Content-Type inesperado: {content_type} — tentando próxima estratégia")
                continue

            chunks, bytes_recebidos = [], 0
            for chunk in r.iter_content(chunk_size=1024 * 256):
                chunks.append(chunk)
                bytes_recebidos += len(chunk)
                print(f"\r  Baixando... {bytes_recebidos/1_048_576:.1f} MB", end="", flush=True)

            print()
            t1 = time.time()
            conteudo = b"".join(chunks)
            log.info(f"  Download: {len(conteudo)/1_048_576:.1f} MB em {t1-t0:.1f}s")

            # Verifica se o servidor retornou erro XML embutido no "sucesso"
            if b"ExceptionReport" in conteudo[:2048]:
                trecho = conteudo[:512].decode("utf-8", errors="replace")
                log.warning(f"  WFS ExceptionReport: {trecho[:200]} — tentando próxima estratégia")
                continue

            import io, tempfile, os as _os
            # Usa arquivo temporário para evitar carga total em RAM
            with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as tmp:
                tmp.write(conteudo)
                tmp_path = tmp.name

            try:
                gdf = gpd.read_file(tmp_path)
            finally:
                _os.unlink(tmp_path)

            if gdf.empty:
                log.warning("  Resposta WFS vazia — tentando próxima estratégia")
                continue

            log.info(f"  Geometrias recebidas: {len(gdf)} polígonos | CRS: {gdf.crs}")

            # Filtro de ano no cliente (necessário se a estratégia foi bbox-only)
            if "year" in gdf.columns and "filtrado no cliente" in estrategia["nome"]:
                antes = len(gdf)
                gdf = gdf[gdf["year"].isin(anos)].copy()
                log.info(f"  Filtro de ano aplicado no cliente: {antes} -> {len(gdf)} poligonos")

            return gdf

        except requests.exceptions.Timeout:
            log.warning(f"  Timeout após {timeout}s — tentando próxima estratégia")
        except requests.exceptions.RequestException as e:
            log.warning(f"  Erro de rede: {e} — tentando próxima estratégia")
        except Exception as e:
            log.warning(f"  Erro inesperado: {e} — tentando próxima estratégia")

    log.error("  Todas as estratégias WFS falharam")
    return None


def _make_valid_safe(geom):
    """Corrige geometrias inválidas (TopologyException frequente em dados PRODES)."""
    if geom is None or geom.is_empty:
        return geom
    if not geom.is_valid:
        return shapely.make_valid(geom)
    return geom


def clip_para_pi(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Recorta geometrias exatamente para o limite do Piaui.
    Aplica make_valid() antes do clip — dados PRODES frequentemente têm
    micro-irregularidades topológicas que causam TopologyException no Shapely.
    """
    gdf = gdf.to_crs("EPSG:4326")

    # Corrige geometrias inválidas antes de clipar (TopologyException prevention)
    n_invalidas = int((~gdf.geometry.is_valid).sum())
    if n_invalidas:
        log.info(f"  Corrigindo {n_invalidas} geometrias invalidas (make_valid)...")
        gdf["geometry"] = gdf.geometry.apply(_make_valid_safe)

    if MUN_PI.exists():
        log.info(f"  Clip com limite estadual do PI: {MUN_PI}")
        mun = gpd.read_file(MUN_PI).to_crs("EPSG:4326")
        limite_pi = mun.geometry.union_all()
        gdf_clip = gdf.clip(limite_pi)
        log.info(f"  Apos clip estadual: {len(gdf_clip)} poligonos")
        return gdf_clip
    else:
        log.info("  municipios_pi.geojson nao encontrado - usando bbox conservador")
        bbox_geom = box(*BBOX_PI)
        gdf_clip = gdf.clip(bbox_geom)
        log.info(f"  Apos clip bbox: {len(gdf_clip)} poligonos")
        return gdf_clip


def inspecionar_campos(gdf: gpd.GeoDataFrame):
    """Loga as colunas disponíveis para referência do pipeline."""
    log.info(f"  Colunas disponíveis: {list(gdf.columns)}")
    if "year" in gdf.columns:
        log.info(f"  Anos presentes: {sorted(gdf['year'].unique().tolist())}")
    # Identifica coluna de ano automaticamente (mesma lógica do preprocess.py)
    candidatos = ["year", "ano", "ANO", "YEAR", "ano_ciclo"]
    col_ano = next((c for c in candidatos if c in gdf.columns), None)
    if col_ano and col_ano != "year":
        log.warning(f"  Coluna de ano detectada como '{col_ano}' — confirme compatibilidade com preprocess.py")


def salvar(gdf: gpd.GeoDataFrame, caminho: Path):
    """Salva GeoDataFrame como GeoJSON em EPSG:4326."""
    gdf = gdf.to_crs("EPSG:4326")
    gdf.to_file(caminho, driver="GeoJSON", encoding="utf-8")
    tamanho_mb = caminho.stat().st_size / 1_048_576
    log.info(f"  Salvo: {caminho}")
    log.info(f"  Tamanho: {tamanho_mb:.1f} MB | {len(gdf)} polígonos")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Download PRODES-Cerrado recortado para o Piauí via WFS TerraBrasilis"
    )
    parser.add_argument(
        "--anos", nargs="+", type=int, default=ANOS_PROJETO,
        help=f"Anos a baixar (padrão: {ANOS_PROJETO})"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Verifica conexão sem baixar ou salvar dados"
    )
    parser.add_argument(
        "--timeout", type=int, default=180,
        help="Timeout da requisição WFS em segundos (padrão: 180)"
    )
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DOWNLOAD PRODES-CERRADO — TerraBrasilis / INPE")
    log.info("=" * 60)
    log.info(f"  Destino : {SAIDA}")
    log.info(f"  Anos    : {args.anos}")
    log.info(f"  Bbox PI : {BBOX_PI}")

    # Passo 1: verifica conexão
    log.info("\n[1/4] Verificando conexão com TerraBrasilis...")
    if not verificar_conexao():
        log.error("Abortado — WFS inacessível. Verifique conexão de rede.")
        sys.exit(1)

    if args.dry_run:
        log.info("\n[DRY-RUN] Conexão OK. Nenhum dado baixado (--dry-run ativo).")
        sys.exit(0)

    # Passo 2: download via WFS
    log.info("\n[2/4] Baixando via WFS (bbox PI, sem baixar o arquivo completo)...")
    gdf = baixar_por_wfs(anos=args.anos, timeout=args.timeout)
    if gdf is None:
        log.error("\nFalha no download WFS.")
        log.info("Alternativa manual:")
        log.info("  1. Acesse https://terrabrasilis.dpi.inpe.br/en/home-page/")
        log.info("  2. Vá em Download → PRODES Cerrado → yearly_deforestation")
        log.info(f"  3. Salve em: {SAIDA}")
        sys.exit(1)

    # Passo 3: inspeciona e recorta
    log.info("\n[3/4] Inspecionando campos e recortando para o PI...")
    inspecionar_campos(gdf)
    gdf_pi = clip_para_pi(gdf)

    if gdf_pi.empty:
        log.error("Nenhuma geometria PRODES dentro do Piauí. Verifique os anos e o layer.")
        sys.exit(1)

    # Passo 4: salva
    log.info("\n[4/4] Salvando resultado...")
    DATA_RAW.mkdir(exist_ok=True)
    salvar(gdf_pi, SAIDA)

    log.info("\n" + "=" * 60)
    log.info("CONCLUÍDO — Execute agora o pipeline principal:")
    log.info("  python preprocess.py")
    log.info("  (ou duplo clique em rodar_pipeline.ps1)")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
