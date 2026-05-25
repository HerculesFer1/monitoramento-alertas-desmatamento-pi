"""Verifica sintaxe dos arquivos modificados."""
import ast
import pathlib

files = [
    "core/uploader.py",
    "modules/deradsa_semarh/manifest.py",
    "modules/municipios_ibge/manifest.py",
    "modules/prodes_cerrado/manifest.py",
    "modules/alertas_mapbiomas/manifest.py",
]
ok = True
for f in files:
    try:
        ast.parse(pathlib.Path(f).read_text(encoding="utf-8"))
        print(f"OK  {f}")
    except SyntaxError as e:
        print(f"ERR {f}: {e}")
        ok = False

raise SystemExit(0 if ok else 1)
