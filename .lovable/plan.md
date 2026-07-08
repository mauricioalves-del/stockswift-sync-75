## Objetivo

Permitir que Administrador/Coordenador defina, por usuário, **quais almoxarifados** ele pode enxergar. A restrição vale para todas as telas operacionais.

## O que muda

### 1. Banco (nova tabela)

`usuario_almoxarifados` (chave composta `user_id + codigo_origem`) — lista os almoxarifados liberados de cada usuário. Sem linha nenhuma = "todos liberados" (comportamento atual, evita quebrar quem já existe). Uma linha ou mais = restrito a esses.

- RLS: usuário lê as próprias linhas; Admin/Coordenador leem e gerenciam todas.
- GRANT para `authenticated` e `service_role`.
- Função `security definer` `almoxarifados_permitidos(_uid)` retorna o array de códigos (ou `NULL` quando irrestrito) — usada pelo hook client e reaproveitável em policies futuras.

### 2. UI — Usuários & Perfis (`/usuarios`)

Adicionar coluna **"Almoxarifados"** ao lado de Perfil, com um `MultiSelect` (Popover + Checkbox + Badge, já temos os primitives) listando todas as `origens` ativas.

- Vazio = "Todos" (badge cinza).
- Ao alterar, salva com `delete + insert` transacional na `usuario_almoxarifados` e loga em `audit_logs`.
- Invalida queries `["usuarios"]` e `["meus-almox"]`.

### 3. Hook central `useMeusAlmoxarifados`

Retorna `{ almoxes: string[] | null, loading }` — `null` quando irrestrito, senão o array. Cache com `staleTime: 60s`.

### 4. Filtro nas telas operacionais

Aplicar `.in("origem", almoxes)` quando `almoxes !== null`:

- `contar.tsx` — filtro em `origens` (dropdown), `estoque_sistemico` (SKUs e lotes) e default de `useAlmoxAtivo` respeitando a lista.
- `missoes.index.tsx` — filtro no dropdown de origem e na listagem de missões (`.in("origem", ...)`).
- `suprimentos.estoque.tsx` — filtro em `estoque_sistemico` e no seletor de origem.
- `config.inventario.tsx` — o Select de "almoxarifado padrão por usuário" passa a listar só os permitidos daquele usuário (Admin continua vendo todos).
- `useAlmoxAtivo` — se o "padrão do usuário" ou "origem da missão" não estiver na lista permitida, ignora e cai no próximo nível.

### 5. AppShell / permissões

Sem impacto na matriz de permissões atual — este é um filtro de dados independente da matriz de módulos.

## Fora do escopo

- Filtrar `requisicoes` / `baixas` por almoxarifado (não têm coluna `origem` clara — pode entrar depois se necessário).
- Enforcement no banco via RLS por almoxarifado (fica como camada UI + query; podemos endurecer depois com policies usando `almoxarifados_permitidos()`).

## Detalhes técnicos

```sql
CREATE TABLE public.usuario_almoxarifados (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo_origem text NOT NULL REFERENCES public.origens(codigo_origem) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, codigo_origem)
);
```

Policies: `select` para o próprio user OR admin/coord; `all` para admin/coord.

Migração roda antes das mudanças de código (types são regenerados depois).
