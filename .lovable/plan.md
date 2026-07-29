## Objetivo

Trocar os filtros de escolha única do pilar Shelf Life por filtros de múltipla escolha, com uma configuração de "almoxarifados ativos" (quais origens alimentam as telas) que fica salva por usuário no navegador — e aplicar o mesmo modelo no Dashboard Shelf Life.

## O que muda

### 1. Componente de filtro múltiplo (novo)
`src/components/ui/multi-select.tsx`: botão com resumo ("Todos", "Alm_SP_Fabrica", "3 selecionados"), lista com busca, checkboxes, ações "Selecionar todos" / "Limpar". Lista vazia = sem restrição (todos).

### 2. Preferências salvas (novo)
`src/hooks/useFiltrosShelfLife.ts`: guarda em `localStorage` (chave por tela) os filtros escolhidos — almoxarifados, grupos, famílias, faixas, status de ação, período e o interruptor de estoque ativo. Retorna valores + setters e um botão "Restaurar padrão".

### 3. Parâmetro "Almoxarifados ativos"
Um cartão "Configuração de Filtros" no topo das duas telas, recolhível, com:
- multi-seleção de **Almoxarifados ativos** — define quais origens entram nos dados das telas do pilar (padrão: todos os permitidos ao usuário);
- interruptor **Somente lotes com saldo** (saldo > 0), hoje fixo no código;
- a seleção é compartilhada entre Mapeamento de Risco e Dashboard (mesma chave de armazenamento), respeitando sempre a restrição de almoxarifado do perfil do usuário.

### 4. Mapeamento de Risco (`shelf-life.risco.tsx`)
Almoxarifado, Grupo, Família, Faixa e Status de Ação viram múltipla escolha; a busca continua texto livre. KPIs, tabela e exportação passam a respeitar a seleção múltipla.

### 5. Dashboard Shelf Life (`shelf-life.dashboard.tsx`)
Ganha a mesma barra de filtros: Almoxarifado (múltiplo), Grupo, Família, Motivo e Tipo de Ação (múltiplos), além do período De/Até já existente — tudo persistido. As baixas passam a ser filtradas por `origem`/grupo/família, e as campanhas por `almoxarifado`, antes do cálculo de perda, recuperação e ROI.

## Detalhes técnicos

- `useLotesRisco` recebe a lista de almoxarifados ativos e o flag de saldo como parâmetros e entra na `queryKey`, mantendo `fetchAll` paginado.
- Interseção obrigatória com `useMeusAlmoxarifados`: a configuração nunca amplia o acesso do usuário.
- No dashboard, o `useQuery` de baixas passa a trazer `origem` e a cruzar grupo/família via `grupo_produtos`/`familias` (mesmo mapeamento já usado no hook de risco).
- Sem mudanças de banco; nada de nova tabela — persistência apenas em `localStorage`.
