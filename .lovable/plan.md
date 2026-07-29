## Contexto verificado na base

- Não existe tabela `estoque_lotes`. A base de lotes sincronizada é **`estoque_sistemico`** (colunas `id_produto`, `lote`, `descricao`, `unidade`, `quantidade`, `custo_unitario`, `id_local`, `origem`, `data_validade`). Hoje ela tem 1.664 linhas com saldo, das quais **1.208 têm validade preenchida** — ou seja, ~456 lotes cairão na faixa "Pendente de Validade". Vou usar essa tabela como fonte, sem duplicar dado.
- Motivos de baixa já cadastrados incluem **Vencimento** e **Degustação** (tabela `motivo_baixa`), que são as chaves do cruzamento do item 3.
- Baixas ficam em `baixa_operacional` (`codigo_produto`, `lote`, `quantidade`, `valor_total`, `motivo_baixa_id`, `status_fluxo`, `origem`).
- Grupo/Família vêm de `grupo_produtos` e `familias`; almoxarifado de `origens` + `usuario_almoxarifados` (restrição por loja já existente).
- Papéis existentes: `ADMINISTRADOR`, `COORDENADOR_CONTROLE`, `GERENTE` — cobrem a matriz de permissões pedida.

## Entrega por etapas

### Etapa 1 — Mapeamento de Risco (`/shelf-life/risco`)
Sem tabela nova. Cálculo em cima de `estoque_sistemico` (com `fetchAll` paginado, para não bater no limite de 1000 linhas):
- Faixas: Vencido (<0), 30, 60, 90 dias, Pendente de Validade (`data_validade` nula); >90 dias não aparece.
- Filtros: Almoxarifado, Grupo, Família, Faixa, Status de Ação (Sem Ação / Com Ação).
- Colunas: SKU, Produto, Lote, Validade, Dias para Vencer, Quantidade, Valor (qtd × custo), Faixa, Ação Vinculada.
- KPIs: valor em risco 30/60/90 e um card separado, em destaque, para "Pendente de Validade" (problema de dado).
- Botão por linha: "Criar Ação" (abre o formulário da etapa 2 já preenchido) + exportação Excel, no mesmo padrão dos outros módulos.

### Etapa 2 — Ações de Lote / Campanhas (`/shelf-life/acoes`)
Duas tabelas novas:
- `tipos_acao_shelf_life` — cadastro configurável (nome, categoria `RECEITA` ou `SAVING`, ativo), pré-carregado com Desconto Colaborador, Transformação de Produto, Forçar Produção, Degustação, Anúncio Refood, Outro. A categoria é o que decide se o valor vai para Receita Recuperada ou Saving.
- `campanhas_lote` — sku, lote, almoxarifado, tipo_acao_id, quantidade_enderecada, valor_estimado_recuperado, valor_estimado_saving, **custo_acao**, responsavel, data_acao, status (Planejada/Em Andamento/Concluída/Cancelada), observacao, baixa_operacional_id (opcional), criado_por, timestamps.

Tela CRUD com listagem filtrável, criação a partir do Mapeamento de Risco, edição de status e vínculo manual a uma baixa existente (busca por SKU+Lote).

### Etapa 3 — Cruzamento com Baixas Operacionais
- Baixa com motivo **Vencimento**, sem campanha para aquele SKU+Lote → 100% Perda.
- Com campanha Concluída → só o saldo não coberto pela `quantidade_enderecada` entra como Perda Residual; o valor da campanha vira Receita ou Saving conforme a categoria do tipo de ação.
- Baixa cujo motivo corresponde a um tipo de ação (ex.: Degustação) e que tem campanha aberta no mesmo SKU+Lote → vínculo automático em `baixa_operacional_id`, evitando contagem dupla.
- Antes de seguir para o dashboard, valido com dois casos reais na base: uma baixa por Vencimento com campanha e outra sem.

### Etapa 4 — Motor de cálculo (`src/lib/shelf-life.ts`)
Fórmulas conforme o prompt: Perda, Receita Recuperada, Saving Recuperado, Perda Evitada = Receita + Saving, ROI = Perda Evitada ÷ Custo das Ações × 100, Eficiência = Perda Evitada ÷ (Perda Evitada + Perda) × 100. Funções puras, para poderem ser ajustadas em um só lugar quando o negócio validar ROI/Eficiência.

### Etapa 5 — Dashboard Executivo (`/shelf-life/dashboard`)
Reaproveitando os componentes de gráfico já usados em Baixas/Dispersão: filtro de período, 5 KPIs, colunas empilhadas por mês (Perda / Receita / Saving), rosca Recuperação × Perda, Top 10 Recuperados, Top 10 Perda e barras horizontais por tipo de ação.

### Menu e permissões
Novo grupo "Shelf Life" no menu lateral com as três telas, registro dos módulos em `modulos_sistema`, e RLS: leitura para ADMINISTRADOR/COORDENADOR_CONTROLE/GERENTE; criação/edição de campanhas para os três; vínculo manual de baixa restrito a ADMINISTRADOR e COORDENADOR_CONTROLE.

## Pontos técnicos

- Migrações incluem GRANTs e RLS por tabela nova, trigger de `updated_at` e seed dos tipos de ação.
- "Almoxarifado" será `origem`/`id_local` de `estoque_sistemico`, respeitando `almoxarifados_permitidos` do usuário.
- Nenhuma coluna nova em `baixa_operacional`; o vínculo mora em `campanhas_lote.baixa_operacional_id`, como pedido.

## A validar com você

O ROI usa `custo_acao` por campanha, que não existe hoje — vou criar o campo. Se o custo real da ação (mão de obra, transporte) não for informado campanha a campanha, o ROI virá vazio até que se preencha; me diga se prefere um custo padrão por tipo de ação como fallback.
