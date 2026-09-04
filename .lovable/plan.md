# Corrigir abertura das ações pendentes no Planejamento de Tarefas

## Resultado esperado

Na tela **Planejamento de Tarefas**, um duplo clique em uma linha pendente abrirá uma janela com os detalhes da tarefa e da ação vinculada. Linhas concluídas ou canceladas continuarão apenas para consulta e não dispararão essa abertura.

## Implementação

- Adicionar `onDoubleClick` às linhas com status `Pendente`, `EmAndamento` ou `Atrasada`, com cursor e realce visual para indicar que são interativas.
- Manter o botão de exclusão independente, impedindo que seu clique seja interpretado como abertura da linha.
- Ao abrir uma **Ação corretiva de Produção**, localizar o registro pelo identificador já salvo na tarefa e exibir o pop-up existente com material, OP, descrição, contexto do desvio, acompanhamento e status.
- Ao abrir uma **Ação de Lote**, localizar a campanha pelo vínculo `campanha_lote_id` e exibir o formulário já existente da ação com seus dados completos.
- Para tarefas antigas que não possuem vínculo com uma ação, abrir uma janela de detalhes da própria tarefa em vez de deixar o duplo clique sem resposta. Não será feita associação automática apenas pelo SKU, evitando abrir a ação errada.
- Preservar filtros, exclusão e demais comportamentos atuais da lista.

## Validação

- Testar o duplo clique em uma ação corretiva pendente e confirmar a abertura do detalhe correto.
- Testar o duplo clique em uma ação de lote pendente com vínculo e confirmar a abertura da campanha correta.
- Testar uma tarefa antiga sem vínculo e confirmar a abertura do detalhe básico.
- Confirmar que clique simples não abre o pop-up e que o botão de exclusão continua funcionando isoladamente.
- Validar a tela em computador e celular, além de verificar erros de execução e compilação.
