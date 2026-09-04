# Ações de lote: abrir a janela completa no Planejamento de Tarefas

Hoje, no duplo clique de uma linha "Ação de lote", aparece a janelinha simples do primeiro print (só responsável, status, prioridade, data e descrição). Isso acontece porque essas tarefas antigas não guardaram o vínculo com a ação de lote — só a ação criada em 03/09 tem vínculo. Sem vínculo, o sistema cai no detalhe genérico da tarefa.

## O que passa a existir

Duplo clique em uma ação de lote pendente abre uma janela no mesmo padrão do segundo print, com:

- **Cabeçalho**: código do produto — descrição do produto.
- **Faixa de dados**: lote, tipo de ação (Degustação, Desconto Colaborador, Forçar Produção, Transformação, Outro), data da ação, responsável, quantidade/unidade, almoxarifado, valor recuperado e status atual da ação.
- **Descrição/observação** completa da ação.
- **Contexto**: dados financeiros do lote (custo unitário, valor total, recuperação estimada) na mesma leitura já usada na tela de Ações de Shelf Life.
- **Acompanhamento**: registro de novas anotações com histórico (autor e data).
- **Ações**: mudar o status da ação (Planejada / Em Andamento / Concluída, com a mesma regra de permissão de hoje) e um atalho "Abrir na tela de Ações de Lote".

A janela genérica da tarefa continua existindo apenas para tarefas que realmente não são ação de lote nem ação corretiva.

## Recuperar o vínculo das ações antigas

As tarefas antigas passam a encontrar a ação certa por combinação exata de código do produto + tipo de ação + data, que é única nos registros existentes (por exemplo, "Degustação — 05104022" de 24/08 corresponde ao lote 050010401D888890226). Quando a correspondência é encontrada, ela é gravada na tarefa, de modo que a busca só acontece uma vez. Se houver mais de um candidato ou nenhum, a tarefa abre o detalhe genérico como hoje — sem risco de abrir a ação errada.

## Detalhes técnicos

- Migração: `UPDATE tarefas_operacionais` preenchendo `campanha_lote_id` por junção `campanhas_lote` (sku = `sku_ou_local`, `tipos_acao_shelf_life.nome` extraído do título, `data_acao = data_prevista`), aplicada só quando o match é único; e nova tabela `campanha_lote_comentarios` (campanha_id, texto, autor_id, autor_nome, timestamps) com RLS espelhando `dispersao_acao_comentarios`.
- Novo componente `src/components/shelf-life/DetalheAcaoLoteDialog.tsx` no mesmo layout de `DetalheAcaoCorretivaDialog.tsx`, lendo `campanhas_lote` + `tipos_acao_shelf_life` + descrição do produto (mesma cascata `Id_produto → Id_subconjunto → Id_item`) e usando os cálculos de `src/lib/shelf-life-financeiro.ts`.
- `src/routes/_authenticated/gestao.planejamento.tsx`: `abrirTarefa` resolve o vínculo direto, senão tenta o match único em tempo de execução (e persiste), e passa a abrir `DetalheAcaoLoteDialog` no lugar de `CampanhaDialog`; fallback do detalhe da tarefa permanece.
- Validação com build, verificação de tipos e teste de duplo clique em uma ação antiga (05104022) e na recente (05004011).
