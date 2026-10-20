// Saldo do almox de origem nos Pedidos de Abastecimento (leitura vinda de abast_pedido_saldos) e validação local das edições.
// O banco é a autoridade: as funções abast_editar_item_pedido / abast_excluir_item_pedido repetem estas regras.
export type Saldo = { almox_origem: string; estoque: number; reservado_outros: number; saldo_inicial: number; estoque_lido_em: string | null };
export type ItemSaldo = { id: string; id_produto: string; qtd_pedida: number; caixa: number | null; origem: string; aceito: boolean | null; saldo?: Saldo | null };

/** Status que seguram saldo no almox de origem: ainda não saiu do CD. */
export const EM_ABERTO = ["AGUARD_COMERCIAL", "AGUARD_DIRETOR", "ABERTO", "EM_SEPARACAO", "SEPARADO"];
/** Só item aceito conta (sugestão comercial pendente ou recusada fica de fora). */
export const itemValido = (i: Pick<ItemSaldo, "origem" | "aceito">) => i.aceito !== false && !(i.origem === "SUGESTAO_COMERCIAL" && i.aceito == null);

/** O saldo só faz sentido enquanto o estoque do ERP ainda não reflete a saída: pedido em aberto, ou enviado depois da última leitura do estoque. */
export function mostrarSaldo(p: { status: string; atualizado_em: string }, i: Pick<ItemSaldo, "saldo" | "origem" | "aceito">): boolean {
  if (!i.saldo || !itemValido(i)) return false;
  if (EM_ABERTO.includes(p.status)) return true;
  if (p.status === "ENVIADO") return !i.saldo.estoque_lido_em || new Date(p.atualizado_em).getTime() > new Date(i.saldo.estoque_lido_em).getTime();
  return false;
}
export const saldoFinal = (i: Pick<ItemSaldo, "saldo" | "qtd_pedida">): number | null => (i.saldo ? i.saldo.saldo_inicial - Number(i.qtd_pedida) : null);

const num = (v: unknown) => Number(v ?? 0);
/** Junta o resultado de abast_pedido_saldos aos itens e ao pedido (almox de origem). Sem saldo (função indisponível): tudo continua funcionando, sem as colunas. */
export function anexarSaldos<I extends { id: string; pedido_id: string }, P extends { id: string }>(ps: P[], its: I[], sal: any[] | null | undefined) {
  const porItem = new Map<string, Saldo>((sal ?? []).map((s) => [String(s.item_id), { almox_origem: String(s.almox_origem), estoque: num(s.estoque), reservado_outros: num(s.reservado_outros), saldo_inicial: num(s.saldo_inicial), estoque_lido_em: s.estoque_lido_em ?? null }]));
  return ps.map((p) => {
    const itens = its.filter((i) => i.pedido_id === p.id).map((i) => ({ ...i, saldo: porItem.get(i.id) ?? null }));
    return { ...p, itens, almox_origem: itens.find((i) => i.saldo)?.saldo?.almox_origem ?? null };
  });
}

/** Mesmas regras do banco, para avisar antes de enviar. Retorna a mensagem de erro ou null. */
export function validarEdicaoLocal(i: Pick<ItemSaldo, "qtd_pedida" | "caixa" | "saldo">, nova: number): string | null {
  const atual = Number(i.qtd_pedida), cx = Number(i.caixa ?? 0), s = i.saldo;
  if (!Number.isFinite(nova) || nova <= 0) return "Informe uma quantidade maior que zero (para retirar o item, use Excluir).";
  const solto = !!s && cx > 0 && s.saldo_inicial < cx && nova <= s.saldo_inicial;
  if (cx > 0 && nova % cx !== 0 && nova !== atual && !solto) return `A quantidade deve ser múltiplo da caixa (${cx} un); só há saldo solto quando o origem tem menos de uma caixa disponível.`;
  if (s && nova > atual && nova > s.saldo_inicial) return `Acima do saldo do origem: disponível ${Math.max(s.saldo_inicial, 0)} un (estoque ${s.estoque} menos ${s.reservado_outros} em outros pedidos em andamento).`;
  return null;
}
