## Causa

Mesmo padrão já documentado em `.lovable/plan.md` (aconteceu antes com Requisições).

No TanStack Router (rotas achatadas), os arquivos:

- `src/routes/_authenticated/config.tsx` (renderiza `ConfigPage` diretamente)
- `src/routes/_authenticated/config.perfis.tsx` (filha)
- `src/routes/_authenticated/config.inventario.tsx` (filha)

fazem com que `config.tsx` vire automaticamente **rota-pai/layout** das outras duas. Rotas-pai precisam renderizar `<Outlet />` para exibir as filhas. Como `ConfigPage` mostra o conteúdo direto (sem `Outlet`), a URL `/config/perfis` casa a rota filha, mas nada muda na tela — o usuário clica em "Matriz de Permissões" e continua vendo a tela de Configurações, então percebe como "não acontece nada".

Confirmado que o link e o role estão corretos:
- Botão em `usuarios.tsx` usa `<Link to="/config/perfis">` (ok).
- Usuário Maurício (`mauricio.alves@…`) tem role `ADMINISTRADOR`, e a tela `config.perfis` já foi liberada para ADMINISTRADOR + COORDENADOR_CONTROLE na rodada anterior.

## Correção

Renomear o arquivo do "hub" de Configurações para virar rota **index** (irmã), quebrando a relação pai/filho — igual ao que foi feito em Requisições:

- `src/routes/_authenticated/config.tsx` → `src/routes/_authenticated/config.index.tsx`

E atualizar apenas a chamada de `createFileRoute` dentro dele:

```ts
createFileRoute("/_authenticated/config/")
```

Depois disso:

- `/config` continua abrindo o hub (via rota index).
- `/config/perfis` e `/config/inventario` passam a ser rotas independentes e renderizam normalmente.
- `routeTree.gen.ts` é regenerado automaticamente pelo plugin do Vite — não precisa editar.

Nenhuma outra alteração de lógica, RLS, tabela, componente ou permissão.

## Validação

1. Abrir `/config` → hub deve carregar como antes, com o card "Perfis e Permissões" visível para Admin/Coordenador.
2. Clicar em "Matriz de Permissões" (a partir de `/usuarios` ou do card em `/config`) → tela da matriz deve abrir com os dados preenchidos.
3. Clicar em "Configurar almoxarifado padrão" → `/config/inventario` deve abrir normalmente.
