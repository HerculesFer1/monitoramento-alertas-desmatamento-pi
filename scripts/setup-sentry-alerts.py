"""
setup-sentry-alerts.py — Cria as 4 alert rules do runbook via Sentry REST API.

Você só precisa fornecer:
  1. Auth token (gerado em https://sentry.io/settings/account/api/auth-tokens/
     com scope `project:write` e `alerts:write`)
  2. Organização slug + projeto slug (extraídos do DSN ou da URL do projeto)

Uso:
  $env:SENTRY_TOKEN = "sntrys_xxxxxxxxxxxx"
  $env:SENTRY_ORG = "sua-org-slug"          # ex: 'semarh-pi' ou ID numérico
  $env:SENTRY_PROJECT = "redd-pi"           # slug do projeto
  $env:NOTIFY_EMAIL = "gcgeo@semarh.pi.gov.br"
  python scripts/setup-sentry-alerts.py

Idempotente: detecta rules com mesmo nome e pula.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error


SENTRY_BASE = "https://sentry.io/api/0"


def _request(method: str, path: str, token: str, body: dict | None = None) -> dict | list:
    url = f"{SENTRY_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code} em {method} {path}: {e.read().decode()[:300]}")
        sys.exit(1)


def list_existing_rules(org: str, project: str, token: str) -> list[dict]:
    return _request("GET", f"/projects/{org}/{project}/rules/", token)


def create_rule(org: str, project: str, token: str, name: str, rule: dict) -> dict | None:
    existing = list_existing_rules(org, project, token)
    if any(r.get("name") == name for r in existing):
        print(f"  ↷ {name!r} já existe — pulado")
        return None
    rule["name"] = name
    rule["environment"] = rule.get("environment", "production")
    rule["frequency"] = rule.get("frequency", 30)   # max 30 min entre triggers
    result = _request("POST", f"/projects/{org}/{project}/rules/", token, body=rule)
    print(f"  ✓ {name!r} criado (id={result.get('id')})")
    return result


def main() -> int:
    token = os.environ.get("SENTRY_TOKEN", "").strip()
    org = os.environ.get("SENTRY_ORG", "").strip()
    project = os.environ.get("SENTRY_PROJECT", "").strip()
    email = os.environ.get("NOTIFY_EMAIL", "").strip()

    missing = [k for k, v in {
        "SENTRY_TOKEN": token, "SENTRY_ORG": org, "SENTRY_PROJECT": project, "NOTIFY_EMAIL": email,
    }.items() if not v]
    if missing:
        print("❌ Variáveis de ambiente ausentes: " + ", ".join(missing))
        print("\nExemplo (PowerShell):")
        print('  $env:SENTRY_TOKEN = "sntrys_xxx"')
        print('  $env:SENTRY_ORG = "sua-org-slug"')
        print('  $env:SENTRY_PROJECT = "redd-pi"')
        print('  $env:NOTIFY_EMAIL = "gcgeo@semarh.pi.gov.br"')
        return 1

    # Sentry exige um "targetIdentifier" para email actions — usa o email diretamente.
    email_action = {
        "id": "sentry.mail.actions.NotifyEmailAction",
        "targetType": "Member",         # ou "Team"
        "targetIdentifier": email,       # email do membro
    }

    print(f"📋 Criando alert rules em {org}/{project} (notificar {email})\n")

    # Rule #1 — Spike de erros (5+ em 1h)
    create_rule(org, project, token, name="Spike de erros (5+/h)", rule={
        "conditions": [{
            "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
            "interval": "1h",
            "value": 5,
        }],
        "actions": [email_action],
        "actionMatch": "all",
        "filterMatch": "all",
        "frequency": 30,
    })

    # Rule #2 — Issue novo em produção
    create_rule(org, project, token, name="Erro novo em produção", rule={
        "conditions": [{
            "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        }],
        "filters": [{
            "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
            "key": "environment",
            "match": "eq",
            "value": "production",
        }],
        "actions": [email_action],
        "actionMatch": "all",
        "filterMatch": "all",
    })

    # Rule #3 — Pipeline backend errored (logger contém 'core')
    create_rule(org, project, token, name="Pipeline backend errored", rule={
        "conditions": [{
            "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        }],
        "filters": [{
            "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
            "key": "logger",
            "match": "co",     # 'contains'
            "value": "core",
        }],
        "actions": [email_action],
        "actionMatch": "all",
        "filterMatch": "all",
    })

    # Rule #4 — Performance p95 > 5s
    # NOTA: este é um Metric Alert, não Issue Alert — endpoint diferente.
    # Skip se SKIP_METRIC=1; Sentry exige plano Team+ pra Metric Alerts.
    if os.environ.get("SKIP_METRIC", "").strip() != "1":
        print("\n  ⚠ Rule #4 (pageload p95 > 5s) requer plano Team+ e endpoint diferente.")
        print("    Pule por agora (export SKIP_METRIC=1) ou crie manualmente em")
        print("    Alerts > Create > Metric Alert.\n")

    print("\n✅ Concluído.")
    print(f"   Verifique em: https://sentry.io/organizations/{org}/projects/{project}/rules/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
