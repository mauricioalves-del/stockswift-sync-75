# Controle FEFO — histórico zerado, motor por evento e visual padrão

## O que muda

1. **Começar do zero, a partir de hoje**
   - Limpar as movimentações e checagens existentes (27/08 a 31/08).
   - O motor passa a considerar somente datas de hoje (01/09/2026) em diante; qualquer linha importada com data anterior é ignorada na análise.

2. **Análise automática ao atualizar a tabela (sem horário fixo)**
   - Remover o agendamento diário das 08:00.
   - Toda vez que a tabela de movimentações receber dados (importação de planilha ou carga via integração), o motor de FEFO roda automaticamente para os dias afetados, sem clique e sem esperar horário.
   - O botão "Reprocessar agora" continua disponível como reforço manual.

3. **Visual no padrão do sistema, com quebras em vermelho**
   - Reescrever o painel no mesmo padrão executivo das demais telas (cabeçalho com título/ações, KPIs com borda colorida à esquerda, cartões de gráfico, tabelas com cabeçalho fixo e ordenação).
   - Quebra de FEFO destacada em vermelho: KPI de quebras, linha da tabela com fundo/borda vermelha, selo de status vermelho e barras de quebra em vermelho nos gráficos.
   - Status "OK" em verde e "inconclusivo" em âmbar, usando os tokens de cor do tema (funciona nos 3 temas do sistema).
   - Tela de importação e tela de configurações recebem o mesmo enquadramento e tipografia das outras telas.

## Detalhes técnicos

- Migração: `DELETE` das linhas de `movimentacoes_diarias` e `checagens_fefo`; `processar_fefo` passa a ignorar datas anteriores a `current_date` (fuso America/Sao_Paulo) na seleção do dia a processar.
- Nova função gatilho `trigger_fefo_apos_movimentacao()` + trigger `AFTER INSERT/UPDATE ... FOR EACH STATEMENT` em `movimentacoes_diarias`, que chama `processar_fefo` para cada data distinta recém-afetada (idempotente: reapaga e regrava as checagens do dia).
- Desagendar o job diário do `pg_cron`.
- Frontend: refatorar `suprimentos.fefo.index.tsx` (KPIs, gráficos Recharts com `hsl(var(--destructive))` para quebras, tabelas com ordenação e destaque de linha), e alinhar `suprimentos.fefo.movimentacoes.tsx` e `suprimentos.fefo.config.tsx` ao mesmo layout. Nenhuma mudança de regra de cálculo do FEFO.
