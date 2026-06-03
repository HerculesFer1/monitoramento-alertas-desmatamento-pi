# ADR-009: Estrutura sustentável para evolução e migração

**Status**: Aceito
**Data**: 2026-06-03
**Decisores**: CGEO/SEMARH-PI
**Contexto**: pós-auditoria GIS (Migrations 011–014, 5 blocos resolvidos)

---

## Contexto

Após a auditoria GIS de 2026-06-02/03, o projeto consolidou:
- Backend Python modular (`core/`, `modules/<modulo>/`)
- Frontend React 19 com 5 módulos (`frontend/src/modules/`)
- 14 migrations SQL (`infra/supabase/migrations/`)
- CI/CD completo (5 workflows GitHub Actions)
- 169 testes pytest + 17 vitest + 37 asserts SQL

Esta camada precisa **sobreviver a três cenários**:

1. **Manutenção contínua** — novos módulos, novas RPCs, novos colaboradores.
2. **Migração de plataforma** — Vercel → outra hospedagem; Supabase → PostgreSQL
   self-hosted; conda → docker-only.
3. **Auditoria institucional** — uso oficial pela SEMARH-PI exige rastreabilidade
   de cada decisão técnica e metodológica.

---

## Decisão arquitetural

### 1. Estrutura de diretórios canônica

```
monitoramento-alertas-desmatamento-pi/
├── .github/
│   └── workflows/             # 6 workflows (ci, deploy, 3x update-*, release-module)
├── core/                      # núcleo Python compartilhado
│   ├── config.py              # ✅ paths externos (REDD_DATA_ROOT) — A5 da auditoria
│   ├── constants.py           # ✅ ponte Python→TS (gera pipeline/constants.json)
│   ├── orchestrator.py        # ✅ coordenação multi-módulo
│   ├── registry.py            # ✅ descoberta automática de módulos
│   ├── spatial_core.py        # ✅ assert_projected_crs + safe_* — C2 da auditoria
│   ├── uploader.py            # ✅ EWKT + retry + CRS guard
│   └── utils.py
├── modules/                   # cada fonte/produto é um módulo vertical
│   ├── _template/             # esqueleto para novos módulos (ADR-003)
│   ├── alertas_mapbiomas/     # MapBiomas Alerta → classificação ASV/DERADSA
│   ├── areas_prioritarias/    # AHP CGEO × PRODES × biomassa
│   ├── asvs_sinaflor/         # WFS IBAMA
│   ├── deradsa_semarh/        # ingestão manual SEMARH
│   ├── municipios_ibge/       # malha municipal IBGE
│   ├── prodes_cerrado/        # WFS TerraBrasilis INPE
│   └── queimadas_bdq/         # AQ1km BD Queimadas INPE
├── frontend/                  # SPA React 19 + Vite
│   ├── src/
│   │   ├── core/              # shell + hooks + queries + utilitários
│   │   ├── modules/           # 1 pasta por módulo do backend
│   │   └── shared/            # componentes reutilizáveis
│   ├── public/                # logos + favicons + GeoJSON estáticos
│   └── vercel.json            # config da hospedagem (portátil)
├── infra/
│   ├── docker/                # Dockerfile + compose
│   ├── prefect/               # flows + deployments Prefect Cloud
│   └── supabase/migrations/   # 14 migrations canônicas (001-014)
├── pipeline/                  # ponte Python → TS (apenas constants.json)
├── scripts/                   # utilitários auxiliares (docs, exports, downloads)
├── tests/                     # pytest unitários da core + SQL smokes
├── data/                      # dados gerenciados pelo pipeline
│   ├── raw/                   # entradas brutas (gitignored — > 100MB)
│   └── output/                # saídas do pipeline (gitignored)
├── docs/
│   ├── architecture/          # ADRs (001-009)
│   ├── modules/               # docs por módulo
│   ├── DATA_ANALYSIS_METHODOLOGY.md  # metodologia institucional
│   ├── DOMINIO.md             # guia de configuração de domínio
│   └── MIGRATION-PLAN.md      # plano de migração entre plataformas
├── design/                    # tokens, fluxos UX, assets brutos (logo-piaui.png)
├── conftest.py                # raiz: adiciona repo ao sys.path
├── environment.yml            # spec do ambiente conda
├── .env.example               # template de variáveis (REDD_DATA_ROOT + Supabase + Sentry)
├── README.md
├── ONBOARDING.md              # guia para novos colaboradores
├── CLAUDE.md                  # histórico técnico para LLMs (gpt/claude)
└── ROADMAP_CONSOLIDACAO.md    # pendências priorizadas
```

### 2. Princípios arquiteturais inegociáveis

