# Configuração de Domínio — Dashboard CGEO/SEMARH-PI

> Guia operacional para atribuição do domínio público do dashboard via Vercel.
> Decisões institucionais ficam a critério da CGEO/SEMARH-PI; este documento
> apenas formaliza as opções e o processo técnico.

---

## 1. Estado atual

- **Hospedagem**: Vercel (deploy automático a cada push em `main`).
- **URL pública atual**: `cgeo-sync.vercel.app` (subdomínio Vercel gratuito,
  configurado em `frontend/vercel.json` via campo `name`). Decisão institucional
  de 2026-06-03 — provisório até oficialização do domínio governamental.
- **Região do build**: `gru1` (São Paulo) — latência ~5-15 ms para usuários no Piauí.
- **TLS**: certificado automático Let's Encrypt renovado pelo Vercel.

---

## 2. Opções de domínio recomendadas

Apresentadas em ordem de **adequação institucional decrescente**.

### 🥇 Opção A — Subdomínio governamental `*.pi.gov.br`

Recomendação principal por alinhamento institucional. Exige autorização
do gestor de DNS do governo do Piauí (provavelmente ATI-PI ou SEMARH-TI).

| Subdomínio sugerido | Razão |
|---|---|
| `monitoramento.semarh.pi.gov.br` | Descritivo, identifica o órgão e a função |
| `cgeo.semarh.pi.gov.br` | Identifica o departamento responsável |
| `redd.semarh.pi.gov.br` | Foco no programa REDD+ |
| `geo.semarh.pi.gov.br` | Curto, abre espaço para futuros dashboards CGEO |

**Vantagens**: credibilidade institucional, sem custo de registro, vínculo
com a marca do governo PI.

**Processo**:
1. Solicitar via memorando à equipe de TI da SEMARH-PI ou ATI-PI.
2. Pedir criação de `CNAME` apontando para `cname.vercel-dns.com`.
3. Após criação, adicionar o domínio no painel Vercel
   (Settings → Domains → Add).
4. Vercel emite certificado TLS automaticamente.

### 🥈 Opção B — Domínio próprio `.gov.br` (registro.br)

Para registrar um domínio `.gov.br` (ex: `reddpiaui.gov.br`), a SEMARH-PI
precisa abrir solicitação no registro.br via o representante legal do órgão.
Custo: gratuito para `.gov.br`. Prazo: 5-15 dias úteis.

| Domínio sugerido | Razão |
|---|---|
| `reddpiaui.gov.br` | Marca do programa, fácil memorização |
| `monitoramentopiaui.gov.br` | Genérico, abre espaço para outras camadas |
| `geosemarh.gov.br` | Identifica o órgão |

### 🥉 Opção C — Subdomínio Vercel (atual)

`cgeo-sync.vercel.app` — **já configurado**, funciona imediatamente.
Útil enquanto o domínio institucional não é provisionado. Custo zero.

**Não recomendado como solução final** para uso institucional/oficial:
- URL contém marca "vercel" — descaracteriza o caráter público.
- Sujeito a alterações se a Vercel mudar a política de subdomínios.

### Opção D — Domínio comercial pago

`redd-piaui.com.br`, `monitoramento-piaui.com.br`, etc.
Custo: R$ 40-70/ano via registro.br. Não recomendado para uso institucional.

---

## 3. Como configurar um domínio no Vercel (passo a passo)

Após decidir o domínio:

### 3.1 No provedor de DNS (ex: ATI-PI ou registro.br)

**Para subdomínio** (`monitoramento.semarh.pi.gov.br`):
```
Tipo:    CNAME
Nome:    monitoramento  (ou o que foi escolhido)
Valor:   cname.vercel-dns.com
TTL:     3600
```

**Para domínio raiz** (`reddpiaui.gov.br`):
```
Tipo:    A
Nome:    @
Valor:   76.76.21.21        (IP fixo do Vercel)
TTL:     3600

Tipo:    CNAME
Nome:    www
Valor:   cname.vercel-dns.com
TTL:     3600
```

### 3.2 No painel Vercel

1. Abra https://vercel.com/dashboard
2. Selecione o projeto `cgeo-semarh-piaui`
3. **Settings → Domains → Add**
4. Cole o domínio (ex: `monitoramento.semarh.pi.gov.br`)
5. Vercel verifica DNS automaticamente (1-30 min)
6. Quando o status virar **Valid Configuration**, o certificado TLS é emitido
7. Marque o domínio como **Primary** (opcional, redireciona os demais para ele)

### 3.3 Validação

```bash
# DNS propagado?
nslookup monitoramento.semarh.pi.gov.br

# HTTPS funcional?
curl -I https://monitoramento.semarh.pi.gov.br
# Esperado: HTTP/2 200 + header `server: Vercel`
```

---

## 4. Pós-configuração — atualizações no código

Após o domínio público ser definido, atualizar em:

| Arquivo | O que mudar |
|---|---|
| `frontend/index.html` | `<meta property="og:url" content="https://NOVO-DOMINIO/" />` |
| `frontend/src/core/lib/sentry.ts` (quando ativado) | `tracePropagationTargets: ['https://NOVO-DOMINIO']` |
| `.github/workflows/deploy-frontend.yml` | Comentário com URL pública para clareza |
| `README.md` | Badge "Demo: NOVO-DOMINIO" |
| `docs/DATA_ANALYSIS_METHODOLOGY.md` | Footer/header com URL canônica |

---

## 5. Migração futura para outra hospedagem

O projeto é **portável**. A migração da Vercel para Netlify, Cloudflare Pages,
GitHub Pages, ou auto-hospedagem (Nginx + Node) exige apenas:

1. Rodar `npm run build` em qualquer plataforma com Node 24+.
2. Servir o conteúdo de `dist/` como SPA estático.
3. Aplicar os mesmos headers de `vercel.json` no servidor escolhido.
4. Atualizar DNS para o novo IP/CNAME.

Não há vendor lock-in: **nenhum Vercel Function**, **nenhum middleware Vercel**,
**nenhuma Edge Config** usados. Tudo é vite estático + Supabase REST.

---

*CGEO / SEMARH-PI — guia operacional de domínio (2026-06-02).*
