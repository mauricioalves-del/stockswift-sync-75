# Corrigir os grupos das Baixas Operacionais

## Diagnóstico confirmado
- Existem **115 códigos de produto sem correspondência exata no cadastro de grupos**, associados a **220 baixas** no histórico completo.
- A planilha **Cadastro-Produto.xlsx** permite identificar o grupo dos **115 códigos**, sem conflitos nesses produtos: 2 por código exato e 113 por equivalência de códigos numéricos com zeros à esquerda.
- Para esses 113 códigos, o cadastro atual também contém um único grupo correspondente quando desconsiderados os zeros à esquerda.
- O cadastro tem **1.446 produtos**, mas o dashboard consulta os grupos sem paginação. Portanto, além das lacunas no cadastro, é necessário garantir o carregamento completo para não exibir produtos cadastrados como “Sem grupo”.

## Correção proposta
1. **Completar os grupos dos 115 códigos usados nas baixas**, com base na planilha, preservando a grafia exata do código registrado em cada baixa para que a associação funcione em todo o histórico.
2. Preservar todos os grupos já cadastrados e não alterar códigos, quantidades, valores, datas, aprovações ou outros dados das baixas.
3. Corrigir a consulta de grupos do dashboard para carregar o cadastro completo, com tratamento de erro, sem apresentar falha de consulta como ausência de grupo.
4. Manter o visual, os filtros e a regra de considerar somente baixas aprovadas no dashboard. O resumo, o gráfico por grupo e a exportação devem refletir a mesma classificação corrigida.

## Segurança da associação
- Limpar o marcador textual `&apos;` e apóstrofos de formatação da planilha, mantendo os códigos como texto.
- Priorizar correspondência exata; considerar equivalência sem zeros à esquerda somente para códigos numéricos com grupo único e confirmado.
- Não importar indiscriminadamente toda a planilha: ela contém 277 linhas sem grupo e 5 códigos com grupos conflitantes, fora dos 115 códigos a corrigir.
- Não inferir grupos por descrição nem sobrescrever classificações existentes.

## Validação
- Reconsultar os dados antes da execução para evitar sobrescrever alterações recentes.
- Após a correção, confirmar que os 115 códigos identificados possuem grupo e que suas 220 baixas encontram esse cadastro.
- Conferir se surgiram outras lacunas no histórico; informar qualquer código sem referência segura, sem inventar classificações.
- Verificar no dashboard o período mostrado nas imagens: a redistribuição por grupo deve preservar o total financeiro e eliminar “Sem grupo” nos produtos corrigidos.
- Conferir a exportação HTML e confirmar que todos os grupos foram carregados, inclusive os que ultrapassam a primeira página de resultados.

## Detalhes técnicos
- Preenchimento pontual de `grupo_produtos` pela ferramenta de atualização de dados, sem alteração de estrutura e sem modificar `baixa_operacional`.
- Inserções protegidas contra duplicidade por `codigo_produto`, com conferência dos grupos de destino.
- Em `src/routes/_authenticated/baixas.dashboard.tsx`, usar o utilitário existente `fetchAll` na consulta de grupos, com ordenação estável e propagação de erros.
- Nenhuma alteração de permissões, regras financeiras ou desenho dos gráficos.