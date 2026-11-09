/**
 * Sugestão de pedido de baixa por Uso e Consumo a partir de uma missão de inventário.
 * Regra: por SKU + lote, quando Sistema > Contagem, a falta vira quantidade de baixa,
 * descontando o que já está na fila de aprovação e o que esta missão já gerou.
 * Estoque em trânsito do SKU não altera a quantidade, mas exige conferência manual
 * (a linha nasce desmarcada), porque a contagem pode ter ocorrido antes da entrada da nota.
 */

export type ItemConsumo = {
  id: string;
  codigo_produto: string;
  descricao: string | null;
  lote: string | null;
  quantidade_prevista: number | null;
};

export type LinhaContadaConsumo = {
  lote: string | null;
  eh_nao_relacionado: boolean;
  quantidade_contada: number | null;
  saldo_sistemico_lote: number | null;
};

export type LoteSistConsumo = { lote: string; saldo: number; custo_unitario: number; unidade: string };

export type SugestaoConsumo = {
  chave: string;
  codigo_produto: string;
  descricao: string;
  lote: string;
  unidade: string;
  custo_unitario: number;
  sistema: number;
  contado: number;
  diferenca: number;
  baixaPendente: number;
  jaGerado: number;
  transito: number;
  quantidade: number;
  marcadoPadrao: boolean;
  aviso: string | null;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const chaveSkuLote = (sku: string, lote: string | null | undefined) => `${sku}|${String(lote ?? "")}`;

export function sugerirBaixaConsumo(params: {
  itens: ItemConsumo[];
  linhasPorItem: Map<string, LinhaContadaConsumo[]>;
  lotesPorSku: Map<string, LoteSistConsumo[]>;
  /** Baixas na fila de aprovação (PENDENTE/AGUARDANDO_ADMIN) do almox, por SKU|lote. */
  pendentesPorSkuLote: Map<string, number>;
  /** Baixas já geradas por esta missão fora da fila (aprovadas/executadas), por SKU|lote. */
  geradasPorSkuLote: Map<string, number>;
  /** Estoque em trânsito por SKU (já normalizado pelo chamador). */
  transitoPorSku: (sku: string) => number;
}): SugestaoConsumo[] {
  const acc = new Map<string, Omit<SugestaoConsumo, "diferenca" | "quantidade" | "marcadoPadrao" | "aviso" | "baixaPendente" | "jaGerado" | "transito">>();

  for (const item of params.itens) {
    const linhas = params.linhasPorItem.get(item.id) ?? [];
    if (linhas.length === 0) continue; // item ainda não contado
    const lotes = params.lotesPorSku.get(item.codigo_produto) ?? [];
    const porLote = new Map<string, { sistema: number; contado: number }>();
    for (const l of linhas) {
      if (l.eh_nao_relacionado) continue; // lote manual não tem saldo sistêmico
      const lote = String(l.lote ?? "");
      const live = lotes.find((x) => x.lote === lote);
      const sistema = item.lote && lote === item.lote && item.quantidade_prevista != null
        ? Number(item.quantidade_prevista)
        : live ? live.saldo : Number(l.saldo_sistemico_lote ?? 0);
      const cur = porLote.get(lote) ?? { sistema, contado: 0 };
      cur.contado += Number(l.quantidade_contada ?? 0) || 0;
      porLote.set(lote, cur);
    }
    for (const [lote, v] of porLote) {
      const chave = chaveSkuLote(item.codigo_produto, lote);
      const live = lotes.find((x) => x.lote === lote);
      const cur = acc.get(chave);
      if (cur) { cur.sistema += v.sistema; cur.contado += v.contado; continue; }
      acc.set(chave, {
        chave,
        codigo_produto: item.codigo_produto,
        descricao: item.descricao ?? item.codigo_produto,
        lote,
        unidade: live?.unidade ?? "UN",
        custo_unitario: live?.custo_unitario ?? 0,
        sistema: v.sistema,
        contado: v.contado,
      });
    }
  }

  const out: SugestaoConsumo[] = [];
  for (const s of acc.values()) {
    const diferenca = r3(s.sistema - s.contado);
    if (diferenca <= 0) continue;
    const baixaPendente = r3(params.pendentesPorSkuLote.get(s.chave) ?? 0);
    const jaGerado = r3(params.geradasPorSkuLote.get(s.chave) ?? 0);
    const transito = r3(params.transitoPorSku(s.codigo_produto) || 0);
    const quantidade = Math.max(0, r3(diferenca - baixaPendente - jaGerado));
    let aviso: string | null = null;
    if (quantidade <= 0) aviso = jaGerado > 0 ? "Já gerada por esta missão" : "Coberta por baixa na fila de aprovação";
    else if (transito > 0) aviso = "Estoque em trânsito — confirme se a nota já foi considerada na contagem";
    out.push({
      ...s,
      sistema: r3(s.sistema),
      contado: r3(s.contado),
      diferenca, baixaPendente, jaGerado, transito, quantidade, aviso,
      marcadoPadrao: quantidade > 0 && transito <= 0,
    });
  }
  return out.sort((a, b) => a.codigo_produto.localeCompare(b.codigo_produto) || a.lote.localeCompare(b.lote));
}

/** Marcador gravado na observação para identificar as baixas originadas pela missão. */
export const marcadorMissao = (missaoId: string) => `[missao:${missaoId}]`;
