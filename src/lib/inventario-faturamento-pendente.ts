// Conciliação de vendas não faturadas (maquininha recebeu, pedido ficou em aberto):
// usa as faltas de PRODUTO ACABADO do inventário (Final − Sistema, somando lotes por SKU) e o preço de venda
// para montar a combinação de itens cujo total chegue o mais perto possível do valor em aberto, sem ultrapassá-lo.

export type ItemInv = { codigo_produto: string; descricao: string | null; grupo: string | null; qtd_sistema: number | null; qtd_final: number | null; qtd_faturada?: number | null };
export type LinhaConc = { sku: string; descricao: string; sistema: number; final: number; dif: number; falta: number; preco: number | null; qtd: number; valor: number };

export const chaveSkuInv = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/^0+(?=.)/, "");
export const ehAcabado = (g: string | null | undefined) => String(g ?? "").toLowerCase().includes("acabado");

/** SKUs de produto acabado com diferença no total dos lotes. Usa a contagem real (Final − unidades já faturadas). */
export function divergentesAcabados(itens: ItemInv[], precoPorSku: Map<string, number>): LinhaConc[] {
  const m = new Map<string, LinhaConc>();
  for (const i of itens) {
    if (!ehAcabado(i.grupo) || i.qtd_final == null) continue;
    const k = chaveSkuInv(i.codigo_produto);
    const e = m.get(k) ?? { sku: String(i.codigo_produto).trim(), descricao: i.descricao ?? "", sistema: 0, final: 0, dif: 0, falta: 0, preco: precoPorSku.get(k) ?? null, qtd: 0, valor: 0 };
    e.sistema += Number(i.qtd_sistema) || 0; e.final += (Number(i.qtd_final) || 0) - (Number(i.qtd_faturada) || 0); e.qtd += Number(i.qtd_faturada) || 0; m.set(k, e);
  }
  return [...m.values()].map((e) => { const dif = Math.round((e.final - e.sistema) * 10000) / 10000; return { ...e, dif, falta: dif < 0 ? Math.floor(-dif) : 0, valor: Math.round(e.qtd * (e.preco ?? 0) * 100) / 100 }; })
    .filter((e) => e.dif !== 0).sort((a, b) => a.dif - b.dif);
}

/**
 * Melhor combinação de faltas para o valor em aberto (unidades inteiras, nunca acima do valor nem da falta).
 * Pode passar do valor em aberto até a tolerância. Prioridade: cobrir o valor (até valor + tolerância) com o maior
 * número de produtos diferentes, depois mais unidades, depois o total mais próximo do valor. Sem cobertura possível,
 * fica com o maior total abaixo do valor.
 */
export const TOLERANCIA_PADRAO = 10;

export function conciliarValorAberto(linhas: LinhaConc[], valorAberto: number, tolerancia = 0): { linhas: LinhaConc[]; total: number; restante: number } {
  const alvo = Math.max(0, Math.round(valorAberto * 100)); const cap = alvo > 0 ? alvo + Math.max(0, Math.round(tolerancia * 100)) : 0;
  const us = linhas.map((l, idx) => ({ idx, c: l.preco && l.preco > 0 ? Math.round(l.preco * 100) : 0, n: l.falta })).filter((u) => u.c > 0 && u.n > 0 && u.c <= cap);
  const qtd: number[] = new Array(linhas.length).fill(0);
  if (cap > 0 && us.length && cap * us.length <= 60_000_000) {
    const NEG = -1;
    let best = new Float64Array(cap + 1).fill(NEG); best[0] = 0; // pontuação = produtos*100000 + unidades
    const escolhas: Uint16Array[] = [];
    for (const u of us) {
      const nb = new Float64Array(best); const ch = new Uint16Array(cap + 1);
      for (let v = 0; v <= cap; v++) for (let k = 1; k <= u.n && k * u.c <= v; k++) {
        const b = best[v - k * u.c]!; if (b === NEG) continue; const sc = b + 100000 + k;
        if (sc > nb[v]!) { nb[v] = sc; ch[v] = k; }
      }
      best = nb; escolhas.push(ch);
    }
    let v = -1, sv = -1; for (let x = alvo; x <= cap; x++) if (best[x]! > sv) { sv = best[x]!; v = x; }
    if (v < 0) { v = alvo; while (best[v] === NEG) v--; }
    for (let j = us.length - 1; j >= 0; j--) { const k = escolhas[j]![v]!; qtd[us[j]!.idx] = k; v -= k * us[j]!.c; }
  } else {
    let r = alvo; for (const u of [...us].sort((a, b) => a.c - b.c)) { const t = Math.min(u.n, Math.floor(r / u.c)); qtd[u.idx] = t; r -= t * u.c; }
  }
  const out = linhas.map((l, i) => ({ ...l, qtd: qtd[i]!, valor: Math.round(qtd[i]! * (l.preco ?? 0) * 100) / 100 }));
  const total = Math.round(out.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  return { linhas: out, total, restante: Math.round((valorAberto - total) * 100) / 100 };
}

/** Distribui as unidades faturadas de um SKU pelos lotes com falta (maior falta primeiro). */
export function distribuirPorLote<T extends { id: string; qtd_sistema: number | null; qtd_final: number | null }>(lotes: T[], unidades: number): { id: string; add: number }[] {
  const out: { id: string; add: number }[] = []; let r = unidades;
  for (const l of [...lotes].sort((a, b) => (Number(b.qtd_sistema) - Number(b.qtd_final)) - (Number(a.qtd_sistema) - Number(a.qtd_final)))) {
    if (r <= 0) break; const f = Math.floor(Number(l.qtd_sistema) - Number(l.qtd_final)); if (f <= 0) continue;
    const a = Math.min(f, r); out.push({ id: l.id, add: a }); r -= a;
  }
  if (r > 0 && lotes[0]) { const e = out.find((o) => o.id === lotes[0]!.id); if (e) e.add += r; else out.push({ id: lotes[0].id, add: r }); }
  return out;
}
