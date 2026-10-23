# Correção de grupos das Baixas Operacionais

## Disponibilidade: detalhes por coluna do dia
- [ ] Abrir itens da foto diária por duplo clique, com entrada, resolução e duração da ocorrência; verificar testes e tela autenticada.

## Pedidos: aprovação somente comercial
- [x] Remover etapa do Diretor, aprovar ressalvas e extras direto para separação, preservar estoque e retorno administrativo; tela autenticada verificada e 13 testes passaram, incluindo aprovação transacional sem persistência.

## Fracionamento nas ressalvas comerciais
- [x] Adicionar opção por produto e preservar limite de estoque; aprovação agora exclusivamente comercial. Seis testes de fracionamento passaram.

## Pedidos: retorno de status
- [x] Adicionar retorno ao status anterior exclusivo para administrador e verificar permissões e fluxo.

## Reposição de Lojas: apresentação
- [x] Remover Grupo, Família e Caixa da lista; mostrar Classe do portfólio aprovado após Produto.
- [x] Permitir maximizar e restaurar a lista, preservando filtros e pedidos manuais.
- [x] Verificar a lista autenticada e tratar os três alertas de segurança listados.

## Menu Abastecimento e segurança
- [x] Ocultar Disponibilidade e rupturas e Indicadores do menu, preservando páginas e dados.
- [x] Ordenar: Dashboard de Disponibilidade, Projeção do CD e Plano, Reposição de Lojas, Pedidos, Validação do Gestor e Parâmetros.
- [x] Verificar menu autenticado e corrigir os três alertas de leitura listados neste pedido.

## Portfólio de Abastecimento conforme anexos
- [x] Preparar diagnóstico e plano incremental antes de alterações estruturais.
- [x] Confirmar Inovação por três meses, aprovação com vigência na data e leitura para equipe aprovada.
- [ ] Identificar quem representa Cadastro Central e Comercial (aguarda definição; manter apenas Admin até lá).
- [x] Criar classificação versionada, importação e prévia; testar prévia dos 63 SKUs sem gravar o anexo.
- [ ] Validar gravação real da importação (aguarda datas reais de início dos quatro SKUs de Inovação).
- [ ] Implementar sortimento, aprovação versionada e indicadores (aguarda aprovação da próxima etapa).
- [ ] Validar regras e regressões de vendas, estoque e reposição.
- [x] Limitar leitura de fichas técnicas, períodos sazonais e necessidades de materiais à equipe aprovada; testes hosted passaram e três alertas foram marcados como corrigidos.

## Destaque MoM e segurança
- [x] Mover a análise MoM para o topo do dashboard, preservando os cálculos existentes.
- [x] Validar a posição e a exibição do gráfico.
- [x] Definir com o usuário leitura para equipe aprovada e aplicar proteção aos três dados sinalizados.
- [x] Validar acesso real para equipe aprovada, bloquear perfil ausente e registrar correção dos três alertas.

- [x] Preencher os 115 códigos sem grupo a partir da planilha, preservando cadastros existentes.
- [x] Carregar todos os grupos no dashboard e tratar falhas de consulta.
- [x] Validar cadastro, totais, dashboard e exportação HTML: zero baixas sem grupo, 999 baixas intactas, 1.561 grupos carregados, total do período preservado em R$ 86.826,33 e recuperação de falha testada.

## Filtro de status na execução de missão
- [x] Permitir selecionar mais de um status ao mesmo tempo (Pendente, Acurado, Divergente, Quebra de FEFO).
- [x] Validar na tela: 24 (Acurado) → 42 (+Divergente) → 43 (+Quebra de FEFO), "Limpar" volta a 43.

## Abastecimento: ordenar e filtrar por Sugestão
- [x] Adicionar "Ordenar por: Sugestão (maior → menor)" na tela de Abastecimento.
- [x] Adicionar filtro "Somente com sugestão" (traz apenas itens com sugestão de abastecimento).
- [x] Validar na tela: 269 linhas → 43 com sugestão (mín. 1) e ordem 270, 47, 42, 36, 35… descendente.

## Parâmetros no pilar Abastecimento
- [x] Desfazer o subgrupo "Parâmetros" criado em Suprimentos e mover Importar Consumo e Sazonalidade para o Parâmetros já existente em Abastecimento.

## Dashboard de Disponibilidade: ordem dos blocos
- [x] Manter os cards de local logo abaixo dos indicadores e colocar o gráfico de evolução + Top itens em seguida.
- [x] Mover a tabela de posição por local para abaixo do gráfico + Top itens.
- [x] Validar na tela a nova ordem e o filtro por card e por linha.

## Reposição de Lojas: nomes e títulos curtos
- [x] Abreviar os botões de loja (CD, L. Jesu, L. Patio, L. Eldo) mantendo o nome completo no tooltip.
- [x] Abreviar os títulos das colunas: A caminho → Transi, Demanda/dia → CMD, Cob. pós-pedido (dias) → Cobertura, com o significado no tooltip.
- [x] Abreviar também as lojas na lista de Origem e no título da lista maximizada.
- [x] Validar na tela: botões, cabeçalhos e opções de Origem com nomes curtos, sem erro de console.

## Menu lateral
- [x] Ocultar "Cadastro de E-mails" do menu principal; tela segue acessível por link direto e como "E-mails" em Cadastro.
