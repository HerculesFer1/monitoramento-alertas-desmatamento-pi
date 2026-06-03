/**
 * content.ts — Conteúdo textual das metodologias por módulo.
 *
 * Linguagem deliberadamente simples e direta — alvo: leitor que não é
 * desenvolvedor nem cientista de dados, mas precisa entender o que cada
 * número do dashboard significa.
 *
 * Cada metodologia tem 5 seções fixas:
 *   - pergunta:      O que este módulo responde
 *   - fontes:        De onde vêm os dados
 *   - como_calcula:  Passo-a-passo do cálculo
 *   - simbologia:    O que cada cor/badge/escala significa
 *   - limitacoes:    O que esses dados NÃO conseguem dizer
 *
 * Para atualizar, edite aqui — o drawer carrega tudo automaticamente.
 */

import type { Module } from '../store/useAppStore'

export interface MetodologiaSecao {
  titulo:  string
  paragrafos: string[]
}

export interface Metodologia {
  /** Nome do modulo no titulo do drawer (ex: "MapBiomas Alertas"). */
  nomeModulo:    string
  /** Cor tematica do modulo — usada no header do drawer. */
  cor:           string
  pergunta:      MetodologiaSecao
  fontes:        MetodologiaSecao
  como_calcula:  MetodologiaSecao
  simbologia:    MetodologiaSecao
  limitacoes:    MetodologiaSecao
}

// Cada metodologia agora — depois pode ser convertido para MDX/arquivo .md

