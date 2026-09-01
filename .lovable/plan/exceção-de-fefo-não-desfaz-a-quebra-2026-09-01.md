# Exceção de FEFO não desfaz a quebra

## O que está acontecendo (verificado nos dados)

- A exceção `0190213114` / lote `0213100001002026` foi cadastrada às 19:51.
- As checagens do dia 28/08 que aparecem como "QUEBRA DE FEFO" foram gravadas às 19:41 — **antes** da exceção existir.
- O motor só consulta a lista de exceções no momento em que processa o dia. Cadastrar uma exceção depois não reavalia nada, então a linha continua vermelha até alguém reprocessar manualmente.

Segundo problema encontrado na mesma regra: a comparação de produto na checagem de exceção usa o código "normalizado" (cortado em 8 dígitos). Com isso, a exceção de `0190213114` passaria a valer também para `0190213105`, `0190213106`, `0190213165` etc., que compartilham o prefixo `01902131`. Isso esconderia quebras reais.

## Correção

1. **Exceção passa a valer na hora**
   - Ao adicionar, editar ou excluir uma exceção, o sistema reprocessa automaticamente os dias já analisados que envolvem aquele produto/lote. A linha sai do vermelho (ou volta a ficar vermelha, se a exceção for removida) sem nenhum clique extra.

2. **Comparação por código exato**
   - A exceção passa a casar pelo código do produto exatamente como cadastrado, e não pelo prefixo de 8 dígitos, evitando que uma exceção "apague" quebras de outros produtos parecidos.

3. **Reprocessar o histórico atual**
   - Rodar o reprocessamento dos dias já analisados para que as duas exceções já cadastradas (`0190213114` e `05004047`) tenham efeito imediato.

## Detalhes técnicos

- Migração ajustando `public.processar_fefo`: na cláusula de exceção, comparar `upper(btrim(e.id_produto)) = upper(btrim(f.id_produto))` em vez de `fefo_norm_sku(...)`, mantendo o casamento de lote como está.
- Nova função `public.reprocessar_fefo_dias_afetados()` (security definer) + trigger `AFTER INSERT/UPDATE/DELETE FOR EACH STATEMENT` em `excecoes_fefo`, chamando `processar_fefo` para cada data distinta presente em `checagens_fefo` (janela dos últimos 45 dias, mesma janela do trigger de movimentações). Idempotente, pois `processar_fefo` já apaga e regrava o dia.
- Executar `processar_fefo` para as datas existentes (28/08, 31/08, 01/09) após a migração.
- Nenhuma alteração de UI, de importação ou das demais regras do motor.
