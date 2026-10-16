# Reposição de Lojas: origem livre por almoxarifado + consulta de estoque por SKU

## O que muda para o analista

1. **Coluna Origem em todas as linhas**
   - Toda linha mostra a lista. O valor padrão continua sendo **CD**.
   - A lista traz **todos os almoxarifados** da Visão Geral de Estoque: CD (Fábrica), Processo, Qualidade, PDV e todas as lojas. Isso inclui os que estão fora do planejamento de abastecimento.
   - Cada opção mostra o saldo do SKU naquele almoxarifado, por exemplo "L. Jesu (10)" ou "Processo (24)". Os almoxarifados com saldo zero também aparecem, mas ficam marcados como "(0)".
   - O sistema não decide mais quem tem "sobra". Quem escolhe a origem é o analista.
   - Ao trocar a origem, a quantidade a enviar passa a ser o **Pedido** da linha, limitado ao saldo do almoxarifado escolhido. Abaixo da lista aparece "transferir N".

2. **Clique duplo na linha abre a consulta de estoque**
   - Ao dar dois cliques numa linha, abre uma janela com a **Visão Geral de Estoque já filtrada pelo SKU** daquela linha.
   - A janela tem as mesmas colunas, cores (ruptura, abaixo, ok, excesso), mín/máx no tooltip, classe, categoria e total da tela original. O mesmo DE-PARA vale também (05304043 usando o saldo do 05104132).
   - A janela abre em qualquer linha. Quando o CD não consegue atender a demanda, aparece um aviso no topo: "CD não atende a demanda — escolha a origem".
   - Dentro da janela, um botão **Usar como origem** em cada almoxarifado com saldo preenche a coluna Origem daquela linha e fecha a janela.

3. **Geração de pedidos**
   - Os itens com origem CD seguem no pedido normal, como hoje.
   - Os itens com outra origem viram um **Pedido de Transferência** separado para cada almoxarifado de origem, com requisição TRF em Suprimentos. Isso vale para loja, Processo, Qualidade ou PDV.
   - A tela Pedidos mostra "Transferência de [almoxarifado]".

## Detalhes técnicos

- `abastecimento.reposicao.tsx`:
  - Troca o cálculo `sobras` por um mapa `saldoPorAlmox: Map<sku, Map<origem, qtd>>`, montado a partir de `bruto.estoque`. Esse mapa aplica `SALDO_DE_PARA` e a mesma lista de colunas de `abastecimento-estoque-geral.ts` (`COLUNAS`).
  - `origemSel` passa a guardar o código do almoxarifado. Nova regra: `qtdEnvio = origem === CD ? qtdAtendida : min(qtdPedido, saldo)`.
  - `onDoubleClick` no `<tr>` abre o novo `ConsultaEstoqueSkuDialog`.
- Novo `src/components/abast-dash/ConsultaEstoqueSku.tsx`:
  - Reaproveita `montarEstoqueGeral` com os dados que a tela já carrega (classificações e categorias, mesmas chaves de consulta da Visão Geral) e filtra pela SKU.
  - Renderiza a mesma linha da tabela, com `CelulaTd` extraído para um arquivo compartilhado, e os botões "Usar como origem".
- Migração: `abast_criar_transferencia` passa a aceitar como `p_loja_origem` qualquer código de almoxarifado, não só lojas cadastradas. A validação passa a ser feita contra os almoxarifados conhecidos (`origens` / `estoque_sistemico`), mantendo a autoria pela sessão e a mesma RLS.
- O DE-PARA de Processo do 05304043 continua igual para a origem CD.
- Verificação no navegador: trocar a origem para Processo e para outra loja, abrir a janela com clique duplo, usar "Usar como origem" e gerar uma transferência de teste.
