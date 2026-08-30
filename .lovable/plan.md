# Dispersão de Lote — detectar consumo fora da estrutura da Ficha Técnica

Hoje a Visão Geral só compara consumo x previsto que já vem pronto na planilha. A Ficha Técnica só entra no custo. Falta a regra que motivou o módulo: apontar OPs que consumiram material que **não pertence à composição oficial do produto**.

## O que passa a existir

Para cada linha de consumo (OP, produto, material), o sistema verifica se o material aparece na composição do produto acabado na Ficha Técnica — considerando a árvore completa (produto → subconjuntos → matérias-primas), não só o primeiro nível.

Três situações possíveis por linha:

- **Na estrutura** — material previsto na composição. Comportamento atual, sem mudança.
- **Fora da estrutura** — o produto tem Ficha Técnica cadastrada, mas o material consumido não está em nenhum nível dela. Furo estrutural.
- **Sem Ficha Técnica** — o produto não tem composição cadastrada. Não é acusado como furo; entra como pendência de cadastro, para não gerar alarme falso.

## Onde aparece na tela

- **Novo indicador** na faixa de KPIs: "OPs com consumo fora da estrutura" (quantidade de OPs e impacto R$ acumulado).
- **Coluna/etiqueta** "Fora da FT" na tabela de linhas de dispersão e no drill-down por período, ao lado da classificação atual.
- **Novo filtro** na barra de filtros: Todas / Somente fora da estrutura / Somente sem Ficha Técnica.
- **Matriz de Criticidade e Causa provável**: material fora da estrutura passa a ser rotulado como causa "Estrutural" independentemente do histórico de OPs, já que por definição não é erro de apontamento de quantidade.
- **Novo bloco** na Visão Geral: ranking dos materiais fora da estrutura, do maior para o menor impacto R$, com a lista de produtos e OPs em que apareceram.
- A exportação BI da tela passa a carregar as mesmas colunas.

## Correções que vêm junto (necessárias para a regra funcionar)

- A leitura da Ficha Técnica na tela hoje traz no máximo 1.000 das 6.835 linhas, sem ordenação — subconjunto instável que muda a cada reimportação. Passa a ser paginada e completa. Isso também conserta o filtro e o gráfico de Linha de Origem, que hoje cobrem menos de metade dos itens.
- A tela passa a recarregar a Ficha Técnica quando ela for reimportada pelo endpoint automático, e não só pela importação manual.

## Detalhes técnicos

- Nova função em `src/lib/ft-arvore.ts`: carrega a BOM inteira paginada com `fetchAll` e monta o conjunto de descendentes por produto raiz (`Map<produto, Set<id_item>>`), percorrendo pais → filhos com proteção contra ciclo. A chave de pai considera tanto `id_produto` quanto `id_subconjunto`, porque na base atual 536 dos 672 pares (produto, material) casam por `id_subconjunto` e apenas 251 por `id_produto`. Códigos comparados com `trim` e case-insensitive, como já é feito no restante do módulo.
- `producao.dispersao.tsx`: nova query `["dispersao","bom-estrutura"]` (`staleTime` de 5 min) alimentando o `useMemo` de `linhas`, que ganha o campo `estrutura: "NA_FT" | "FORA_FT" | "SEM_FT"`. Os agregados (`kpis`, `matriz`, `topPerda`, `serieLinha`) leem esse campo. `origemQ` passa a derivar do mesmo carregamento paginado, eliminando a query truncada.
- `causaProvavel` em `ft-arvore.ts` recebe um parâmetro opcional para forçar "Estrutural" quando a linha for fora da FT.
- Somente leitura: nenhuma alteração de schema, de `v_impacto_consumo` ou de dados. Nada é gravado em `ficha_tecnica_bom`.
