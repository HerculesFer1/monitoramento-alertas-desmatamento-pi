"""
pipeline/constants.py — Fonte única de verdade para constantes compartilhadas.

Regra: qualquer valor que apareça em mais de um lugar do projeto (Python ou
TypeScript) deve ser definido aqui e apenas aqui.

Uso TypeScript: execute `python -m pipeline.constants` para gerar
`pipeline/constants.json`, importado pelo frontend via Vite.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Final

# ── CRS ───────────────────────────────────────────────────────────────────
CRS_CALC: Final = "EPSG:5880"   # Brasil Policônico — cálculo de área equivalente
CRS_OUT:  Final = "EPSG:4326"   # WGS 84 — exportação GeoJSON / Leaflet / MapLibre

# ── Parâmetros metodológicos ──────────────────────────────────────────────
THRESHOLD_AUTORIZADO: Final[float] = 0.99   # cobertura ASV ≥ 99% → AUTORIZADO
MIN_AREA_M2:          Final[float] = 1.0    # fragmentos < 1 m² = artefato geométrico
M2_HA:                Final[int]   = 10_000

# Limiar mínimo de sobreposição PRODES-Cerrado para classificar alerta como CONCORDANTE.
# 0.0 → qualquer sobreposição espacial (inclusive sliver de limite de polígono).
# Alternativas: 1.0 (≥ 1%) para excluir artefatos de borda; 5.0 (≥ 5%) conservador.
# ATENÇÃO: alterar este valor invalida os percentuais de concordância já publicados
# (NT-CGEO-001/2026) e requer nova execução do pipeline.
CONCORDANCIA_PRODES_MIN_PCT: Final[float] = 0.0

# ── Séries temporais ──────────────────────────────────────────────────────
ANOS:         Final[tuple[int, ...]] = (2022, 2023, 2024, 2025)
ANOS_DERADSA: Final[tuple[int, ...]] = (2024, 2025)  # únicos anos com DERADSA geoespacial

# ── Classificações e sufixos de ID ───────────────────────────────────────
CLASSES: Final[tuple[str, ...]] = (
    "AUTORIZADO",
    "AUTORIZADO_PARCIALMENTE",
    "REGULARIZADO",
    "IRREGULAR",
)

# Sufixo usado na composição do id_fragmento: {CODEALERTA}_{SUFIXO}_{n:06d}
SUFIXO_CLASSE: Final[dict[str, str]] = {
    "AUTORIZADO":              "AUT",
    "AUTORIZADO_PARCIALMENTE": "AUTP",
    "REGULARIZADO":            "REG",
    "IRREGULAR":               "IRR",
}

# ── Municípios MATOPIBA — Piauí (Portaria MAPA nº 244/2015) ───────────────
# Lei base: Decreto Federal nº 8.447/2015 (criou o PDA-Matopiba);
# Anexo com a lista: Portaria MAPA nº 244, de 12/11/2015 — 33 municípios PI.
# frozenset: imutável, O(1) de lookup, hashável.
MATOPIBA_PI: Final[frozenset[str]] = frozenset({
    "Alvorada do Gurguéia",
    "Antônio Almeida",
    "Avelino Lopes",
    "Baixa Grande do Ribeiro",
    "Barreiras do Piauí",
    "Bertolínia",
    "Bom Jesus",
    "Colônia do Gurguéia",
    "Corrente",
    "Cristalândia do Piauí",
    "Cristino Castro",
    "Curimatá",
    "Currais",
    "Eliseu Martins",
    "Gilbués",
    "Júlio Borges",
    "Landri Sales",
    "Manoel Emídio",
    "Marcos Parente",
    "Monte Alegre do Piauí",
    "Morro Cabeça no Tempo",
    "Palmeira do Piauí",
    "Parnaguá",
    "Porto Alegre do Piauí",
    "Redenção do Gurguéia",
    "Riacho Frio",
    "Ribeiro Gonçalves",
    "Santa Filomena",
    "Santa Luz",
    "São Gonçalo do Gurguéia",
    "Sebastião Barros",
    "Sebastião Leal",
    "Uruçuí",
})

# ── Vetores de pressão (EN → PT-BR) ──────────────────────────────────────
# Fonte: campo VPRESSAO do MapBiomas Alerta.
# Nota: "ilegal_mining" mantido como chave original do MapBiomas (com erro ortográfico).
VP_PTBR: Final[dict[str, str]] = {
    "agriculture":              "Agricultura",
    "others":                   "Outros",
    "urban_expansion":          "Expansão Urbana",
    "renewable_energy_project": "Projeto de Energia Renovável",
    "roads":                    "Abertura de Estradas",
    "aquaculture":              "Aquicultura",
    "mining":                   "Mineração",
    "natural_cause":            "Causa Natural",
    "ilegal_mining":            "Mineração Ilegal",
}

# ── Detecção automática de status ASV válido ──────────────────────────────
# Palavras-chave positivas e negativas para classificar status do campo status_aut.
STATUS_VALIDOS_KW:   Final[tuple[str, ...]] = ("emitida", "autori", "ativa", "vigente")
STATUS_INVALIDOS_KW: Final[tuple[str, ...]] = (
    "cancelad", "suspend", "indeferid", "expirad", "vencid"
)

# ── Flags de validação PRODES ─────────────────────────────────────────────
FLAG_CONCORDANTE         = "CONCORDANTE"
FLAG_DISCORDANTE         = "DISCORDANTE"
FLAG_SEM_PRODES          = "SEM_PRODES_NO_CICLO"
FLAG_DADOS_PENDENTES     = "DADOS_PENDENTES"
FLAG_NAO_DISPONIVEL_CAA  = "NAO_DISPONIVEL_CAATINGA"


# ── Exportação JSON (bridge Python → TypeScript) ──────────────────────────

def as_json_payload() -> dict:
    """Retorna as constantes compartilhadas como dict JSON-serializable."""
    return {
        "anos":                         list(ANOS),
        "anos_deradsa":                 list(ANOS_DERADSA),
        "matopiba_pi":                  sorted(MATOPIBA_PI),
        "vp_ptbr":                      VP_PTBR,
        "classes":                      list(CLASSES),
        "sufixo_classe":                SUFIXO_CLASSE,
        "threshold_autorizado":         THRESHOLD_AUTORIZADO,
        "concordancia_prodes_min_pct":  CONCORDANCIA_PRODES_MIN_PCT,
        "flags_prodes": {
            "concordante":        FLAG_CONCORDANTE,
            "discordante":        FLAG_DISCORDANTE,
            "sem_prodes":         FLAG_SEM_PRODES,
            "dados_pendentes":    FLAG_DADOS_PENDENTES,
            "nao_disponivel_caa": FLAG_NAO_DISPONIVEL_CAA,
        },
    }


def export_json(dest: Path | None = None) -> Path:
    """Gera pipeline/constants.json para consumo pelo frontend TypeScript.

    Chamado automaticamente pelo __main__.py ao final do pipeline.
    Pode ser invocado manualmente: python -m core.constants
    """
    if dest is None:
        # Escreve em pipeline/constants.json — alias @pipeline do Vite aponta aqui.
        # Atualizado em Phase 3 quando o alias migrar para @core.
        dest = Path(__file__).parent.parent / "pipeline" / "constants.json"
    dest.write_text(
        json.dumps(as_json_payload(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return dest


if __name__ == "__main__":
    path = export_json()
    print(f"Exportado: {path}")
