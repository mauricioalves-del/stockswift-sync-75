# Plano — Descrição do produto na lista de Dispersão de Lote

## Problema
Na lista detalhada de Dispersão de Lote, a coluna **Produto** mostra apenas o código (ex.: `0050321021`) quando a view de impacto não traz a descrição (`desc_prod` vazio). O material já aparece como `código — descrição`; o produto precisa do mesmo tratamento.

## O que será feito

### 1. Resolver descrições faltantes via Ficha Técnica (BOM), em cascata
No `producao.dispersao.tsx`, replicar a lógica já aprovada da tela de Material (`producao.material.$material.tsx`):
- Coletar os códigos de produto da lista que estão sem `desc_prod`.
- Buscar na `ficha_tecnica_bom` com paginação (`fetchAll`, sem limite de 1.000 linhas), em 3 consultas paralelas:
  1. `id_produto` → `produto`
  2. `id_subconjunto` → `subconjunto`
  3. `id_item` → `item`
- Montar um mapa código → descrição nessa ordem de prioridade.

### 2. Exibir `código — descrição` na coluna Produto
- Prioridade da descrição: `desc_prod` da view → descrição resolvida via BOM.
- Formato final idêntico ao da coluna Material: `0050321021 — PP Lingua de Onça ...`, mantendo o link para a página do material e o truncamento atual.

### 3. Propagar a descrição resolvida
- O campo de busca "Produto" e o drill-down (`DetalhePeriodoDispersaoDialog`) passam a usar a descrição resolvida, garantindo consistência entre filtro, lista e detalhe.

## Detalhes técnicos
- Arquivo principal: `src/routes/_authenticated/producao.dispersao.tsx` (nova query `useQuery(["dispersao","desc-produtos"], ...)` alimentando `linhas`).
- Reaproveita `fetchAll` (`src/lib/fetch-all.ts`). Nenhuma migration, nenhuma mudança de banco.
- Sem alteração na lógica de "fora da estrutura", filtros, classificação ou exportação — apenas enriquecimento de exibição da descrição.
