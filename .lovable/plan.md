## Botão excluir em Missões de Inventário

Adicionar ação de excluir missão na listagem `/missoes`.

### Onde
`src/routes/_authenticated/missoes.index.tsx` — componente `ListaMissoes`, nova coluna "Ações" (ou ícone ao lado do botão "Executar").

### Quem pode excluir
Somente Admin ou Gerente (`podeGerir`, mesma regra já usada para criar missões). Para outros papéis o botão não aparece.

### Comportamento
- Ícone lixeira (`Trash2` do lucide) em botão `variant="ghost"` na última coluna.
- Ao clicar, abre `AlertDialog` de confirmação: "Excluir missão «título»? Esta ação removerá também os itens gerados."
- Confirmação executa em ordem:
  1. `delete from missoes_itens where missao_id = m.id`
  2. `delete from missoes where id = m.id`
  3. `insert audit_logs` com ação `EXCLUIR_MISSAO`.
- Sucesso: `toast.success("Missão excluída")` + `qc.invalidateQueries({ queryKey: ["missoes"] })`.
- Erro: `toast.error(err.message)`.

### Fora do escopo
- Não mexer em RLS (policies atuais de `missoes` já permitem delete para Admin/Gerente; se der erro de RLS depois, tratamos numa migração separada).
- Não excluir missões com contagens já executadas via `inventario` — se surgir esse requisito, adiciono verificação depois.
