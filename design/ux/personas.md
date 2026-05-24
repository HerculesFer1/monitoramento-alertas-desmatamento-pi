# Personas — Monitoramento de Alertas de Desmatamento

## P1 — Analista Ambiental (usuário primário)

**Perfil:** Servidor do CGEO/SEMARH com formação em Ciências Ambientais ou Geografia.
Acessa o dashboard semanalmente para monitorar novos alertas e preparar relatórios.

**Objetivos:**
- Identificar municípios com maior pressão de desmatamento irregular
- Verificar quais alertas MapBiomas já têm cobertura de instrumento legal (ASV/DERADSA)
- Produzir insumos para autuações e relatórios de gestão

**Dores:**
- Cruzar manualmente planilhas SINAFLOR, SEMARH e MapBiomas toma horas
- Difícil saber se um alerta já foi tratado em anos anteriores (reincidência)
- Relatórios Word/PDF gerados manualmente para cada reunião

**Como o sistema ajuda:**
- Classificação automática em 4 classes (IRREGULAR, AUTORIZADO, AUT_PARCIALMENTE, REGULARIZADO)
- Indicador de reincidência por município
- Export de dados para uso em laudos

---

## P2 — Gestor de Unidade (usuário secundário)

**Perfil:** Chefe de seção ou coordenador no CGEO. Usa o dashboard em reuniões para apresentar
indicadores de desempenho e justificar ações de fiscalização.

**Objetivos:**
- Visão executiva rápida (IPI estadual, ha irregular, tendência YoY)
- Comparação com anos anteriores
- Foco no MATOPIBA (região de maior pressão)

**Dores:**
- Gráficos não são auto-explicativos para audiências não-técnicas
- Precisa de números confiáveis para defender orçamento e equipe

**Como o sistema ajuda:**
- Aba "Visão Geral" com KPIs consolidados
- Aba "MATOPIBA" com ranking e tendência municipal
- Badge "AO VIVO / ESTÁTICO" indica confiabilidade dos dados

---

## P3 — Desenvolvedor / Analista GIS (usuário técnico)

**Perfil:** Profissional de TI ou GIS responsável por executar e manter o pipeline.
Acessa o código-fonte, logs e banco de dados.

**Objetivos:**
- Executar o pipeline mensal sem erros
- Adicionar novos datasets sem quebrar módulos existentes
- Monitorar qualidade dos dados (testes T1–T9)

**Dores:**
- Onboarding lento em código legado sem documentação
- Difícil saber quais etapas falharam em uma execução

**Como o sistema ajuda:**
- Arquitetura modular (cada módulo em `modules/<id>/` com manifest + run())
- Orquestrador com log por fase
- Aba "Gestão de Dados" no dashboard mostra última execução e cobertura
