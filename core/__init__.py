"""
platform — Núcleo da Plataforma de Monitoramento Geoespacial.
CGEO / SEMARH-PI · v2

Regra absoluta: nenhum arquivo em platform/ importa de modules/.

Módulos disponíveis:
    registry      — descoberta de módulos via manifest.py
    orchestrator  — execução dos módulos registrados
    uploader      — upsert para Supabase (alertas e agregados)
    spatial_core  — operações geométricas reutilizáveis (fix, reproject, area)
    constants     — constantes globais + bridge JSON para o frontend TypeScript
    utils         — funções utilitárias puras (parse, normalização, tempo)
"""
