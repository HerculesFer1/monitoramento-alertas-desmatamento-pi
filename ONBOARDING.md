# Onboarding — Plataforma de Monitoramento de Desmatamento PI

> Meta: dev produtivo em ≤ 15 minutos.

---

## 1. Clonar e configurar (3 min)

```powershell
git clone https://github.com/HerculesFer1/monitoramento-alertas-desmatamento-pi
cd monitoramento-alertas-desmatamento-pi

# Ambiente Python
conda env create -f environment.yml
conda activate desmatamento

# Variáveis de ambiente
copy .env.example .env
# Editar .env com SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
```

Para desenvolvimento **local** use o ambiente `geo` (Python 3.12):
```powershell
conda create -n geo python=3.12 -c conda-forge geopandas shapely pandas numpy requests python-dotenv
conda activate geo
pip install "supabase>=2.9.0"
$env:PYTHONUTF8 = "1"
```

---

## 2. Rodar os testes (2 min)

```powershell
# Verificar que tudo está OK antes de qualquer mudança
python -m pytest tests/ modules/ -q
# Esperado: 105 passed

cd frontend && npm install && npm run test
# Esperado: 29 passed
```

---

## 3. Entender a estrutura em 5 minutos

```
core/           → Núcleo: registry, orchestrator, uploader, utils
modules/        → 5 módulos independentes (cada um com manifest.py + run())
frontend/src/
  core/         → store Zustand, hooks React Query, lib Supabase
  modules/      → Views lazy-loaded por módulo de análise
  shared/       → Componentes reutilizáveis (BaseMap, FilterPanel...)
data/raw/       → GeoJSONs de entrada (não versionados)
data/output/    → JSONs gerados pelo pipeline (versionados)
design/tokens/  → Paleta, tipografia e espaçamento do design system
docs/architecture/ → ADR-001 a ADR-007 (decisões técnicas)
```

**Regra de ouro:** cada `modules/<id>/` é autossuficiente — importa só de `core.*`, nunca de outro módulo.

---

## 4. Rodar o pipeline localmente (2 min)

```powershell
# Verificar que os GeoJSONs estão em data/raw/
python -m core.orchestrator

# Ou via script com um clique:
scripts\rodar_pipeline.ps1
```

O orquestrador descobre módulos automaticamente via `core/registry.py` e executa em ordem de prioridade (1 → 10). Saída em `data/output/`.

---

## 5. Rodar o dashboard localmente (2 min)

```powershell
cd frontend
npm run dev    # http://localhost:5173
```

O dashboard funciona **sem Supabase** (fallback para `public/data/*.json`). Para dados ao vivo, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `frontend/.env`.

---

## 6. Adicionar um novo módulo de análise

```powershell
# 1. Copiar o template
cp -r modules/_template modules/meu_dataset

# 2. Editar manifest.py
#    → MODULE_MANIFEST: id, name, version, priority, enabled, schedule, outputs
#    → run(config): download + process + upload

# 3. Implementar downloader.py e processor.py
#    → usar core.uploader.upload_geodataframe() para subir ao Supabase

# 4. Criar migrations/001_schema.sql com a tabela de destino

# 5. Escrever testes em tests/
#    → python -m pytest modules/meu_dataset/tests/

# O registry descobre automaticamente — sem tocar em core/
```

Guia completo: [docs/modules/COMO-CRIAR-MODULO.md](docs/modules/COMO-CRIAR-MODULO.md)

---

## 7. Pontos de entrada por papel

| Papel | Por onde começar |
|-------|-----------------|
| **Analista GIS** | `modules/alertas_mapbiomas/manifest.py` → entenda o `run()` |
| **Dev Frontend** | `frontend/src/core/layout/AppShell.tsx` → estrutura das abas |
| **Dev Backend** | `core/orchestrator.py` + `core/registry.py` → fluxo de execução |
| **DBA** | `infra/supabase/migrations/` → schema e RPCs |
| **DevOps** | `.github/workflows/` → 6 workflows (CI · deploy · update · release) |

---

## 8. Decisões arquiteturais importantes

| ADR | Decisão |
|-----|---------|
| [ADR-001](docs/architecture/ADR-001-vertical-slice.md) | Por que Vertical Slice (não MVC/camadas) |
| [ADR-002](docs/architecture/ADR-002-uploader-api.md) | Interface pública do uploader (`upload_geodataframe`) |
| [ADR-003](docs/architecture/ADR-003-module-contract.md) | Contrato obrigatório de cada módulo |
| [ADR-004](docs/architecture/ADR-004-frontend-shell.md) | Shell modular do frontend (AppShell + TabRouter) |
| [ADR-005](docs/architecture/ADR-005-data-fallback.md) | Fallback em 3 níveis (Supabase → JSON → hardcoded) |
| [ADR-006](docs/architecture/ADR-006-infra-cicd.md) | CI/CD e estratégia de release por módulo |
| [ADR-007](docs/architecture/ADR-007-constants-bridge.md) | Bridge de constantes Python → TypeScript |

---

## 9. Troubleshooting rápido

**Erro: `ModuleNotFoundError: No module named 'core'`**
```powershell
# Executar da raiz do repositório, não de dentro de um subdiretório
cd <raiz do repo>
python -m core.orchestrator
```

**Erro: `GDAL_DATA not found` ou CRS warnings**
```powershell
$env:GDAL_DATA = "C:\miniconda3\envs\geo\Library\share\gdal"
$env:PROJ_LIB  = "C:\miniconda3\envs\geo\Library\share\proj"
```

**Dashboard sem dados (tela em branco)**
1. Verificar `frontend/.env` — `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
2. Se não configurados: colocar `data/output/*.json` em `frontend/public/data/`
3. Badge "ESTÁTICO" aparece → dados do último pipeline carregados com sucesso

**Testes falhando em `test_indicators.py`**
Resolvido na v2.0 — `pd.to_numeric(errors="coerce")` adicionado para pandas 3.x.  
Se ainda falha: verifique se está no branch `main` após o commit `6216a15`.

---

*Dúvidas? Abra uma issue em GitHub ou contate o CGEO.*
