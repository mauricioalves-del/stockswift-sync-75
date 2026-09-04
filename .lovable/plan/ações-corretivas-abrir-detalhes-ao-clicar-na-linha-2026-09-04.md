# Ações Corretivas: abrir detalhes ao clicar na linha

Hoje, na aba "Ações Corretivas" da tela Dispersão de Lote, a linha é apenas informativa: não há nenhum clique associado, só o seletor de status na ponta direita. Por isso nada acontece ao clicar.

## O que passa a existir

Ao clicar em qualquer ponto da linha, abre uma janela de detalhes da ação com:

- **Cabeçalho**: material com a descrição do produto (não só o código), período de referência, data de abertura e status atual.
- **Contexto do desvio**: os lançamentos de consumo daquele material no período — ordem de produção, data, previsto, consumido, diferença e impacto em R$, ordenados do maior impacto para o menor. Quando a ação estiver ligada a um lançamento específico, ele aparece destacado.
- **Descrição completa** da ação (hoje a coluna corta o texto).
- **Responsável** e quem abriu/fechou, com as datas.
- **Acompanhamento**: campo para registrar novas anotações de andamento, com histórico em ordem cronológica (autor + data).
- **Ações**: mudar status (mesmas regras de permissão de hoje — concluir só para Administrador/Coordenador) e atalhos para a tela do material e para a lista detalhada filtrada por material/período.

A linha ganha indicação visual de que é clicável (cursor e realce ao passar o mouse). O seletor de status na coluna final continua funcionando sem abrir a janela.

## Detalhes técnicos

- Novo componente `src/components/producao/DetalheAcaoCorretivaDialog.tsx`; `AcoesCorretivas` em `src/routes/_authenticated/producao.dispersao.tsx` passa a controlar o estado da ação selecionada e adiciona `onClick` na `TableRow` (com `stopPropagation` na célula do seletor).
- Descrição do material resolvida com a mesma cascata já usada na tela (`Id_produto → Id_subconjunto → Id_item` em `ficha_tecnica_bom`, via `fetchAll`).
- Lançamentos do contexto lidos de `v_impacto_consumo` filtrando material e `ano_mes` da ação.
- Acompanhamento exige uma tabela nova `dispersao_acao_comentarios` (ação, texto, autor, data) com RLS: leitura para usuários autenticados, inserção pelo próprio autor, edição/exclusão só pelo autor ou Administrador. Essa migração é apresentada para aprovação antes do restante do código.
