// Lotes a corrigir no sistema após a recontagem: todo lote cuja contagem final difere do saldo sistêmico.
// Classifica o SKU como divergente (soma dos lotes difere) ou apenas correção de lote (soma bate, lotes não).
export type ItemInv = { codigo_produto: string; descricao?: string | null; lote: string | null; qtd_sistema: number | null; qtd_contagem: number | null; qtd_recontagem: number | null; qtd_final: number | null; qtd_faturada?: number | null };
export type LoteCorrecao = { sku: string; descricao: string; lote: string; sistema: number; contado: number; diferenca: number; tipo: "DIVERGENTE" | "CORRECAO_LOTE" };

const r = (n: number) => Math.round(n * 1000) / 1000;
export const qtdFinal = (i: ItemInv) => i.qtd_final ?? i.qtd_recontagem ?? i.qtd_contagem;

export function lotesParaCorrecao(itens: ItemInv[]): LoteCorrecao[] {
  const porSku = new Map<string, ItemInv[]>();
  for (const i of itens) porSku.set(i.codigo_produto, [...(porSku.get(i.codigo_produto) ?? []), i]);
  const out: LoteCorrecao[] = [];
  for (const [sku, ls] of porSku) {
    if (ls.some((i) => Number(i.qtd_faturada) > 0)) continue; // SKU faturado na conciliação: fica fora do ajuste para não quebrar lote
    const lotes = new Map<string, { sis: number; cont: number; desc: string }>();
    for (const i of ls) { const k = (i.lote ?? "").trim(); const a = lotes.get(k) ?? { sis: 0, cont: 0, desc: i.descricao ?? "" }; a.sis += Number(i.qtd_sistema ?? 0); a.cont += Number(qtdFinal(i) ?? 0); lotes.set(k, a); }
    const difs = [...lotes].filter(([, v]) => r(v.cont - v.sis) !== 0);
    if (!difs.length) continue;
    const tot = r([...lotes.values()].reduce((s, v) => s + v.cont - v.sis, 0));
    for (const [lote, v] of difs) out.push({ sku, descricao: v.desc, lote, sistema: r(v.sis), contado: r(v.cont), diferenca: r(v.cont - v.sis), tipo: tot !== 0 ? "DIVERGENTE" : "CORRECAO_LOTE" });
  }
  return out.sort((a, b) => a.sku.localeCompare(b.sku) || a.lote.localeCompare(b.lote));
}

// Linhas no layout do Modelo_Inventário (Id_Produto, Id_Local, Id_Lote, Id_Chave, Cont1).
export const CAB_MODELO = ["Id_Produto", "Id_Local", " Id_Lote", " Id_Chave", " Cont1"];
export const linhasModelo = (ls: LoteCorrecao[]) => ls.map((l) => [l.sku, "", l.lote, null, l.contado]);
