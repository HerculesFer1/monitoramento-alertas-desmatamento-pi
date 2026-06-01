"""
Módulo areas_prioritarias
Programa Jurisdicional REDD+ Piauí

Cruzamento PRODES 2025 × 5 classes de prioridade (GPKG vetorial)
→ quantificação de área (ha) por município × classe.
Enriquecido com biomassa AGB via rasterstats.

Entry point: manifest.run(config)
"""
from .manifest import MODULE_MANIFEST, run

__all__ = ["MODULE_MANIFEST", "run"]
