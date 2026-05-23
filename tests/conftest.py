import os
import sys
from pathlib import Path

# Permite importar 'pipeline' a partir da raiz do projeto
sys.path.insert(0, str(Path(__file__).parent.parent))

# PROJ/GDAL — necessário antes de qualquer import de geopandas/pyproj (Windows/conda geo)
_PROJ_DIR = Path("C:/miniconda3/envs/geo/Library/share/proj")
_GDAL_DIR = Path("C:/miniconda3/envs/geo/Library/share/gdal")

if _PROJ_DIR.exists():
    os.environ["PROJ_LIB"]  = str(_PROJ_DIR)
    os.environ["GDAL_DATA"] = str(_GDAL_DIR)

    # pyproj >= 3 pode ignorar env vars já inicializadas — força via API Python
    try:
        import pyproj.datadir
        pyproj.datadir.set_data_dir(str(_PROJ_DIR))
    except Exception:
        pass
