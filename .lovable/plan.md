# Dashboard de Baixas — alimentar apenas com baixas APROVADAS

## Diagnóstico (confirmado no código)
O dashboard **não** filtra por status: as duas consultas em `baixas.dashboard.tsx` (`baixasQ`, linha ~102, e `momQ`, linha ~143) leem **toda** a tabela `baixa_operacional` só por data. Ou seja, baixas **REPROVADAS** (e também PENDENTES/AGUARDANDO_ADMIN) estão inflando todos os indicadores — resumo executivo, ranking de SKU, gráficos por motivo/setor/grupo e tendência MoM.

## Correção
1. **`baixasQ`** (alimenta todo o dashboard): incluir `status_fluxo` no select e filtrar `.eq("status_fluxo", "APROVADA")` — apenas baixas aprovadas contam.
2. **`momQ`** (gráfico MoM): mesmo filtro, para a tendência não misturar reprovadas/pendentes.
3. Manter intactos os filtros visuais de período/almoxarifado/motivo e o diálogo de detalhe por motivo (`DetalheMotivoBaixasDialog`) — verificar se ele herda o mesmo conjunto já filtrado; se tiver consulta própria, aplicar o mesmo filtro.

## Arquivo alterado
- `src/routes/_authenticated/baixas.dashboard.tsx`

## Validação
- Conferir no preview que os totais caem para refletir só o aprovado (ex.: baixas reprovadas deixam de aparecer no ranking e no resumo).
- Sem custo adicional — correção de lógica já paga.
