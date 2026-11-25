// Conciliação de vendas não faturadas (maquininha recebeu, pedido ficou em aberto):
// usa as faltas de PRODUTO ACABADO do inventário (Final − Sistema, somando lotes por SKU) e o preço de venda
// para montar a combinação de itens cujo total chegue o mais perto possível do valor em aberto, sem ultrapassá-lo.

export type ItemInv = { codigo_produto: string; descricao: string | null; grupo: string | null; qtd_sistema: number | null; qtd_final: number | null };
export type LinhaConc = { sku: string; descricao: string; sistema: number; final: number; dif: number; falta: number; preco: number | null; qtd: number; valor: number };

export const chaveSkuInv = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/^0+(?=.)/, "");
export const ehAcabado = (g: string | null | undefined) => String(g ?? "").toLowerCase().includes("acabado");

/** SKUs de produto acabado com diferença no total dos lotes (usa a coluna Final). */
export function divergentesAcabados(itens: ItemInv[], precoPorSku: Map<string, number>): LinhaConc[] {
  const m = new Map<string, LinhaConc>();
  for (const i of itens) {
    if (!ehAcabado(i.grupo) || i.qtd_final == null) continue;
    const k = chaveSkuInv(i.codigo_produto);
    const e = m.get(k) ?? { sku: String(i.codigo_produto).trim(), descricao: i.descricao ?? "", sistema: 0, final: 0, dif: 0, falta: 0, preco: precoPorSku.get(k) ?? null, qtd: 0, valor: 0 };
    e.sistema += Number(i.qtd_sistema) || 0; e.final += Number(i.qtd_final) || 0; m.set(k, e);
  }
  return [...m.values()].map((e) => { const dif = Math.round((e.final - e.sistema) * 10000) / 10000; return { ...e, dif, falta: dif < 0 ? Math.floor(-dif) : 0 }; })
    .filter((e) => e.dif !== 0).sort((a, b) => a.dif - b.dif);
}

/** Distribui o valor em aberto entre as faltas (unidades inteiras), maximizando o total faturado ≤ valor. */
export function conciliarValorAberto(linhas: LinhaConc[], valorAberto: number): { linhas: LinhaConc[]; total: number; restante: number } {
  const cap = Math.max(0, Math.round(valorAberto * 100));
  const usaveis = linhas.map((l, idx) => ({ idx, c: l.preco && l.preco > 0 ? Math.round(l.preco * 100) : 0, n: l.falta })).filter((u) => u.c > 0 && u.n > 0 && u.c <= cap);
  const qtd = new Array(linhas.length).fill(0);
  // pacotes por divisão binária (knapsack limitado) → DP de alcance em centavos
  const pac: { idx: number; k: number; c: number }[] = [];
  for (const u of usaveis) { let r = u.n, k = 1; while (r > 0) { const t = Math.min(k, r); pac.push({ idx: u.idx, k: t, c: t * u.c }); r -= t; k *= 2; } }
  if (cap > 0 && pac.length && cap * pac.length <= 300_000_000) {
    const de = new Int32Array(cap + 1).fill(-1); de[0] = pac.length; // de[v] = pacote que alcançou v (pac.length = origem)
    const prev = new Int32Array(cap + 1);
    for (let p = 0; p < pac.length; p++) { const c = pac[p]!.c; for (let v = cap; v >= c; v--) if (de[v] === -1 && de[v - c] !== -1 && de[v - c] !== p) { de[v] = p; prev[v] = v - c; } }
    let v = cap; while (de[v] === -1) v--;
    while (v > 0) { const p = pac[de[v]!]!; qtd[p.idx] += p.k; v = prev[v]!; }
  } else { // valores muito altos: guloso pelo maior preço
    let r = cap; for (const u of [...usaveis].sort((a, b) => b.c - a.c)) { const t = Math.min(u.n, Math.floor(r / u.c)); qtd[u.idx] = t; r -= t * u.c; }
  }
  const out = linhas.map((l, i) => ({ ...l, qtd: qtd[i], valor: Math.round(qtd[i] * (l.preco ?? 0) * 100) / 100 }));
  const total = Math.round(out.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  return { linhas: out, total, restante: Math.round((valorAberto - total) * 100) / 100 };
}
