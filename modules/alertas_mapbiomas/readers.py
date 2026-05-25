"""
pipeline/readers.py — Abstração de leitura de dados geoespaciais.

DataReader define o contrato. LocalGeoJSONReader é a implementação atual.
Implementações futuras (MapBiomasReader, SINAFLORReader) seguirão a mesma
interface sem alterar o restante do pipeline.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

import geopandas as gpd

from core.constants import ANOS_DERADSA

log = logging.getLogger(__name__)

# Nomes canônicos dos arquivos na pasta 'data/raw/'
_FILE_ALERTAS = "Alertas de Desmatamento(MAPBIOMAS).geojson"
_FILE_ASVS    = "ASVs Emitidas-PI(SINAFLOR+).geojson"
_FILE_PRODES  = "PRODES_Cerrado_PI.geojson"

# Mapa dinâmico: ano → nome do arquivo DERADSA
# Guiado por ANOS_DERADSA em core/constants.py — adicionar um novo ano lá basta.
_DERADSA_FILES: dict[int, str] = {
    ano: f"DERADSAs Emitidas[SEMARH-{ano}].geojson"
    for ano in ANOS_DERADSA
}


class DataReader(ABC):
    """Interface de leitura de dados. Subclasses implementam a origem concreta."""

    @abstractmethod
    def read_alertas(self) -> gpd.GeoDataFrame:
        """Retorna alertas de desmatamento (MapBiomas)."""

    @abstractmethod
    def read_asvs(self) -> gpd.GeoDataFrame:
        """Retorna autorizações de supressão vegetal (SINAFLOR+)."""

    @abstractmethod
    def read_deradsa(self, year: int) -> gpd.GeoDataFrame:
        """Retorna DERADSAs emitidas no ano informado."""

    def read_prodes(self) -> Optional[gpd.GeoDataFrame]:
        """Retorna polígonos PRODES-Cerrado, ou None se indisponível."""
        return None


class LocalGeoJSONReader(DataReader):
    """Lê dados geoespaciais de arquivos GeoJSON locais.

    Args:
        data_dir: Diretório que contém os GeoJSONs brutos ('base de dados/').
    """

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir)
        self._validate()

    def _validate(self) -> None:
        # Arquivos fixos obrigatórios
        obrigatorios = [_FILE_ALERTAS, _FILE_ASVS]
        # Arquivos DERADSA: obrigatório ter ao menos 1 dos anos de ANOS_DERADSA
        der_files = [self.data_dir / f for f in _DERADSA_FILES.values()]
        der_found = [p for p in der_files if p.exists()]
        for fname in obrigatorios:
            p = self.data_dir / fname
            if not p.exists():
                raise FileNotFoundError(f"Arquivo obrigatório não encontrado: {p}")
        if not der_found:
            raise FileNotFoundError(
                f"Nenhum arquivo DERADSA encontrado em {self.data_dir}. "
                f"Esperados: {[p.name for p in der_files]}"
            )

    def read_alertas(self) -> gpd.GeoDataFrame:
        path = self.data_dir / _FILE_ALERTAS
        log.info("  Lendo alertas: %s", path.name)
        gdf = gpd.read_file(path)
        log.info("    → %d features | CRS: %s", len(gdf), gdf.crs)
        log.info("    Colunas: %s", list(gdf.columns))
        return gdf

    def read_asvs(self) -> gpd.GeoDataFrame:
        path = self.data_dir / _FILE_ASVS
        log.info("  Lendo ASVs: %s", path.name)
        gdf = gpd.read_file(path)
        log.info("    → %d features | CRS: %s", len(gdf), gdf.crs)
        log.info("    Colunas: %s", list(gdf.columns))
        return gdf

    def read_deradsa(self, year: int) -> gpd.GeoDataFrame:
        fname = _DERADSA_FILES.get(year)
        if fname is None:
            log.info("  DERADSA %d: ano fora de ANOS_DERADSA — retornando vazio", year)
            return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
        path = self.data_dir / fname
        log.info("  Lendo DERADSA %d: %s", year, path.name)
        gdf = gpd.read_file(path)
        log.info("    → %d features | Colunas: %s", len(gdf), list(gdf.columns))
        return gdf

    def read_prodes(self) -> Optional[gpd.GeoDataFrame]:
        path = self.data_dir / _FILE_PRODES
        if not path.exists():
            log.warning("  PRODES não encontrado em %s — validação PRODES desativada", path)
            return None
        log.info("  Lendo PRODES: %s", path.name)
        gdf = gpd.read_file(path)
        log.info("    → %d features | Colunas: %s", len(gdf), list(gdf.columns))
        return gdf
