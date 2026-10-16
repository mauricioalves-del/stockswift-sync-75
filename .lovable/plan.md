# Pedidos de Abastecimento: aprovação comercial e do Diretor de Operações

## Novo fluxo

```text
Gerar pedido -> Aguardando aprovação comercial
   |-- Aprovado pelo gerente comercial -> cria a requisição -> Em separação -> Separado -> Enviado -> Recebido
   |-- Com ressalvas (observação + itens extras sugeridos) -> Aguardando Diretor de Operações
          |-- Atender com as sugestões  -> itens extras entram no pedido -> cria requisição -> segue
          |-- Atender como foi gerado   -> cria requisição com os itens originais -> segue
          |-- Cancelar pedido           -> Cancelado
```

- **Quem aprova primeiro:** o Gerente Comercial já designado como signatário na Validação do Gestor (mesmo cadastro, sem nova tela de designação). O administrador também pode aprovar.
- **Diretor de Operações:** quem tem o perfil Diretor de Operações (ou administrador).
- **Requisição de separação só nasce depois da aprovação**; antes disso o CD não vê o pedido.
- Pedidos de **transferência entre lojas** seguem o mesmo fluxo.
- Os pedidos já existentes não mudam de etapa.

## Na tela Pedidos

- Novas etapas na trilha: **Aguard. comercial** e **Aguard. diretor**, com filtros próprios e contagem.
- Para o gerente comercial, em pedidos aguardando: botões **Aprovar** e **Aprovar com ressalvas**.
  - "Com ressalvas" abre uma janela com **Observação (obrigatória)** e uma lista para **sugerir produtos extras**, restrita ao catálogo aprovado (portfólio validado da loja), com quantidade por item.
- Para o Diretor de Operações, em pedidos aguardando diretor: janela mostrando o pedido original, as ressalvas e os itens sugeridos, com os botões **Atender com sugestões**, **Atender sem sugestões** e **Cancelar**, mais campo de observação própria.
- Ao abrir o pedido (linha expandida): histórico de aprovação — quem aprovou, quando, observações, e itens sugeridos marcados como "Sugestão comercial".
- Pedidos aguardando aprovação contam como "a caminho"? Não — só passam a abater a sugestão da Reposição após aprovados.

## Detalhes técnicos

- Migração: novos status `AGUARD_COMERCIAL` e `AGUARD_DIRETOR` em `abast_pedidos`; colunas `aprov_comercial_por/em/obs`, `aprov_diretor_por/em/obs/decisao`; `abast_pedido_itens.origem` aceita `SUGESTAO_COMERCIAL` com flag `aceito`.
- `abast_criar_pedido` / `abast_criar_transferencia` passam a gravar o pedido em `AGUARD_COMERCIAL` sem criar requisição; a criação da requisição é extraída para uma função interna chamada na aprovação.
- Novas RPCs security definer, autor derivado da sessão: `abast_aprovar_comercial(p_id, p_aprovado, p_obs, p_itens_sugeridos)` (valida `abast_eh_signatario(auth.uid(),'GERENTE_COMERCIAL')` e SKUs dentro do portfólio aprovado da loja) e `abast_decidir_diretor(p_id, p_decisao, p_obs)` (valida `has_role DIRETOR_OPERACOES`).
- Ajustar a leitura de "a caminho" na Reposição para ignorar os dois status novos.
- Tela `abastecimento.pedidos.tsx`: novas etapas, filtros, diálogos de aprovação e histórico.
- Teste das regras: só signatário comercial aprova; sugestão fora do portfólio é recusada; requisição só existe após aprovação.
