"""
conftest.py — raiz do projeto
Garante que o diretório raiz está no sys.path para todos os testes,
independentemente do diretório de origem (tests/, modules/*/tests/, etc.).
"""
import sys
from pathlib import Path

# Adiciona a raiz do projeto ao sys.path para imports como:
#   from modules.areas_prioritarias.processor import ...
#   from core.spatial_core import fix_geoms
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