#### 2.1 Vertical Slice por módulo
Cada módulo do backend tem o mesmo contrato (ADR-003):
```
modules/<modulo>/
├── __init__.py
├── manifest.py        # MODULE_MANIFEST + run(config) → dict
├── downloader.py      # baixa dados brutos
├── processor.py       # transforma (overlay, raster stats, etc)
├── calculator.py      # agrega + upload Supabase
├── migrations/        # SQL deste módulo (numeração interna se >1)
└── tests/             # pytest unitários do módulo
```

#### 2.2 Sem paths absolutos no código
Toda referência a path externo passa por `core.config`. Validado por
`tests/test_config.py::test_no_hardcoded_paths_in_modules` — qualquer
PR que reintroduzir `C:/11.` ou `/srv/redd` direto **quebra o CI**.

#### 2.3 Sem vendor lock-in
- Frontend é **vite build estático** — qualquer CDN serve.
- Supabase é usado via `@supabase/supabase-js` (PostgREST + RPC) —
  substituível por **PostgREST self-hosted + PostgreSQL 15+ + PostGIS 3**.
- Sem Vercel Functions, sem Edge Config, sem middleware Vercel.

#### 2.4 Migrations SQL imutáveis e numeradas
Uma vez aplicada, **uma migration não é editada** — cria-se outra
(015, 016…) com `CREATE OR REPLACE` quando precisa ajustar.
Permite rastreabilidade institucional e rollback seguro.

#### 2.5 Documentação versionada com o código
- Cada decisão técnica vira **ADR** em `docs/architecture/`.
- Cada módulo tem documentação metodológica em `docs/modules/`.
- `DATA_ANALYSIS_METHODOLOGY.md` é a fonte canônica de "como os números
  do dashboard são calculados". Atualizada junto com o código.

---

## Como adicionar um novo módulo

1. Copiar `modules/_template/` → `modules/<novo_modulo>/`.
2. Implementar `manifest.py` com `MODULE_MANIFEST` (campos obrigatórios em ADR-003).
3. Implementar `downloader.py → processor.py → calculator.py`.
4. Criar `migrations/00X_<modulo>.sql` com tabelas + RPCs (padrão de
   GRANT EXECUTE explícito, RLS habilitado, índice GiST se houver geometria).
5. Criar smoke SQL em `tests/sql/test_migration_00X_smoke.sql`.
6. Criar testes pytest em `modules/<modulo>/tests/`.
7. Adicionar ao **`frontend/src/core/lib/sources.ts`** (catálogo de fontes).
8. Adicionar `modules/<modulo>/migrations/...` no CI (`.github/workflows/ci.yml`,
   step "Verificar existência das migrations").
9. Atualizar `docs/DATA_ANALYSIS_METHODOLOGY.md` com a seção do novo módulo.
10. Se for automatizado, criar `.github/workflows/update-<modulo>.yml`.

---

## Como migrar de plataforma

### Vercel → Cloudflare Pages / Netlify / GitHub Pages

1. `npm run build` em qualquer Node 24+.
2. Servir `frontend/dist/` como SPA estático.
3. Replicar os headers de `frontend/vercel.json` no provedor escolhido.
4. Atualizar `og:url` em `frontend/index.html` para o novo domínio.

### Supabase → PostgreSQL self-hosted

1. Aplicar migrations 001-014 em ordem no novo banco.
2. Configurar PostgREST apontando para o banco.
3. Atualizar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para o novo PostgREST.
4. Recriar usuários `anon` e `authenticated` com mesmos privilégios.
5. Validar com os 6 smokes SQL (008/009/011/012/013/014).

### conda → docker-only

1. `infra/docker/Dockerfile` + `environment.yml` já suportam isso.
2. `docker compose up pipeline` roda equivalente a `python -m core.orchestrator`.

---

## Consequências

### Positivas
- **Onboarding rápido**: um colaborador entende a estrutura em <30 min lendo
  ONBOARDING.md + ADRs.
- **Migração segura**: nenhum lock-in vendor; migração documentada.
- **Auditoria fácil**: cada decisão tem ADR + commit semântico.
- **Manutenção previsível**: novo módulo segue padrão `_template/`.

### Negativas (assumidas)
- Estrutura mais elaborada que um projeto monolítico — exige disciplina.
- Multiplicação de arquivos pequenos por módulo (5 arquivos × N módulos).
- Decisões via ADR exigem documentação síncrona.

---

## ADRs predecessores relacionados

- **ADR-001** Visão geral
- **ADR-002** Platform core (core/ + modules/)
- **ADR-003** Contrato de módulo (manifest.py)
- **ADR-004** Frontend shell modular
- **ADR-005** Design system
- **ADR-006** Infra CI/CD
- **ADR-007** Database strategy (Supabase + RLS)
- **ADR-008** MVT tile serving (Migrations 011/012/014)
- **ADR-009** (este) Estrutura sustentável

---

*CGEO / SEMARH-PI — ADR-009 (2026-06-03).*
