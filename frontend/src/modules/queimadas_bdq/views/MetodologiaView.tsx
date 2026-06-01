/**
 * MetodologiaView.tsx — queimadas_bdq
 * Documentação da fonte, metodologia e limitações do produto AQ1km.
 */
export function MetodologiaView() {
  return (
    <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 16 }}>

      <Section title="Fonte de Dados">
        <p>
          <strong>Produto:</strong> Área Queimada AQ1km V6 — Coleção 2<br />
          <strong>Instituição:</strong> INPE / LASA-UFRJ (Laboratório de Aplicações de Satélites Ambientais)<br />
          <strong>Satélites:</strong> MODIS (AQUA + TERRA)<br />
          <strong>Resolução espacial:</strong> 1 km<br />
          <strong>Cobertura temporal:</strong> Set/2002 – presente (mensal)<br />
          <strong>Acesso:</strong>{' '}
          <code style={code}>dataserver-coids.inpe.br/queimadas/queimadas/area_queimada/colecao2/shp/</code>
        </p>
        <p>
          A Coleção 2 foi relançada em fevereiro de 2026 com processamento completo revisado,
          integrando mais consistentemente as detecções de calor e reduzindo falsos positivos
          em relação à Coleção 1.
        </p>
      </Section>

      <Section title="Metodologia de Cruzamento">
        <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Download de 12 arquivos ZIP mensais (Jan–Dez 2025) via HTTP direto</li>
          <li>Extração e carregamento dos 12 shapefiles de cicatrizes de queimadas</li>
          <li>Clip ao Piauí via bounding box <code style={code}>(-45.98, -11.80, -40.37, -2.75)</code></li>
          <li>Reparo de geometrias inválidas via <code style={code}>fix_geoms()</code></li>
          <li>Reprojeção para SIRGAS 2000 geográfico (EPSG:4674)</li>
          <li>Cruzamento vetorial: cicatrizes × (classes prioridade × municípios) via <code style={code}>gpd.overlay()</code></li>
          <li>Cálculo de <strong>área queimada (ha)</strong> das interseções em EPSG:5880 (projeção equivalente)</li>
          <li>Agregação por (município × classe × mês)</li>
        </ol>
      </Section>

      <Section title="Limitações Importantes">
        <Alert>
          Este produto é classificado como <strong>"Provisório"</strong> pelo INPE, ainda
          em fase de validação formal. Usar apenas como <strong>estimativa exploratória</strong>,
          não como dado para autuação ou emissão de licenças.
        </Alert>
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>
            <strong>Superestimação de área:</strong> A resolução de 1 km causa commission error
            (falsos positivos). Queimadas menores que ~100 ha podem não ser detectadas; pixels
            com fogo parcial são computados integralmente.
          </li>
          <li>
            <strong>Cicatrizes × focos:</strong> Os polígonos representam estimativas de área
            queimada, não focos de incêndio ativos. Um único evento de fogo pode gerar múltiplos
            polígonos (fragmentação radiométrica).
          </li>
          <li>
            <strong>Cobertura nuvens:</strong> Em meses com muita nebulosidade (Jan–Mar no Piauí),
            pode haver subestimação por falta de imagem clara.
          </li>
          <li>
            <strong>Integração metodológica:</strong> As áreas de queimada NÃO estão incorporadas
            ao índice AHP das classes de prioridade. O cruzamento é analítico/diagnóstico, não
            altera os pesos da metodologia Sato et al. 2026.
          </li>
        </ul>
      </Section>

      <Section title="Interpretação Recomendada">
        <p>
          A análise de queimadas por classe de prioridade deve ser lida como:
        </p>
        <blockquote style={{
          borderLeft: '3px solid #FC8D59',
          margin:     '8px 0',
          paddingLeft: 12,
          color:      'var(--t2)',
          fontStyle:  'normal',
          fontSize:   11,
        }}>
          "Das áreas que mais necessitam de proteção florestal (classes 4 e 5),
          qual proporção foi atingida por fogo em 2025?"
        </blockquote>
        <p>
          Um <strong style={{ color: '#B30000' }}>alto percentual em classes 4+5</strong> indica
          que o fogo está comprometendo justamente as áreas de maior valor para o REDD+,
          demandando ação prioritária de brigadas e fiscalização.
        </p>
      </Section>

      <Section title="Referências">
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>INPE. Programa Queimadas — Área Queimada AQ1km. Disponível em: terrabrasilis.dpi.inpe.br/queimadas/aq1km/</li>
          <li>Libonati, R. et al. (2015). An Algorithm for Burned Area Detection in the Brazilian Cerrado Using 4 µm MODIS Imagery. Remote Sensing, 7(11), 15782-15803.</li>
          <li>Sato, L.; Tejada, G.; Noronha, I. (2026). Mapa Preliminar de Áreas Prioritárias REDD+ Piauí. CGEO/SEMARH-PI.</li>
        </ul>
      </Section>

    </div>
  )
}

const code: React.CSSProperties = {
  background:   'rgba(255,255,255,.06)',
  borderRadius: 3,
  padding:      '1px 5px',
  fontFamily:   'monospace',
  fontSize:     10,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', borderBottom: '1px solid rgba(255,255,255,.06)', paddingBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background:   'rgba(252,141,89,.08)',
      border:       '1px solid rgba(252,141,89,.25)',
      borderRadius: 6,
      padding:      '8px 12px',
      fontSize:     11,
      color:        '#FC8D59',
      marginBottom: 10,
    }}>
      ⚠ {children}
    </div>
  )
}
