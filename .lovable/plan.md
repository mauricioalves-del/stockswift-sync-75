# Envio de Risco de Shelf para o Slack (Trend)

## O que o usuário verá
1. **Mapeamento de Risco**: caixa de seleção em cada linha e "selecionar todos os filtrados". Uma barra aparece com "N lotes · R$ X" e o botão **Enviar ao Slack**.
2. **Janela de envio**:
   - Campo **Observação** (obrigatório).
   - **Almox**: preenchido com o almox dos lotes escolhidos (se forem vários, mostra a lista).
   - **Departamentos**: lista com marcação, já pré-selecionada a partir do cadastro fixo; os responsáveis aparecem abaixo.
   - Pré-visualização do título e da tabela antes de enviar.
3. **No canal do Slack**:
   - Mensagem principal (Trend): `:warning: Risco de Shelf - {Observação} - Almox - {Almox} - {dd/mm/aaaa}`
   - Comentário dentro da Trend: "Para tratativa:" e a marcação real (@nome) de cada responsável, encontrado pelo email de login; caso o email não seja encontrado no Slack, o email aparece em negrito.
   - Abaixo, a tabela com SKU, Produto, Lote, Almox, Validade, **Dias para vencer**, Qtd e **Custo contábil** (em destaque), mais o total. Listas longas são divididas em mais de um comentário.
4. **Configurações → Responsáveis Slack – Shelf**: cadastro dos departamentos (Qualidade, Comercial, Suprimentos…) e dos usuários do sistema em cada um. Acesso restrito a Administrador e Coordenador de Controle.
5. **Histórico**: cada envio fica registrado (quem enviou, lotes, link da Trend, erro se houver).

## Configuração do Slack
- Conectar o Slack como **bot** pelo cartão de conexão (autorização feita uma vez). Depois, convidar o bot para o canal, caso o canal seja privado, e selecionar o canal no cadastro.
- O link de webhook enviado no chat não será usado neste fluxo, porque ele não consegue criar a Trend nem marcar pessoas. O aviso de baixas continua usando o link atual.

## Detalhes técnicos
- Migração com as tabelas `shelf_slack_departamentos`, `shelf_slack_responsaveis` (departamento, user_id) e `shelf_slack_envios` (log), além da chave `slack_canal_shelf` em `app_config`. Elas terão RLS: equipe aprovada lê, apenas gestores escrevem e quem envia insere o próprio registro de log.
- Server function autenticada `enviarRiscoShelfSlack` (requireSupabaseAuth): recebe os ids/chaves dos lotes, observação e departamentos; relê os lotes no servidor (custo/validade, sem confiar no navegador); busca os emails dos responsáveis em `profiles` e chama o Slack pela conexão do bot: `users.lookupByEmail` → `chat.postMessage` (Trend) → `chat.postMessage` com `thread_ts` (menções + tabela em blocos/código formatado, divididos em partes de cerca de 40 linhas).
- Erros do Slack (`not_in_channel`, `channel_not_found`) aparecem na tela e ficam registrados no log.
- Teste unitário para a montagem do título, o cálculo de dias para vencer, o total do custo contábil e a divisão em partes.
