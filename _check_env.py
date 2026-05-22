import sys
print("Python:", sys.version[:6])
print("Ambiente:", sys.prefix)

pkgs = [
    ("geopandas",  "geopandas"),
    ("shapely",    "shapely"),
    ("fiona",      "fiona"),
    ("pandas",     "pandas"),
    ("numpy",      "numpy"),
    ("requests",   "requests"),
    ("dotenv",     "python-dotenv"),
]

ausentes = []
for modulo, nome in pkgs:
    try:
        m = __import__(modulo)
        v = getattr(m, "__version__", "ok")
        print(f"  {nome:<20}: {v}")
    except ImportError:
        print(f"  {nome:<20}: AUSENTE")
        ausentes.append(nome)

# supabase tem import diferente
try:
    from supabase import create_client
    import supabase as sb_mod
    print(f"  {'supabase':<20}: {getattr(sb_mod, '__version__', 'ok')}")
except ImportError as e:
    print(f"  {'supabase':<20}: AUSENTE ({e})")
    ausentes.append("supabase")

print()
if ausentes:
    print("AUSENTES:", ", ".join(ausentes))
else:
    print("Todos os pacotes OK!")
