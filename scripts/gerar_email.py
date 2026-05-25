#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/gerar_email.py — Gera data/output/email_body.html para notificações CI.

Lê as variáveis exportadas pelo orchestrador via GITHUB_ENV e produz um
e-mail HTML responsivo com o resumo da execução do pipeline.

Variáveis de entrada (todas opcionais — usa fallbacks se ausentes):
    PIPELINE_STATUS          ok | warning | error | unknown
    PIPELINE_N_ALERTAS       número de fragmentos detectados
    PIPELINE_N_MUN           número de municípios afetados
    PIPELINE_DURACAO         duração em segundos
    PIPELINE_RESUMO_MODULOS  texto multilinha com status por módulo
    PIPELINE_AVISOS          texto multilinha com avisos
    PIPELINE_ERROS           texto multilinha com erros
    GH_RUN_URL               URL do run no GitHub Actions

Saída:
    data/output/email_body.html
"""
from __future__ import annotations

import html as _html
import os
from pathlib import Path

# ── Entradas ─────────────────────────────────────────────────────────────────
OUT = Path("data/output/email_body.html")
OUT.parent.mkdir(parents=True, exist_ok=True)

status    = os.environ.get("PIPELINE_STATUS", "unknown")
n_alertas = os.environ.get("PIPELINE_N_ALERTAS", "—")
n_mun     = os.environ.get("PIPELINE_N_MUN", "—")
duracao   = os.environ.get("PIPELINE_DURACAO", "—")
resumo    = _html.escape(os.environ.get("PIPELINE_RESUMO_MODULOS", "Pipeline não concluído"))
avisos    = _html.escape(os.environ.get("PIPELINE_AVISOS", "Nenhum"))
erros     = _html.escape(os.environ.get("PIPELINE_ERROS", "Nenhum"))
run_url   = os.environ.get("GH_RUN_URL", "#")

# ── Paleta ───────────────────────────────────────────────────────────────────
COR: dict[str, str] = {
    "ok":      "#10b981",
    "warning": "#f59e0b",
    "error":   "#ef4444",
    "unknown": "#6b7280",
}
ICONE: dict[str, str] = {
    "ok":      "✅",
    "warning": "⚠️",
    "error":   "🚨",
    "unknown": "❓",
}

cor   = COR.get(status, "#6b7280")
icone = ICONE.get(status, "❓")

# ── Blocos condicionais ───────────────────────────────────────────────────────
bloco_avisos = ""
if avisos and avisos != "Nenhum":
    bloco_avisos = f"""
      <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);
                  border-radius:8px;padding:10px 14px;margin-bottom:12px">
        <p style="margin:0 0 4px;color:#f59e0b;font-size:11px;font-weight:700">
          ⚠ AVISOS
        </p>
        <pre style="margin:0;font-size:11px;color:#fcd34d;white-space:pre-wrap">{avisos}</pre>
      </div>"""

bloco_erros = ""
if erros and erros != "Nenhum":
    bloco_erros = f"""
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);
                  border-radius:8px;padding:10px 14px;margin-bottom:12px">
        <p style="margin:0 0 4px;color:#ef4444;font-size:11px;font-weight:700">
          🚨 ERROS
        </p>
        <pre style="margin:0;font-size:11px;color:#fca5a5;white-space:pre-wrap">{erros}</pre>
      </div>"""

# ── HTML ─────────────────────────────────────────────────────────────────────
body = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;
             padding:24px;margin:0">

  <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:12px;
              overflow:hidden;border:1px solid #334155">

    <!-- ── Cabeçalho colorido ─────────────────────────────────── -->
    <div style="background:{cor};padding:16px 24px">
      <h1 style="margin:0;color:#fff;font-size:18px;line-height:1.3">
        {icone} Pipeline de Monitoramento — {status.upper()}
      </h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">
        CGEO / SEMARH-PI · Piauí · MapBiomas Alerta
      </p>
    </div>

    <!-- ── Métricas ───────────────────────────────────────────── -->
    <div style="padding:20px 24px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="color:#94a3b8;padding:5px 0;font-size:13px;
                     border-bottom:1px solid #1e293b">
            Fragmentos detectados
          </td>
          <td style="font-weight:700;text-align:right;padding:5px 0;
                     border-bottom:1px solid #1e293b">
            {n_alertas}
          </td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:5px 0;font-size:13px;
                     border-bottom:1px solid #1e293b">
            Municípios afetados
          </td>
          <td style="font-weight:700;text-align:right;padding:5px 0;
                     border-bottom:1px solid #1e293b">
            {n_mun}
          </td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:5px 0;font-size:13px">
            Duração da execução
          </td>
          <td style="font-weight:700;text-align:right;padding:5px 0">
            {duracao}s
          </td>
        </tr>
      </table>

      <!-- Módulos -->
      <div style="background:#0f172a;border-radius:8px;padding:12px 14px;
                  margin-bottom:12px">
        <p style="margin:0 0 6px;color:#94a3b8;font-size:10px;
                  text-transform:uppercase;letter-spacing:.06em">
          Módulos executados
        </p>
        <pre style="margin:0;font-size:11px;color:#cbd5e1;
                    white-space:pre-wrap;line-height:1.6">{resumo}</pre>
      </div>

      {bloco_avisos}
      {bloco_erros}

      <!-- CTA -->
      <a href="{run_url}"
         style="display:inline-block;background:#3b82f6;color:#fff;
                text-decoration:none;padding:9px 20px;border-radius:7px;
                font-size:12px;font-weight:700;margin-top:4px">
        Ver logs completos →
      </a>
    </div>

    <!-- ── Rodapé ──────────────────────────────────────────────── -->
    <div style="padding:10px 24px;background:#0f172a;
                border-top:1px solid #334155;font-size:11px;
                color:#475569;text-align:center;line-height:1.6">
      CGEO — Centro de Geotecnologia Fundiária e Ambiental · SEMARH-PI<br>
      <span style="font-size:10px">
        Gerado automaticamente pelo pipeline de monitoramento — não responder este e-mail.
      </span>
    </div>
  </div>

</body>
</html>"""

OUT.write_text(body, encoding="utf-8")
print(f"✓ Email body gerado: {OUT} ({OUT.stat().st_size} bytes)")