export const METODOLOGIAS: Record<Module, Metodologia> = {
  mapbiomas: {
    nomeModulo: 'MapBiomas Alertas',
    cor:        '#F59E0B',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'Quais foram os desmatamentos detectados no Piauí entre 2022 e 2025, e quais já tinham autorização ou regularização ambiental no momento do alerta.',
        'Cada alerta vira um fragmento classificado em uma de 4 situações: Autorizado, Autorizado Parcialmente, Regularizado ou Irregular.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'MapBiomas Alerta (GraphQL API v2) — detecta perda de cobertura vegetal via imagens de satélite quase em tempo real.',
        'ASVs SINAFLOR+ (IBAMA) — autorizações de supressão vegetal emitidas pelo órgão federal, baixadas via WFS.',
        'DERADSAs SEMARH-PI — declarações estaduais de regularização ambiental, ingeridas manualmente pelo CGEO.',
        'A atualização do alerta é mensal (dia 5 às 03:00 UTC). As ASVs são atualizadas semanalmente.',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        '1. Para cada alerta, verifica se existe uma ASV válida no momento do desmatamento (a data da ASV cobre a data do alerta).',
        '2. Se a ASV cobre 99% ou mais da área do alerta → classifica como AUTORIZADO (verde).',
        '3. Se a ASV cobre só parte → divide o alerta em fragmento autorizado (AUTORIZADO PARCIALMENTE) e área residual.',
        '4. Aplica DERADSA apenas no que sobrou — fragmento que coincide vira REGULARIZADO (laranja).',
        '5. O que restou sem nenhuma autorização → IRREGULAR (vermelho).',
        'Áreas calculadas em projeção métrica (Brasil Policônico — EPSG:5880) para precisão de hectares.',
      ],
    },
    simbologia: {
      titulo: 'O que cada cor significa no mapa',
      paragrafos: [
        '🟢 Verde — Autorizado: o desmatamento tinha autorização integral (ASV válida).',
        '🟢 Verde claro — Autorizado Parcialmente: parte tinha ASV, parte não.',
        '🟠 Laranja — Regularizado: declaração DERADSA emitida pelo estado (apenas 2024–2025).',
        '🔴 Vermelho — Irregular: sem nenhuma autorização ou regularização identificada.',
        'O Índice de Pressão Irregular (IPI) na Visão Geral é o percentual da área total que ficou em IRREGULAR.',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'Os números são uma estimativa exploratória — não substituem a autuação ambiental feita pelos órgãos competentes.',
        'A precisão posicional do MapBiomas Alerta é de aproximadamente 15 metros — pequenos erros de borda são esperados.',
        'DERADSAs só estão disponíveis como dado geoespacial para 2024 e 2025 ("Série B"). Em 2022–2023 a categoria não aparece — não significa ausência, é limitação do registro.',
        'O alerta detecta perda de vegetação, mas não distingue causa (corte raso, fogo, evento natural) sem cruzamento adicional.',
      ],
    },
  },

  prodes: {
    nomeModulo: 'PRODES Cerrado',
    cor:        '#10B981',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'O quanto os alertas do MapBiomas concordam com o PRODES-Cerrado, que é o produto oficial anual do INPE para o bioma Cerrado.',
        'Essa validação cruzada dá uma noção de confiabilidade das estimativas — quanto mais concordância, mais robusto o número apresentado.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'PRODES-Cerrado é mantido pelo INPE/TerraBrasilis — publicado anualmente, geralmente em outubro.',
        'O download é feito via WFS (Web Feature Service) do TerraBrasilis, filtrando apenas o estado do Piauí.',
        'Cada ciclo PRODES vai de agosto/Y a julho/Y+1 — diferente do ano calendário.',
        'A atualização é automática anualmente (1º de outubro, 03:00 UTC).',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        '1. Para cada alerta MapBiomas no Cerrado, identifica em qual ciclo PRODES ele se encaixa (pela data de detecção).',
        '2. Cruza espacialmente o alerta com os polígonos PRODES do mesmo ciclo.',
        '3. Se há sobreposição espacial → CONCORDANTE. Se PRODES desse ciclo existe mas não cobre → DISCORDANTE.',
        '4. Se o ciclo PRODES ainda não foi publicado (caso comum em 2025) → SEM PRODES NO CICLO.',
        'O percentual de concordância é (CONCORDANTE / (CONCORDANTE + DISCORDANTE)) × 100.',
      ],
    },
    simbologia: {
      titulo: 'O que cada cor significa',
      paragrafos: [
        '🟢 Verde — Concordante: PRODES confirma o desmatamento detectado pelo alerta.',
        '🔴 Vermelho — Discordante: PRODES daquele ciclo não confirma.',
        '⚪ Cinza — Sem PRODES no ciclo: ciclo INPE ainda não publicado.',
        'O bioma Caatinga aparece como "Não Disponível" — não existe produto INPE equivalente para essa região.',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'A discordância não significa erro do MapBiomas — pode ser que o desmatamento tenha ocorrido após o corte temporal do PRODES, ou que o PRODES esteja sendo mais conservador.',
        'PRODES-Cerrado cobre apenas o bioma Cerrado. Alertas na Caatinga ficam sem validação cruzada.',
        'O critério atual para CONCORDANTE é qualquer sobreposição espacial. Pode incluir slivers de borda em alertas grandes.',
      ],
    },
  },

  matopiba: {
    nomeModulo: 'MATOPIBA',
    cor:        '#D97706',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'Como está a pressão de desmatamento nos 26 municípios piauienses que pertencem à região MATOPIBA — fronteira agrícola estratégica do Brasil.',
        'Permite comparar a região MATOPIBA com o restante do estado, identificar municípios reincidentes e acompanhar a variação ano a ano.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'A delimitação dos 26 municípios MATOPIBA piauienses vem do Decreto Federal nº 8.447/2015.',
        'Os dados de desmatamento são os mesmos do módulo MapBiomas Alertas, filtrados para esses municípios.',
        'Nenhuma fonte adicional — é um recorte territorial sobre dados existentes.',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        '1. Filtra a tabela agregada por município × ano apenas para os 26 municípios MATOPIBA.',
        '2. Calcula um ranking interno de pressão irregular dentro da região (cada município ganha posição).',
        '3. Calcula o "delta IPI year-over-year" — variação do índice de pressão de um ano para o próximo (positivo = piora, negativo = melhora).',
        '4. Marca como REINCIDENTE qualquer município com IRREGULAR em 3 ou mais anos consecutivos.',
        'Tudo é pré-calculado em uma view materializada no banco para resposta rápida.',
      ],
    },
    simbologia: {
      titulo: 'O que cada elemento significa',
      paragrafos: [
        '🟠 Borda âmbar nos municípios MATOPIBA — diferencia da paleta geral do estado.',
        'Badge "REINCIDENTE" — municípios com pressão persistente (3+ anos com IRREGULAR).',
        'Setas ↗ / ↘ no IPI — variação ano a ano (verde = melhora, vermelho = piora).',
        'O ranking é apenas dentro da região, não comparado ao estado todo.',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'Não inclui dados econômicos ou de produção agropecuária — apenas a pressão geoespacial de desmatamento.',
        'A comparação com outros estados MATOPIBA (Maranhão, Tocantins, Bahia) não está implementada — escopo é só Piauí.',
        'O recorte legal é fixo no Decreto 8.447/2015 — mudanças posteriores na delimitação não são refletidas automaticamente.',
      ],
    },
  },

  areas_prioritarias: {
    nomeModulo: 'Áreas Prioritárias REDD+',
    cor:        '#10B981',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'Quais municípios do Piauí mais precisam de proteção florestal urgente, segundo a metodologia AHP do Programa Jurisdicional REDD+ do estado.',
        'Cruza essa priorização com os dados oficiais de desmatamento (PRODES) e com o estoque de carbono florestal (biomassa AGB), criando um diagnóstico territorial.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'Classes de prioridade — produto científico do CGEO/SEMARH-PI usando metodologia AHP (Analytic Hierarchy Process) ponderada: 83% Índice de Pressão + 17% Valor de Biomassa.',
        'Máscara florestal 2025 — referência FREL do Piauí, identifica onde existe floresta hoje.',
        'PRODES 2025 — desmatamento oficial INPE para o bioma Cerrado.',
        'DETER — alertas complementares para o período pós-PRODES (gap temporal).',
        'Biomassa AGB (toneladas de carbono por hectare) — raster científico vinculado.',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        '1. O raster AHP foi vetorizado em 5 classes de prioridade (Muito Baixa → Muito Alta).',
        '2. Cada classe é cruzada vetorialmente com cada município (gpd.overlay) — gera ~1.097 células (classe × município).',
        '3. Em cada célula calcula: área total, área de floresta remanescente (via rasterstats no TIF florestal), área desmatada (cruzamento com PRODES).',
        '4. AGB médio é calculado com rasterstats sobre o raster de biomassa, ponderado por área de floresta.',
        '5. Biomassa total da célula = AGB médio × área de floresta.',
        'A "classe máxima" de um município é a maior classe que ainda tem floresta — não a média.',
      ],
    },
    simbologia: {
      titulo: 'O que cada cor significa',
      paragrafos: [
        '🟢 Verde — Classe 1 (Muito Baixo): baixa pressão histórica, pouca urgência.',
        '🟡 Amarelo — Classe 2 (Baixo).',
        '🟠 Laranja — Classe 3 (Médio).',
        '🟠 Laranja escuro — Classe 4 (Alto).',
        '🔴 Vermelho — Classe 5 (Muito Alto): máxima urgência de proteção.',
        'Na aba Biomassa, as quebras são recalculadas dinamicamente via Natural Breaks (Jenks) sobre a distribuição real — badge "JENKS" sinaliza isso na legenda.',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'A metodologia AHP foi desenhada para priorização — não substitui uma análise socioeconômica ou de viabilidade institucional.',
        'PRODES cobre apenas o bioma Cerrado — desmatamento na Caatinga não aparece nesta camada.',
        'O estoque de biomassa AGB usa máscara FREL diferente da AHP — comparações diretas entre os dois precisam considerar isso.',
        'O período do PRODES 2025 é agosto/2024 a julho/2025 — desmatamentos posteriores aparecem em DETER (alertas provisórios).',
      ],
    },
  },

  queimadas_bdq: {
    nomeModulo: 'Queimadas BD-INPE',
    cor:        '#EF4444',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'Onde aconteceram as queimadas no Piauí em 2025 e qual foi a relação delas com as áreas marcadas como prioritárias pelo Programa REDD+.',
        'Permite identificar municípios com maior pressão de fogo e cruzar com as classes de prioridade AHP.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'AQ1km V6 — Cicatrizes de Área Queimada Coleção 2, do BD Queimadas do INPE.',
        'Cada cicatriz é um polígono detectado por satélite que representa uma área que foi queimada.',
        'Os dados chegam mensalmente em shapefiles — o pipeline baixa, processa e armazena no banco.',
        'As classes de prioridade são as mesmas do módulo Áreas Prioritárias REDD+.',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        '1. Para cada mês, cruza as cicatrizes com a grade municipal × classes de prioridade.',
        '2. Calcula a área queimada (em hectares, projeção métrica EPSG:5880) em cada célula.',
        '3. Conta cicatrizes únicas por célula — uma cicatriz que cruza várias células conta uma vez por célula (preserva metodologia AQ1km/INPE de "1 polígono = 1 cicatriz").',
        '4. Agrega tudo por município × ano para gerar os totais da Visão Geral.',
        '5. O percentual "em alta prioridade" é a área queimada que caiu em classes 4 e 5 (Alto + Muito Alto) sobre o total queimado do município.',
      ],
    },
    simbologia: {
      titulo: 'O que cada cor significa no mapa',
      paragrafos: [
        '⚪ Cinza claro — 0 ha queimados (sem registros).',
        '🟡 Bege a laranja claro — queimadas pequenas (1 a 500 ha).',
        '🟠 Laranja médio a vermelho-laranja — queimadas intermediárias (500 a 5.000 ha).',
        '🔴 Vermelho escuro — queimadas críticas (mais de 10.000 ha).',
        'A escala é absoluta (não por densidade) — usa pontos de corte em 1, 500, 2.000, 5.000 e 10.000 hectares.',
        '🔴⃝ Borda tracejada vermelha — municípios em que mais de 50% da queimada caiu em classes prioritárias 4 e 5 (alta urgência).',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'Cicatriz AQ1km tem resolução de 1 km — queimadas pequenas (menos de ~100 ha) podem não ser detectadas.',
        'Não distingue queimada natural de provocada — só detecta a área queimada.',
        'A escala atual é fixa em pontos de corte globais — em anos atípicos pode ficar mono ou saturada (melhoria prevista: Natural Breaks dinâmico).',
        'Municípios geograficamente grandes naturalmente acumulam mais queimadas — comparações devem considerar isso.',
      ],
    },
  },

  // O modulo de dados nao tem metodologia separada — sua "metodologia"
  // e o catalogo de fontes que ja exibe internamente
  dados: {
    nomeModulo: 'Gestão de Dados',
    cor:        '#94A3B8',
    pergunta: {
      titulo: 'O que este módulo responde',
      paragrafos: [
        'Este não é um módulo de análise — é uma camada operacional de monitoramento.',
        'Mostra quando o pipeline rodou pela última vez, qual a cobertura de cada fonte e quais serão as próximas atualizações.',
      ],
    },
    fontes: {
      titulo: 'De onde vêm os dados',
      paragrafos: [
        'Tabela execucoes_pipeline (Supabase) — registra cada execução do orquestrador.',
        'Catálogo de fontes em frontend/src/core/lib/sources.ts.',
        'Workflows GitHub Actions — definem cronograma de atualização automática.',
      ],
    },
    como_calcula: {
      titulo: 'Como o cálculo é feito',
      paragrafos: [
        'A "última atualização" é puxada do registro mais recente da tabela execucoes_pipeline.',
        'A "próxima atualização prevista" é derivada do cron expression do workflow de cada fonte.',
        'Não há cálculo analítico — é apenas reflexo do estado do pipeline.',
      ],
    },
    simbologia: {
      titulo: 'O que cada elemento significa',
      paragrafos: [
        '🟢 Ativo — fonte atualizada automaticamente pelo pipeline.',
        '🟡 Manual — fonte que depende de ingestão humana (caso das DERADSAs e AQ1km).',
        '🔴 Pendente — fonte aguardando primeira ingestão.',
      ],
    },
    limitacoes: {
      titulo: 'O que este módulo NÃO consegue dizer',
      paragrafos: [
        'Não informa qualidade dos dados — apenas presença e frequência.',
        'Falhas de processamento aparecem como "última atualização antiga" — diagnóstico fino precisa olhar os logs do GitHub Actions.',
      ],
    },
  },
}
