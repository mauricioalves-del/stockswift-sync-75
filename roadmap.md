# Correção de grupos das Baixas Operacionais

## Atlas: seletor na análise MoM
- [ ] Adicionar IAP (valor), IAQ (quantidade), Item a item e Valor Mod (R$), preservando os cálculos e verificando as quatro opções na tela.

## Pré-inventário: quatro ajustes solicitados
- [x] Novo item com etapa, obrigatoriedade, bloqueio de duplicadas, ordem máxima e histórico; remoção confirmada com histórico, apenas gestor em AGENDADO.
- [x] Acrescentar os dois itens padrão e atualizar exclusivamente a função de pendências, incluindo ações pós-inventário.
- [x] Onze testes passaram; tela autenticada confirmou padrões, duplicadas, etapas, confirmação de remoção e quinta pendência sem erros. Inclusão/remoção persistidas não exercitadas para não alterar o checklist real; políticas Atlas preservadas conforme decisão anterior.

## Pedidos: descrição e estoque nos extras
- [x] Corrigir prioridade da descrição registrada e fallback do estoque nativo, inclusive catálogo que repete SKU, espaços e nomes vazios; 13 testes passaram e pedido 30 autenticado mostrou descrição e 1.000 disponíveis sem erros.
- [ ] Completar nomes de 190 insumos sem descrição nem no catálogo nem no estoque nativo (aguarda fonte com as descrições reais; manter itens visíveis, sem inventar ou apagar).
- [x] Exibir descrição completa e saldo disponível na origem, inclusive para catálogo com saldo zero; dividir consultas abaixo do limite de 500 SKUs. Pedido 30 autenticado confirmou embalagem 0190213058, descrição e 1.000 disponíveis, sem erros; 11 testes passaram. Produtos sem descrição cadastrada são identificados; alertas Atlas preservados conforme decisão anterior.

## Reposição: baixas operacionais em aberto
- [x] Vincular os quatro estados da fila em aberto por produto e almoxarifado; descontar do planejamento, CD e origens alternativas; validar criação/aprovação no banco sem alterar estoque ou fotos históricas.
- [x] 26 testes passaram, incluindo bloqueios transacionais sem persistência; tela autenticada confirmou SKU 05004139 no Pátio: 72 no sistema, 12 em baixas, 60 líquidos, sem erros.
- [ ] Três alertas Atlas permanecem ativos: usuário recusou ignorá-los; regras de leitura preservadas conforme decisão anterior.

## Pedidos: insumos
- [x] Incluir revenda, embalagens e matérias-primas em Adicionar Produto; tela autenticada verificada com inclusão de embalagem e 13 testes passaram, incluindo aprovação dos três grupos, requisição e bloqueio de excesso sem persistir pedidos de teste. Regras de leitura do Atlas preservadas por decisão explícita; três alertas permanecem ativos.

## Farol de recebimento: nota 18412
- [x] Confirmar nota 1842 antiga, não atualizada desde 09/10; regularizar somente a pendência confirmada pelo usuário, preservando quantidade, valor e data não informada, com auditoria.
- [x] Conferir o Farol autenticado: zero notas, zero itens, R$ 0,00 e nenhum erro; preservar regras de leitura do Atlas.

## Atlas: formato dos gráficos
- [x] Manter A; posicionar Tendência (B) e Causas (C) lado a lado, com Mensal (D) e Almoxarifado (E) abaixo; projeção por regressão linear em dias reais verificada com cinco testes e painel autenticado, incluindo filtro mensal; regras de leitura intactas.
- [x] Ajustar os gráficos dos quatro painéis ao formato dos HTML enviados, preservando os dados e cálculos de origem.
- [x] Verificar as quatro telas autenticadas e o filtro mensal: gráficos renderizados e sem erros; regras de leitura preservadas por decisão do usuário, três alertas permanecem ativos.

## Disponibilidade: detalhes por coluna do dia
- [x] Abrir itens da foto diária por duplo clique, com entrada, resolução e duração da ocorrência; quatro testes passaram e a tela autenticada confirmou o SKU 05004048 em ruptura em 16/10, resolvido em 17/10 (1 dia), sem alterar fotos.

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

## Atlas: fase 2 e regras de leitura
- [x] Aplicar no banco a migration 20261025090000_atlas_fase2.sql (coluna que liga almoxarifado do Atlas ao Stock Savvy), SQL idêntico, sem tocar dados ou telas.
- [x] Confirmar por decisão do usuário que a leitura do histórico do Atlas segue exatamente como na migration do histórico (todos os logados leem, exceto usuários, log de auditoria e controle de importação, que só gestor lê; escrita só gestor) — nada foi alterado, alertas de segurança registrados como decisão aceita.
- [x] Aplicar no banco a migration 20261026100000_atlas_assinatura_fechamento.sql (SQL idêntico: INSERT do Diretor de Operações e do Coordenador Financeiro em atlas_conciliacoes_ciencia e atlas_log_auditoria); políticas confirmadas no banco, sem tocar telas ou dados.
