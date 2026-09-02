# Correção do FEFO — lote atual por código exato e histórico imutável

## Objetivo

Corrigir a coluna **Lote mais antigo** para refletir o estoque atual do produto correto, sem cruzamentos por código aproximado, e impedir que reprocessamentos alterem dias já encerrados.

## Diagnóstico confirmado

- O motor ainda usa `fefo_norm_sku` para relacionar movimentação e estoque, em vez de comparar exclusivamente o código integral exibido na coluna **Produto**.
- A coluna **Lote mais antigo** só é preenchida quando existe quebra ou exceção; por isso, produtos que têm estoque atual aparecem com `—`.
- `processar_fefo` apaga todas as checagens do dia antes de recriá-las, e os gatilhos de estoque/exceção podem reprocessar dias anteriores. Isso permite substituir resultados históricos.
- O estoque atual possui, para os SKUs analisados, linhas por código exato, origem, lote, saldo e validade que não estão sendo integralmente refletidas no detalhamento.

## Implementação

1. **Usar somente o código exato do produto**
   - Alterar o motor FEFO para relacionar `movimentacoes_diarias.id_produto` a `estoque_sistemico.id_produto` por igualdade do código completo, normalizando apenas espaços e caixa.
   - Remover do processamento de lotes qualquer fallback por prefixo, código truncado ou lote sem confirmação do SKU.
   - Buscar a validade do lote movimentado também pelo par exato **produto + lote**; não haverá fallback por lote isolado de outro produto.

2. **Registrar o lote mais antigo real em todas as análises**
   - Para cada movimentação auditada, consultar todos os lotes com saldo positivo do SKU exato no almoxarifado de origem.
   - Ordenar por validade mais próxima e usar o lote como desempate determinístico.
   - Gravar sempre em `checagens_fefo` o lote mais antigo atual, saldo e validade, inclusive quando ele for o próprio lote movimentado e o status for OK.
   - Manter a quebra somente quando existir outro lote elegível com validade anterior ao lote movimentado.

3. **Guardar o retrato completo do estoque usado no cálculo**
   - Criar uma tabela filha de snapshot vinculada à checagem, contendo código do produto, origem, lote, quantidade, validade e data de importação do estoque.
   - Gravar nela todos os lotes com saldo positivo considerados em cada processamento, permitindo conferir posteriormente exatamente qual estoque sustentou o resultado.
   - Aplicar GRANTs e RLS equivalentes à leitura protegida do módulo FEFO.

4. **Congelar dias passados**
   - Fazer `processar_fefo` recusar alterações em datas anteriores ao dia atual no fuso `America/Sao_Paulo`.
   - Ajustar os gatilhos de movimentação e de exceções para processarem somente o dia corrente.
   - Manter intactas as checagens históricas e seus snapshots; nenhuma limpeza ou regravação retroativa será executada.
   - No dia corrente, o reprocessamento atualizará o retrato do dia com o estoque mais recente, sem tocar nos dias encerrados.

5. **Ajustar o detalhamento e validar**
   - Exibir na coluna **Lote mais antigo** o lote, saldo e validade efetivamente gravados pelo motor, tanto para OK quanto para quebra.
   - Manter exceções já cadastradas, aplicadas somente quando o par **código exato + lote mais antigo** coincidir.
   - Validar com os SKUs mostrados no relatório, comparando painel e `estoque_sistemico` por código exato e origem.
   - Confirmar que reprocessar hoje atualiza os dados atuais e que tentar reprocessar um dia passado não altera nenhuma linha.

## Arquivos e banco envolvidos

- Migração do banco: função `processar_fefo`, gatilhos de reprocessamento e nova tabela de snapshots de lotes.
- `src/routes/_authenticated/suprimentos.fefo.index.tsx`: apresentação completa do lote mais antigo gravado.
- Tipos gerados do backend serão atualizados pelo fluxo da migração, sem edição manual.