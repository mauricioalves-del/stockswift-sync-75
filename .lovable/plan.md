# Acurácia Ponderada no padrão do Disponibilidade de Estoque

Só muda a aparência da tela Acurácia Ponderada (Atlas). Cálculos, dados, gráficos e filtros continuam iguais.

## O que muda na tela
1. **Faixa de cabeçalho escura** (igual ao Disponibilidade): título "Acurácia Ponderada" com subtítulo curto "Item a item · IAQ · IAP" e, à direita, a competência selecionada e a hora da leitura. O texto explicativo longo vira uma linha discreta dentro do bloco de indicadores.
2. **Seções com letra** (bolinha laranja + título), como no Disponibilidade:
   - **A · Filtros**: mês e almoxarifado, mais o botão "Limpar filtros".
   - **B · Indicadores do período**: os 4 cards (Item a item, IAQ, IAP, Cobertura de custo).
   - **C · Os três modelos, lado a lado**.
   - **D · Por grupo de produto** e **E · Por almoxarifado** (lado a lado).
   - **F, G...**: os blocos seguintes (evolução MoM, falta x sobra, ranking etc.), na ordem atual.
3. Cards e tabelas com a mesma borda, sombra, cabeçalho de tabela e tipografia do Disponibilidade.

## Detalhes técnicos
- Reutilizar `Secao` e `Th` de `components/abast-dash/comum.tsx` em `atlas.acuracia-ponderada.tsx`.
- Manter `AtlasGrafico`, `FiltrosInv` e as funções de `atlas-inventario` sem alteração.
