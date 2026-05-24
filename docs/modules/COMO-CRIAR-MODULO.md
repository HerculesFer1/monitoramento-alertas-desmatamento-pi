# Como Criar um Novo Módulo de Análise

Leva um desenvolvedor do zero ao módulo em produção.
Tempo estimado: 1–3 dias, dependendo da complexidade do processamento.

## 1. Copiar o Template

```bash
cp -r modules/_template modules/<nome_do_modulo>
```

Nomear em `snake_case`, sem espaços. Ex: `queimadas_inpe`, `car_sicar`.

## 2. Preencher o Manifest

Editar `modules/<nome>/manifest.py`:

```python
MODULE_MANIFEST = {
    "id":          "<nome>",           # igual ao nome da pasta
    "name":        "Nome Legível",
    "version":     "1.0.0",
    "description": "Uma linha do que faz.",
    "icon":        "🔥",
    "schedule":    "0 3 1 * *",        # ou None para só manual
    "priority":    20,
    "enabled":     False,              # manter False até pronto para produção
    "outputs":     ["nome_tabela"],
    "tags":        ["tag1"],
}
```

> Deixe `enabled: False` até estar pronto. O registry ignora módulos desabilitados.

## 3. Implementar o Downloader

`modules/<nome>/downloader.py` — baixa os dados brutos:

```python
def download(dest_dir: Path, config: dict) -> Path:
    """Baixa os dados brutos e salva em dest_dir. Retorna o path."""
    # Use requests para HTTP/REST/GraphQL
    # Salve em data/raw/<nome>/ — não em modules/
    ...
    return dest_dir / "dados.geojson"
```

## 4. Implementar o Processor

`modules/<nome>/processor.py` — transforma dados brutos em resultado analítico:

```python
from platform.spatial_core import fix_geometry, reproject
from platform.uploader import upload_geodataframe

def process(raw_path: Path, config: dict) -> dict:
    gdf = gpd.read_file(raw_path)
    gdf = fix_geometry(gdf)
    gdf = reproject(gdf, to_crs="EPSG:5880")
    # ... lógica específica do módulo ...
    upload_geodataframe(gdf, table="nome_tabela")
    return {"status": "ok", "records": len(gdf), "message": "..."}
```

## 5. Criar a Migration do Banco

`modules/<nome>/migrations/001_<nome>_schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS <nome_tabela> (
  id          SERIAL PRIMARY KEY,
  ano         SMALLINT NOT NULL,
  geom        GEOMETRY(GEOMETRY, 4326),
  inserido_em TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE <nome_tabela> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura_publica_<nome>"
  ON <nome_tabela> FOR SELECT USING (true);
```

Executar no Supabase Dashboard **antes** do primeiro `run()`.

## 6. Escrever os Testes

`modules/<nome>/tests/test_processor.py`:

```python
def test_process_dry_run(tmp_path, sample_geojson):
    result = process(sample_geojson, config={"dry_run": True})
    assert result["status"] == "ok"
    assert result["records"] > 0
```

Rodar localmente: `pytest modules/<nome>/tests/`

## 7. Criar o Frontend do Módulo

```bash
cp -r frontend/src/modules/_template frontend/src/modules/<nome>
```

Editar `index.tsx` com as views do módulo.
Consultar padrão em [ADR-004](../architecture/ADR-004-frontend-shell.md).

## 8. Ativar o Módulo

1. Setar `"enabled": True` no `manifest.py`
2. Validar: `python -m platform.registry`
3. Rodar: `pytest modules/<nome>/tests/` — todos verdes
4. Rodar: `npm run build` — sem erros
5. Abrir PR → `release-module.yml` valida automaticamente
6. Após merge, próxima execução Prefect inclui o módulo

## Checklist Final

- [ ] `manifest.py` com todos os campos obrigatórios preenchidos
- [ ] `run()` retorna `{"status": "ok", "records": n, "message": ...}`
- [ ] Migration criada e executada no Supabase
- [ ] `pytest modules/<nome>/` → verde
- [ ] `npm run build` → zero erros
- [ ] `enabled: True` no manifest
- [ ] PR aberto e `release-module.yml` passou
