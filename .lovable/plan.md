# Módulo PCP — Planejamento e Controle de Produção

Novo módulo dentro do pilar **Produção**, ao lado de Dispersão de Lote. Reaproveita `ficha_tecnica_bom`, `estoque_sistemico` e `producao_consumo` já existentes. Vou entregar em ondas para não estourar créditos — cada onda validável isoladamente.

## Decisões que preciso confirmar antes de codar

1. **Perfil responsável pelo PCP**: o prompt assume `GERENTE` como operador. Confirmo que uso **ADMINISTRADOR + GERENTE** com permissão de Cancelar restrita ao Admin, ou existe um perfil dedicado que devo usar?
2. **Almoxarifado de produção**: qual origem alimenta a lista? Uso os mesmos códigos de `origens`/`usuario_almoxarifados` já cadastrados (mesmo padrão de Baixas Operacionais)?
3. **Estoque para disponibilidade**: hoje o projeto tem `estoque_sistemico` (saldo agregado por SKU/almox). Não vejo tabela `estoque_lotes` separada — o cruzamento de disponibilidade será feito contra `estoque_sistemico` filtrado por almoxarifado da OP. OK?

Se estiver tudo OK, sigo pela **Onda 1**.

## Onda 1 — Modelo de dados + catálogo de módulo

Migração:
- `ordens_producao` com todos os campos do item 1, incluindo `op_pai_id` autorreferente e `origem_demanda` (enum `MANUAL` | `SUGESTAO_ABASTECIMENTO`).
- `necessidade_materiais_op` com FK para `ordens_producao` e `op_filha_id` autorreferente (via `ordens_producao`).
- GRANTs + RLS: leitura para autenticados; escrita para ADMINISTRADOR/GERENTE; Cancelar só ADMINISTRADOR (via `has_role`).
- Inserir `PRODUCAO_PCP` em `modulos_sistema`.
- Triggers `update_updated_at_column` nas duas.

## Onda 2 — Motor de explosão de BOM (núcleo, isolado)

`src/lib/pcp-bom.ts`:
- `explodirBOM(idProduto, qtd, bomRows)` recursivo, retornando lista consolidada de folhas (matéria-prima) + itens intermediários `gera_oc = S` marcados como `eh_semiacabado`.
- Proteção contra ciclo (Set de visitados na cadeia).
- Multiplicação em cascata da quantidade.
- Teste manual no console com um produto de 2 níveis antes de partir para tela.

## Onda 3 — Criação e detalhe da OP (manual)

- Rota `src/routes/_authenticated/producao.pcp.tsx` — quadro/lista com filtros (Produto, Status, Período, Almoxarifado).
- Rota `src/routes/_authenticated/producao.pcp.$id.tsx` — detalhe:
  - Cabeçalho da OP + ações de status.
  - Tabela de necessidade (resultado do explodir) com badge Suficiente/Insuficiente comparando contra `estoque_sistemico` do almoxarifado.
  - Botão "Gerar Demanda Extra" por linha insuficiente (reaproveita `demanda_extra` já existente).
- Diálogo "Nova OP" (produto autocomplete a partir de `id_produto` distinto em `ficha_tecnica_bom`, quantidade, data, almoxarifado).
- Ao criar OP: rodar explosão e gravar `necessidade_materiais_op` em batch.

## Onda 4 — Ciclo de status + fechamento em `producao_consumo`

- Ações Planejada → Liberada → Em Produção → Concluída + Cancelar.
- Liberada permite avanço mesmo com pendência de material (com aviso).
- Concluir abre diálogo: `quantidade_produzida_real` + edição do consumo real por material (pré-preenchido com o previsto de `necessidade_materiais_op`).
- Ao salvar Conclusão: inserir uma linha em `producao_consumo` por material (AnoMes derivado de `data_conclusao_real`, `qtd_previsto` da necessidade, `qtd_consumo` do formulário) — fechando o ciclo com Dispersão de Lote sem novo upload.

## Onda 5 — OP filha para semiacabados

- Na tabela de necessidade, botão "Gerar OP para este item" nas linhas `eh_semiacabado = true` e sem `op_filha_id`.
- Cria nova `ordens_producao` com `op_pai_id`, roda explosão dela, atualiza `op_filha_id` na necessidade do pai.
- Indicador visual (badge/link) nas linhas com filha já gerada, clicável para navegar até a OP filha.

## Onda 6 — Sugestões de OP a partir do Abastecimento

- Rota `src/routes/_authenticated/producao.pcp.sugestoes.tsx`:
  - Query cruza sugestões de abastecimento (`parametros_abastecimento`/planejamento existente) com `DISTINCT id_produto` de `ficha_tecnica_bom`.
  - Ação "Aceitar e Gerar OP" cria a OP com `origem_demanda = SUGESTAO_ABASTECIMENTO` e `referencia_id`.

## Onda 7 — Navegação + permissões

- Adicionar item **PCP** ao grupo Produção no `AppShell` (colapsável já existente).
- Gate por perfil nas ações de escrita (`useRole`).
- Registrar rota nas permissões da matriz existente.

## Validação final

Ciclo end-to-end: criar OP manual de produto com 2+ níveis, gerar OP filha do semiacabado, concluir ambas, verificar que aparecem em Dispersão de Lote sem upload manual.
