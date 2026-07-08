## Duas causas distintas

### 1) Erro `new row violates row-level security policy for table "permissoes"`

As policies de `permissoes`, `perfis` e `modulos_sistema` só permitem escrita para `COORDENADOR_CONTROLE`. A tela `config.perfis.tsx` libera a UI para `ADMINISTRADOR` também, mas o banco rejeita o `upsert`. Como você está logado como Administrador editando o perfil Gerente, o INSERT bate na policy e falha.

### 2) Menu do Gerente mostra tudo, mesmo com só 13 módulos marcados

No `usePermissions.canView`, quando o módulo existe em `modulos_sistema` mas o perfil não tem linha em `permissoes` para ele, a função devolve `true` (fallback pensado para módulos "não mapeados"). No `AppShell`, o gate `if (perms.isMapped(item.to)) return perms.canView(item.to)` entra no ramo mapeado — e ainda assim recebe `true`. Resultado: qualquer módulo sem linha explícita aparece.

Confirmado no banco: Gerente tem 14 linhas em `permissoes` (13 com visualizar), contra 32 módulos totais → os 18 sem linha vazam para o menu.

---

## Correções

### A. Migração de RLS (`permissoes`, `perfis`, `modulos_sistema`)

Substituir as policies `coord_manage_*` por versões que também aceitem Administrador:

```sql
DROP POLICY coord_manage_permissoes ON public.permissoes;
CREATE POLICY admin_coord_manage_permissoes ON public.permissoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'));
```

Mesmo padrão para `coord_manage_perfis` e `coord_manage_modulos`. Mantém os `read_*` como estão. GRANTs já existem (tabelas em uso hoje).

### B. Ajustar `src/hooks/usePermissions.ts`

Quando o módulo está mapeado no sistema mas não tem linha para o perfil, tratar como **negado** — não como permissivo:

- `canView(rota)`: se `isAdmin` → true; se `isMapped(rota)` → retorna `p?.pode_visualizar === true` (sem linha = false); se não mapeado → true (fallback só pega módulos que ainda não existem em `modulos_sistema`).
- `canWrite(rota)`: mesma lógica com `pode_criar || pode_editar`.

`AppShell.tsx` não precisa mudar — a semântica de "mapeado + sem linha = negado" já se encaixa no gate atual.

### C. Invalidação de cache após salvar

Após o `upsert` bem-sucedido em `config.perfis.tsx`, `["my-permissions"]` já é invalidado. Nada a mudar aqui.

---

## Validação

1. Como Administrador, abrir Matriz de Permissões → Gerente, alterar uma visualização, Salvar → sem erro de RLS.
2. Logar como usuário Gerente → menu mostra somente os 13 módulos com `pode_visualizar = true`.
3. Marcar mais uma visualização para Gerente e salvar → o item aparece no menu do Gerente sem F5.
4. Coordenador de Controle continua conseguindo editar (não regride).
5. Administrador continua vendo tudo (bypass em `usePermissions`).

## Fora do escopo

- Não mexer em GRANTs (já corretos), rotas, `routeTree.gen.ts`, nem nas checagens de papel dentro das telas de negócio.
