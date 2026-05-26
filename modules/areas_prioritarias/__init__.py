"""
Módulo areas_prioritarias
Programa Jurisdicional REDD+ Piauí

Cruzamento PRODES 2024 × 16 classes de prioridade AHP
→ quantificação de área (ha) por município × classe.

Entry point: manifest.run(config)
"""
from .manifest import MANIFEST, run

__all__ = ["MANIFEST", "run"]
