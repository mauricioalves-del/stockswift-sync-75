# Correção Ficha Técnica (global) + Conceito de "Produto Local"

Duas frentes independentes, entregues em ordem para minimizar retrabalho. A 1 resolve a causa raiz de gaps de Ficha Técnica; a 2 introduz o conceito de Produto Local e ajusta Cobertura e Ruptura para tratá-lo.

## 1. Ficha Técnica — auditoria global

### 1.1 Reimportação e normalização consistente
- Revisar o importador de `ficha_tecnica_bom` (`src/routes/_authenticated/producao.dispersao.tsx` e `src/lib/dispersao.ts` — ou o script atual usado) para aplicar `trim()` + preservação de zeros à esquerda em **todas** as colunas de código (`id_produto`, `id_item`), não só em pontos já corrigidos.
- Ao final da importação, exibir banner com: linhas lidas do arquivo × linhas gravadas × linhas ignoradas (com motivo). Se divergir, listar os SKUs descartados.
- Instrução ao usuário: reimportar o arquivo mestre completo antes de rodar a Auditoria (passo 1.2) para garantir base atualizada.

### 1.2 Nova tela: Auditoria de Ficha Técnica
- Rota: `src/routes/_authenticated/producao.auditoria-ft.tsx` (grupo Produção no `AppShell`).
- Fonte "Produtos Acabados": `grupo_produtos`/`familias` filtrado por Grupo = "Produto Acabado" (mesma regra do PCP).
- Fonte "COM Ficha": `DISTINCT id_produto` de `ficha_tecnica_bom`, com paginação por `range` (mesma varredura usada em PCP para contornar o teto de 1000 linhas).
- UI: 3 cards de KPI (Total PA, COM FT, SEM FT) + tabela nominal dos SEM FT (SKU, descrição, família), exportável para Excel e com busca.
- Comparação sempre com `trim()` dos dois lados.

## 2. Produto Local

### 2.1 Modelo de dados
- Migração: adicionar coluna `eh_produto_local BOOLEAN NOT NULL DEFAULT false` em `grupo_produtos` (tabela do Cadastro que já guarda os SKUs).
- Sem tabela paralela — o flag mora no Cadastro. Semear os dois SKUs confirmados: `05304029` e `05304043`.
- Atualizar tela de Cadastro (Grupos/Produtos) para expor um switch "É Produto Local?" com permissão restrita a ADMIN/GERENTE.

### 2.2 Cobertura de Abastecimento
- No cálculo/UI de Cobertura (rota de planejamento/abastecimento existente), pular a classificação "Sem Estoque" quando `eh_produto_local = true`.
- Renderizar badge dedicado: "Produto Local — ver insumos" com `Link` para `producao.pcp` já com o SKU pré-selecionado (via search param `?produto=<sku>`).
- Ajustar a rota de PCP para aceitar `?produto=` e disparar automaticamente a análise.

### 2.3 Análise de Ruptura com dupla fonte de estoque
- Em `producao.pcp.tsx`: quando o produto raiz for Produto Local, além de `Alm_SP_Fabrica`, buscar também o Almox da Loja do usuário (via `useMeusAlmoxarifados`) — se o usuário tiver múltiplos, selector com padrão no primeiro.
- Regra de origem por insumo: se o insumo é um **semiacabado** (tem entrada como `id_produto` na BOM e/ou marcado com `gera_oc`), consulta saldo em `Alm_SP_Fabrica`; caso contrário (folha, insumo de acabamento), consulta saldo no Almox da Loja.
- Adicionar coluna "Origem do Estoque" na tabela de necessidade (Fábrica / Loja), preenchida por essa regra.
- Reaproveitar o motor `explodirBOM` em `src/lib/pcp-bom.ts` — só troca a fonte consultada por linha.

### 2.4 Validação end-to-end
- SKU `05304043`: some da lista de "Sem Estoque" em Cobertura, aparece com badge de Produto Local.
- Ao clicar no badge, abre PCP → mostra insumo `05104132` com Origem = Fábrica e os demais (Gotas, Praliné, Leite, Calda) com Origem = Loja.

## Detalhes técnicos

- Sem novas Edge Functions — tudo em rota + queries diretas via `supabase` (RLS já cobre leitura autenticada nas tabelas envolvidas).
- Migração única: `ALTER TABLE public.grupo_produtos ADD COLUMN eh_produto_local BOOLEAN NOT NULL DEFAULT false;` + `UPDATE` para os 2 SKUs semente. Sem novas RLS/GRANT (tabela existente).
- Auditoria de FT e PCP fazem varredura paginada de `ficha_tecnica_bom` (padrão já usado). Nada de `.in()` estourando o limite de 1000.
- Sem mexer em `src/integrations/supabase/*` autogen.

## Ordem de execução (para aprovação)

1. Migração `eh_produto_local` + semente.
2. Tela Auditoria de FT + link no menu Produção.
3. Reforço de normalização no importador de FT (com banner de contagem).
4. Cadastro: switch "É Produto Local?".
5. Cobertura: pular Sem Estoque + badge/link.
6. PCP: aceitar `?produto=`, adicionar dupla fonte de estoque + coluna Origem.
7. Validação manual com `05304043`.

Confirme para eu seguir — ou aponte o que quer ajustar antes.
