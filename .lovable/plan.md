
# Pilar Produção — Módulo Dispersão de Lote

Vou entregar em ondas para não estourar créditos. Cada onda é validável isoladamente. Antes de começar, uma decisão que precisa do seu OK:

## Decisão de escopo (antes de codar)

**Sincronização automática vs upload manual (item 1.3):** Hoje o único fluxo automático que existe no projeto é o do Lote_Sistema (estoque). A Ficha Técnica e a Ficha Técnica Consumo não têm integração pronta com o ERP de origem. Montar sincronização automática nova é um projeto de integração à parte (credenciais, agendamento, mapeamento). Proposta: **começar com upload manual mensal** (mesmo padrão de ABC/Baixas) e deixar as tabelas prontas para depois plugar um sync automático sem migração. Confirmar antes de prosseguir.

## Onda 1 — Base de dados + importação (mínimo viável)

Migração:
- `ficha_tecnica_bom` (recursiva, com `linha_origem`, `custo`, `tem_filho`, `gera_oc`) — também servirá ao PCP depois.
- `producao_consumo` (uma linha por material/OP, com `ano_mes`, `qtd_consumo`, `qtd_previsto`, `qtd_dif` gerado).
- `dispersao_causa_raiz` e `dispersao_acoes_corretivas`.
- `parametros_dispersao` (faixas Normal/Atenção/Crítico editáveis — default 5% / 15%).
- Inserir módulo `PRODUCAO_DISPERSAO` em `modulos_sistema`.
- GRANTs + RLS: leitura autenticado; escrita Admin/Coordenador; ações corretivas Admin/Coordenador/Gerente conforme matriz.

Tela `/producao/dispersao/importar`:
- Reaproveitar o padrão do `ImportarBaixasDialog` (upload xlsx, prévia OK/ERRO, gravar em lote).
- Dois botões: "Importar Ficha Técnica (BOM)" e "Importar Consumo por OP".
- Botão "Baixar Modelo" para cada.

## Onda 2 — Cálculos + Visão Geral (Dashboard)

Utilitário `src/lib/dispersao.ts`:
- `percentualDispersao(dif, previsto)` com tratamento de "Consumo Não Previsto" e zero real.
- `custoDesvio(dif, custoUnit)` retornando `{ perda, sobra }` separados.
- `classificar(pct, faixas)` → Normal | Atenção | Crítico.

Tela `/producao/dispersao` (Visão Geral):
- KPIs: OPs analisadas, % dispersão média, custo perda, custo sobra, materiais críticos, OPs críticas, ações abertas, ações concluídas no período.
- Dois Top 10 lado a lado: por **|%|** e por **R$** (nunca somados).
- Gráficos: dispersão % por mês, por linha/origem, ações por status (recharts).

## Onda 3 — Lista Detalhada + Drill-down

Tela `/producao/dispersao/lista`:
- Filtros: AnoMes, Produto, Material, Linha/Origem, Classificação.
- Colunas conforme spec, com badge colorido.
- Ao clicar num material (na Visão Geral ou na lista) → drill-down `/producao/dispersao/material/$id` com todas as OPs daquele material ordenadas por |dispersão|.

## Onda 4 — Causa Raiz + Ações Corretivas (fecha o ciclo)

- No drill-down e na lista, botão "Classificar causa" (Admin/Coord/Gerente) → dialog com dropdown de causas fixas + observação.
- Botão "Abrir ação corretiva" → dialog com descrição, responsável, status inicial "Identificada".
- Nova tela `/producao/dispersao/acoes`: lista filtrável por status/causa/responsável; concluir só Admin/Coord.

## Onda 5 — Configurações + Permissões

- `/config/dispersao`: edição das faixas (Admin).
- Registrar o módulo na matriz de perfis existente.
- Entrada no menu principal: novo grupo **Produção** com subitem **Dispersão de Lote**, seguindo o padrão colapsável do `AppShell`.

## Onda 6 — Análises avançadas (só depois das anteriores validadas)

- **Ficha Técnica × Previsto Operacional**: aba própria comparando razão oficial (`ficha_tecnica_bom.qtd`) vs razão implícita nas OPs. Requer coluna adicional em `producao_consumo` para quantidade produzida da OP — se essa info não existir na planilha, sinalizo e deixamos essa aba desabilitada até você trazer o campo.
- **Cascata de Semiacabados**: flag "Insumo é Produto/Semiacabado" (join entre `producao_consumo.material` e `producao_consumo.produto`) + view "Cascata" mostrando propagação.

## Validação final

Depois da Onda 3 pedir que você faça o upload de abr–jun/2026 e conferimos juntos se o item com desvio −2.658 aparece como Crítico e disponível para virar ação corretiva.

## Perguntas antes de começar

1. Confirmar **upload manual mensal** em vez de sync automático agora? (posso pedir os dois arquivos-modelo depois)
2. **Menu**: criar novo grupo raiz "Produção" no `AppShell` ao lado de Suprimentos/Gestão, correto?
3. **Quantidade produzida da OP** para validação 2.5: sua planilha `Ficha Técnica Consumo` tem esse campo? Se não, deixo a aba 2.5 pendente até você fornecer.

Se estiver OK, começo pela **Onda 1** (migração + importação).
