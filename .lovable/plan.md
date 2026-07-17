
# Motor de Previsão de Demanda do Abastecimento

Escopo: substituir a lógica de CMD dentro da engine já existente do módulo Abastecimento, sem recriar telas. Entregar em ondas, cada uma validável isoladamente para não desperdiçar créditos.

## Onda 1 — Correção do viés de ruptura (item 1)

Onde: função de cálculo do CMD usada em `abastecimento.planejamento.tsx` / `abastecimento.consumo.tsx`.

Mudança:
- Numerador: total vendido no período (mantém).
- Denominador: passa a ser **dias com estoque disponível** em vez de dias corridos.
- Fonte dos "dias com estoque disponível" (nesta ordem, o que existir primeiro):
  1. Snapshot diário de saldo, se já sincronizado.
  2. Fallback: dias distintos em `historico_consumo` com venda > 0 **∪** dias em que houve entrada em `estoque_sistemico` naquele SKU/almoxarifado.
- Nunca deixar denominador = 0: se `dias_disponiveis = 0`, marcar CMD como `null` e classificar amostra como "Sem base" (não sugerir compra por demanda).

Validação: comparar CMD antigo × novo em 10 SKUs com ruptura recente antes de liberar geral.

## Onda 2 — Transparência da amostra (item 3)

Adicionar à linha da tabela de Cobertura duas colunas discretas:
- `Dias base` (ex.: "9/30").
- Badge de confiança: **Alta** ≥70%, **Média** 40–70%, **Baixa** <40%, **Sem base** quando denominador 0.

Sem mudar nenhuma fórmula — só exposição do que a Onda 1 já calculou.

## Onda 3 — Janela ponderada (item 2)

Novos parâmetros em `parametros_abastecimento` (linha global, editáveis em Configurações):
- `janela_semanas` (default 4).
- `pesos_semanais` (default `[3,2,1,1]`, tamanho = janela).

Cálculo:
```
CMD = Σ(venda_semana_i × peso_i) / Σ(dias_disponiveis_semana_i × peso_i)
```
Semana = janela de 7 dias contados de trás pra frente a partir de hoje.

Fallback: se `janela_semanas` ou pesos ausentes/ inválidos → cai no cálculo simples da Onda 1.

## Onda 4 — Seleção automática de método por ABC (item 4)

Em `parametros_abastecimento` acrescentar coluna `metodo_override` (nullable) por SKU. Regra na leitura:
- `metodo_override` presente → usar esse.
- Senão: classe A/B → `POR_DEMANDA`; classe C → `MIN_IDEAL_MAX`; sem classe → mantém default atual.

Na UI de parâmetros do SKU, mostrar o método efetivo + fonte ("automático por ABC" / "manual").

## Onda 5 — Sazonalidade (item 5)

### 5.1 Nova tabela `periodos_sazonais`
```
id, nome, data_inicio date, data_fim date,
recorrente_anual bool,
escopo_tipo text ('EMPRESA'|'GRUPO'|'FAMILIA'|'SKU'),
escopo_valor text,          -- código do grupo/família/sku, null se EMPRESA
indice_multiplicador numeric,
origem_indice text ('MANUAL'|'AUTOMATICO'),
ativo bool default true,
criado_por, created_at, updated_at
```
Migração inclui GRANTs, RLS (leitura autenticado, escrita GERENTE/ADMIN), e `ALTER TABLE parametros_abastecimento ADD COLUMN metodo_override text`.

### 5.2 Tela nova `/config/sazonalidade`
CRUD simples reaproveitando o layout de `motivos-baixa.tsx`. Campos: nome, datas, recorrente, escopo (dropdown tipo + input valor), índice, ativo. Botão "Calcular do histórico" (só habilita quando há ≥ 1 ano de `historico_consumo` para o escopo) que preenche o índice usando:
```
indice = venda_media_diaria_dentro_do_periodo_ano_anterior /
         venda_media_diaria_fora_do_periodo_mesmo_ano
```
Após a data_fim passar, exibir linha comparativa "previsto × realizado" na própria row.

### 5.3 Aplicação no cálculo
Nova função `cmdAjustadoParaJanela(cmdBase, sku, grupo, familia, janelaDias)`:
- Para cada dia da janela de cobertura alvo, verifica períodos ativos que casam com escopo do SKU (recorrente_anual expande a data no ano corrente).
- Se casa → `cmd_dia = cmdBase × indice`. Senão → `cmdBase`.
- Retorna `{ necessidade, motivo }` onde `motivo` traz "+X% por sazonalidade: <nome> em Y dias" quando aplicável.

Sugestão final = `necessidade + demanda_extra_aprovada − saldo_atual − em_pedido` (mantém a lógica atual, só troca o `cmd × dias`).

### 5.4 Reflexo em Min/Ideal/Máx
Durante um período sazonal ativo cujo escopo casa com o SKU, aplicar `ideal_efetivo = ideal × indice`, `max_efetivo = max × indice`. Ao expirar, volta ao valor cadastrado (nada é gravado — cálculo em runtime).

## Onda 6 — Sincronização do ciclo (item 6)
Reaproveita o mesmo trigger de recálculo já existente na tela de Abastecimento; só troca a função chamada. Sem cron novo.

## Ordem sugerida de entrega
1. Onda 1 (fórmula) + Onda 2 (badges) na mesma leva — impacto direto, baixo custo.
2. Onda 3 (janela ponderada) + parâmetros editáveis.
3. Onda 4 (auto ABC).
4. Onda 5 completa (migração + tela + aplicação no cálculo), começando pelo cadastro manual do índice; automático como botão opcional.

## Detalhes técnicos

**Arquivos previstos:**
- `src/lib/cmd.ts` — nova função `calcularCMD(sku, almox, opts)` centralizando a lógica (usada por planejamento e consumo).
- `src/lib/sazonalidade.ts` — resolução de períodos aplicáveis + índice.
- `src/routes/_authenticated/abastecimento.planejamento.tsx` — trocar chamada + novas colunas.
- `src/routes/_authenticated/abastecimento.consumo.tsx` — trocar chamada + badges.
- `src/routes/_authenticated/abastecimento.parametros.tsx` — inputs de janela/pesos e override de método.
- `src/routes/_authenticated/config.sazonalidade.tsx` — nova tela.
- `src/components/app/AppShell.tsx` — entrada de menu.
- Migração: `periodos_sazonais` + `parametros_abastecimento.metodo_override` + GRANTs + RLS.

**Pontos de atenção:**
- Consultar `historico_consumo` uma vez por leva de SKUs e reduzir em memória (evitar N+1 na tela de Abastecimento com centenas de linhas).
- Cache no queryClient com key incluindo `janela_semanas` e `pesos_semanais` para invalidar quando o parâmetro mudar.
- Períodos recorrentes: normalizar para o ano corrente na hora de comparar com a janela (ex.: Páscoa 2026).

Confirma essa ordem? Posso começar pelas **Ondas 1 + 2** já.
