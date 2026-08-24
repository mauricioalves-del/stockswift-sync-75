# Degustação deixa de ser tratada como perda

## Problema observado

Na Ação de Lote de **Degustação** (SKU 05104085, lote 080010400N000020126), ao vincular a baixa operacional de Degustação de 3 unidades o sistema zera a **Quantidade recuperada** e devolve **Valor recuperado R$ 0,00** e **Saving −R$ 4,18** — ou seja, a ação aparece como prejuízo.

Duas causas, ambas confirmadas no cálculo atual:

1. **A baixa vinculada é sempre descontada.** A quantidade recuperada é calculada como "endereçada − quantidade da baixa". Como a baixa de Degustação é justamente a execução da ação, a recuperação vira zero. Isso vale para qualquer baixa cujo motivo corresponde ao tipo da ação (Degustação, Cortesia, Sensorial/Inovações, Envio/Laboratório).
2. **Degustação recupera apenas 50% do custo.** A regra atual usa metade do custo unitário, o que sempre deixa o saving negativo (recuperação menor que o custo total em risco). No agregado hoje: 30 ações de Degustação com valor recuperado R$ 571,10 e saving **−R$ 643,77**.

## O que muda

- **Baixa "de execução" não desconta a quantidade recuperada.** Quando o motivo da baixa vinculada corresponde ao tipo da ação (ex.: ação Degustação + baixa por Degustação), a quantidade da baixa passa a ser considerada como quantidade efetivamente recuperada, não como perda. Baixas de motivo de perda (Avaria, Vencimento, Descarte/Qualidade, Perda/Furto) continuam descontando normalmente.
- **Degustação passa a recuperar 100% do custo** (recuperação de custo), como já ocorre em "Recuperação de Custo (Produção)". Com isso, uma degustação totalmente executada fica com saving zero em vez de negativo — deixa de figurar como perda.
- **Descarte segue sendo perda** — nada muda ali.

No exemplo da tela: quantidade recuperada 3, valor recuperado R$ 4,18, saving R$ 0,00.

## Impacto nos registros existentes

As 30 ações de Degustação já lançadas continuam com os valores antigos gravados até serem recalculadas. O recálculo em massa (botão **Recalcular valores** na tela de Ações de Lote) aplica a nova regra a todas elas, corrigindo também o Dashboard Executivo de Shelf Life.

## Detalhes técnicos

- `src/lib/shelf-life-financeiro.ts`: categoria `Degustação` passa a usar `q × custo` em `valorRecuperadoCalculado` (remove o fator 0,5).
- `src/lib/shelf-life-recalculo.ts`: `ContextoCalculo` ganha um sinalizador indicando se a baixa vinculada é "execução da ação" (motivo casa com o tipo) ou "perda"; só no segundo caso a quantidade é subtraída da endereçada.
- Chamadores atualizados para informar o motivo da baixa: `CampanhaDialog.tsx`, `RecalcularValoresDialog.tsx` e `autoVincularBaixas` em `src/hooks/useShelfLife.ts` (que já carrega `motivo_baixa_id` e o mapa tipo → motivo).
- Sem alteração de schema; nenhum dado é reescrito automaticamente — apenas pelo recálculo em massa acionado pelo usuário.
