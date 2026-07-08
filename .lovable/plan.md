## Problema

O perfil **Coordenador de Controle** aparece com "Acesso Total" e todas as permissões marcadas na matriz, mas o menu lateral continua mostrando poucos módulos. Motivo: hoje `AppShell.tsx` filtra o menu por **papel hardcoded** (`isAdmin`, `canWrite`, `isCoord`), ignorando totalmente a tabela `permissoes` que a Matriz de Permissões grava. Como `COORDENADOR_CONTROLE` não é `ADMINISTRADOR` nem `INVENTARIANTE`, `canWrite = false` — e todos os itens marcados como `role: "write"` somem, mesmo tendo `pode_visualizar = true` na matriz.

A base já está pronta: `modulos_sistema` tem `rota` para cada módulo (ex.: `/contar`, `/suprimentos/estoque`), `permissoes` já tem 90 linhas gravadas, e a matriz salva por perfil.

## Solução

Fazer o menu **consumir a matriz**. Uma única fonte de verdade: se `pode_visualizar = true` para o módulo cuja `rota` bate com o item de menu, o item aparece. Caso contrário, some.

### Passos

1. **Novo hook `usePermissions()`** (`src/hooks/usePermissions.ts`)
   - Descobre o `perfil_id` do usuário logado: `user_roles.role` → `perfis.role_key` → `perfis.id`.
   - Carrega `modulos_sistema` (para mapear `rota → modulo_id`) e todas as `permissoes` daquele perfil.
   - Retorna:
     - `canView(rota: string): boolean`
     - `canWrite(rota: string): boolean` (pode_criar OR pode_editar)
     - `isAdmin` (bypass — Administrador sempre vê tudo, blindagem contra "trancar-se para fora")
     - `loading`
   - Cache com React Query (staleTime 60s), invalidado quando a matriz é salva.

2. **AppShell passa a filtrar por `canView(item.to)`**
   - Substituir o `can()` atual pelo hook. `role: "any" | "write" | "admin"` de cada item vira apenas dica de fallback (usada se o módulo ainda não estiver mapeado na matriz).
   - Grupo (`Cadastro`, `Inventário`, etc.) aparece se **qualquer** filho for visível.
   - Administrador continua vendo tudo (bypass), independentemente da matriz — evita cenário de admin salvar uma matriz vazia e perder acesso.

3. **Invalidação ao salvar a matriz**
   - Em `config.perfis.tsx`, ao concluir o `upsert`, invalidar também `["my-permissions"]` para o menu recalcular sem F5.

### Fora do escopo desta rodada

- Não vou mexer nas RLS/policies das telas em si (a matriz ainda é usada só para exibir/esconder no menu; cada tela continua com sua checagem de papel atual). O prompt anterior da matriz já previu isso como próxima etapa.
- Não vou criar/alterar tabelas — a estrutura (`perfis`, `modulos_sistema`, `permissoes`) já existe e está populada.
- Não vou tocar em rotas nem em `routeTree.gen.ts`.

## Validação

1. Logar como **Coordenador de Controle** (perfil com tudo marcado): menu deve mostrar todos os grupos e itens — Cadastro, Inventário, Suprimentos, Gestão, Relatórios, Configurações.
2. Na Matriz, desmarcar `Visualizar` de "Baixas Operacionais" para Coordenador, salvar. Sem recarregar, o item some do menu.
3. Remarcar → o item volta.
4. Logar como **Vendedor** (perfil com pouca coisa marcada): menu deve conter só o que a matriz autoriza.
5. Administrador continua vendo tudo mesmo se a matriz dele estiver vazia (bypass de segurança).
