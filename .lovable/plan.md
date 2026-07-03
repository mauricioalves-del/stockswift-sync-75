## Causa

No TanStack Router (rotas achatadas), quando existem os arquivos:

- `suprimentos.requisicoes.tsx` (lista)
- `suprimentos.requisicoes.$id.tsx` (detalhe)
- `suprimentos.requisicoes.$id.ficha.tsx` (ficha)

o primeiro vira automaticamente **rota-pai/layout** dos demais. Rotas-pai precisam renderizar `<Outlet />` para exibir os filhos. Como `RequisicoesPage` mostra a listagem direto (sem `Outlet`), a URL `/suprimentos/requisicoes/<id>` casa a rota filha, mas nada aparece na tela — exatamente o sintoma "clico em Ver e não abre".

Não tem relação com RLS/perfil: a policy de SELECT em `requisicoes` é `true` para autenticados.

## Correção

Renomear o arquivo da lista para virar uma rota **index** (irmã), quebrando a relação pai/filho:

- `src/routes/_authenticated/suprimentos.requisicoes.tsx` → `src/routes/_authenticated/suprimentos.requisicoes.index.tsx`

E atualizar apenas a chamada de `createFileRoute` dentro dele:

```ts
createFileRoute("/_authenticated/suprimentos/requisicoes/")
```

Depois disso:

- `/suprimentos/requisicoes` continua abrindo a lista (via rota index).
- `/suprimentos/requisicoes/$id` e `/suprimentos/requisicoes/$id/ficha` passam a ser rotas independentes e renderizam normalmente.
- `routeTree.gen.ts` é regenerado automaticamente pelo plugin do Vite — não precisa editar.

Nenhuma outra alteração de lógica, RLS, tabela ou componente.

## Validação

1. Abrir `/suprimentos/requisicoes` → lista deve carregar como antes.
2. Clicar em **Ver** em qualquer linha → tela de detalhe deve abrir.
3. Clicar em **Imprimir ficha** → rota `/…/$id/ficha` deve abrir em nova aba.
