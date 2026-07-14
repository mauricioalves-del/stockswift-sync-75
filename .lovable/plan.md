## Faixas de tolerância unificadas em Missões + Recontagem automática

### Situação atual
- `src/lib/inventory.ts` → `acuracidadeColor` usa faixa `97–100` fixa; acima = amarelo, abaixo = vermelho.
- Trigger `public.compute_inventario_metrics` (na tabela `inventario`) também usa `97–100` fixo para decidir `OK / DIVERGENCIA_POSITIVA / RECONTAGEM_NECESSARIA`.
- Trigger `handle_recontagem_on_inventario` já gera `recontagem` quando `acuracidade < 97` — fluxo do módulo Contagem.
- Missões (`missoes_itens`) hoje classificam só como `CONTADO` (bateu exato) ou `DIVERGENTE` (qualquer diferença) e **não** alimentam `recontagem`.
- Limites não estão parametrizados em `parametros_inventario` — são hardcoded.

### O que muda

**1. Extrair faixa para utilitário compartilhado**
Novo em `src/lib/inventory.ts`:
- Constantes `TOLERANCIA_MIN = 95`, `TOLERANCIA_MAX = 105` (fonte única para front).
- Função `classificarFaixa(contada, sistemico) → { classe: "OK" | "DIVERGENCIA_NEGATIVA" | "DIVERGENCIA_POSITIVA", percentual }` cobrindo o caso de sistêmico = 0 (contada 0 → OK; contada > 0 → positiva).
- Ajustar `acuracidadeColor` para usar 95–105 (verde) / >105 (amarelo) / <95 (vermelho), mantendo assinatura.

**2. Espelhar faixa no banco (para Contagem continuar coerente)**
Migração ajustando `public.compute_inventario_metrics`:
- Faixa `OK` passa de 97–100 para 95–105.
- `< 95` continua indo para `RECONTAGEM_NECESSARIA` (1ª contagem) / `AGUARDANDO_APROVACAO` (≥ 2ª).
- `> 105` passa a também exigir recontagem (hoje vira `DIVERGENCIA_POSITIVA` e não gera recontagem) — para manter regra "toda divergência fora da faixa vai para recontagem" também no módulo Contagem.
- Ajustar `handle_recontagem_on_inventario` para disparar quando `acuracidade < 95 OR acuracidade > 105` em vez de `< 97`.
- Atualizar copy `< 97%` em `src/routes/_authenticated/recontagem.tsx` para "fora da faixa 95–105%".

**3. Nova classificação em `missoes_itens`**
- Adicionar valores ao domínio de `status_item`: `OK`, `DIVERGENCIA_NEGATIVA`, `DIVERGENCIA_POSITIVA` (mantendo `PENDENTE`; `CONTADO`/`DIVERGENTE` viram legado e permanecem aceitos para não quebrar dados existentes).
- Em `src/routes/_authenticated/missoes.$id.tsx` (`LinhaItem.salvar`):
  - Trocar lógica igual/diferente por `classificarFaixa()` → gravar `status_item` com a nova classe.
  - Progresso (`concluidos`) e query de "restantes → CONCLUIDA" passam a considerar `OK/DIVERGENCIA_NEGATIVA/DIVERGENCIA_POSITIVA` (mais os antigos `CONTADO/DIVERGENTE`).
  - Badge com cor por classe (verde/amarelo/vermelho) usando `acuracidadeColor` para consistência com Contagem.

**4. Geração automática de Recontagem a partir da missão**
Ainda em `salvar()`, após atualizar `missoes_itens`:
- Se classe ≠ `OK`, além do upsert já feito em `inventario` (que hoje só grava se `RECONTAGEM_NECESSARIA` for atingida via trigger), inserir também em `public.recontagem` com:
  `missao_id`, `item_missao_id` (= `item.id`), `codigo_produto`/`sku`, `lote`, `descricao`, `id_local`, `saldo_sistema` = previsto, `contagem` = contada, `acuracidade` = percentual, `status = 'PENDENTE_RECONTAGEM'`, `usuario`, `almoxarifado_id` = `missao.origem`.
- Verificar colunas de `recontagem`: se `missao_id`/`item_missao_id`/`almoxarifado_id` não existirem, adicionar via migração (nullable, sem quebrar dados atuais). Confirmarei via `read_query` antes de escrever a migração final.
- Evitar duplicata: `ON CONFLICT` em `(item_missao_id)` — criar índice único parcial quando `item_missao_id IS NOT NULL`. Se o item já tem recontagem pendente e o operador corrige, atualiza a linha existente.
- Se classe voltar a `OK` numa correção, marcar a `recontagem` correspondente como `APROVADO` automaticamente (ou remover, decisão: **manter e marcar APROVADO** para preservar histórico/auditoria).

**5. Testes manuais (roteiro)**
Numa missão de teste com 3 itens:
- Sistêmico 100, contada 100 → status `OK`, sem registro em Recontagem.
- Sistêmico 100, contada 80 → `DIVERGENCIA_NEGATIVA` (80%), aparece em Recontagem.
- Sistêmico 100, contada 120 → `DIVERGENCIA_POSITIVA` (120%), aparece em Recontagem.
- Caso sistêmico 0 / contada 5 → `DIVERGENCIA_POSITIVA`, aparece em Recontagem.

### Fora do escopo
- Tornar 95/105 parametrizáveis via UI (`parametros_inventario`) — hoje ninguém edita esses limites. Fica como evolução separada; por ora ambos os módulos leem das constantes em `src/lib/inventory.ts` + do trigger (fonte única no código, valores idênticos nos dois lados).
- Reprocessar itens antigos de missões já contadas para reclassificar retroativamente.
- Mudar a tela de Recontagem além do texto do subtítulo.
