## Objetivo

Carregar as 46 linhas da planilha `Acoes.xlsx` na tabela de **Ações de Lote** do módulo Shelf Life, como ações já executadas (status **Concluída**), para que apareçam na tela "Ações de Lote" e alimentem o Dashboard Executivo.

## Mapeamento dos campos

| Planilha | Ação de Lote |
|---|---|
| Id_produto | SKU |
| descricao | Produto |
| Lote | Lote |
| Origem (Alm_SP_...) | Almoxarifado |
| Dt_Validade | Data de validade |
| Qtd | Quantidade endereçada |
| Data em que agimos | Data da ação |
| Observações | Tipo de ação (ver abaixo) + texto original guardado em Observação |
| — | Status = Concluída; Custo da ação = 0 |

## Tipos de ação (a partir de "Observações")

- "Aplicar desconto para colaborador" (29) → **Desconto Colaborador** (Receita)
- "Aplicar desconto para colaborador/Refood" (1) → **Anúncio Refood** (Receita)
- "Degustação - Ativação" (8) e "Consumo Time" (2) → **Degustação** (Saving)
- "Transformar em Massa", "Transformar em biscoito da loja", "Avaliar Transformação - Dafne" (3) → **Transformação de Produto** (Saving)
- "Remodelado - Enviar para Amostra P/Laboratório" (2) e "Descarte" (1) → **Outro** (Saving)

Nenhum tipo novo será criado; todos já existem no cadastro.

## Valores

- Ações de categoria **Receita**: valor recuperado = Qtd × C/Desconto
- Ações de categoria **Saving**: valor de saving = Qtd × Custo_Vlr (custo unitário do lote)
- A coluna "Custo Total" da planilha é ignorada por estar inconsistente (vários registros repetindo 82,50)

## Execução

1. Ler a planilha e gerar os 46 registros com o mapeamento acima.
2. Inserir na tabela de ações de lote em uma única operação de dados.
3. Conferir os totais no banco (quantidade de registros, soma de receita e de saving) e validar que aparecem corretamente na tela **Shelf Life → Ações de Lote** e no Dashboard.

## Observações técnicas

- Inserção via ferramenta de dados na tabela `campanhas_lote`, com `status='CONCLUIDA'`, `criado_por` nulo (importação) e `observacao` contendo o texto original da planilha para rastreabilidade.
- Datas convertidas para formato ISO; SKU normalizado como texto.
- Não há alteração de schema nem de código da aplicação.
