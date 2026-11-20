// Histórico do custo contábil (carga diária de lotes) e o custo vigente numa data, por SKU e região (SP/PA).
import { supabase } from "@/integrations/supabase/client";
import { ehOrigemPara } from "./custo-contabil";

const sb = supabase as any;
export const skuNorm = (s: string | null | undefined) => String(s ?? "").trim().replace(/^0+/, "");
export const regiaoDe = (almox: string | null | undefined): "SP" | "PA" => (ehOrigemPara(almox) ? "PA" : "SP");

/** Custo contábil médio (ponderado pela quantidade) por SKU e região, a partir das linhas de uma carga. */
export function agregarCustoContabil(linhas: { id_produto: string; origem: string; quantidade: number; custo_contabil: number | null; custo_padrao: number | null }[]) {
  const m = new Map<string, { sku: string; regiao: "SP" | "PA"; pq: number; q: number; soma: number; n: number; padrao: number | null }>();
  for (const l of linhas) {
    if (!(Number(l.custo_contabil) > 0)) continue;
    const sku = skuNorm(l.id_produto), regiao = regiaoDe(l.origem), k = `${sku}|${regiao}`;
    const a = m.get(k) ?? { sku, regiao, pq: 0, q: 0, soma: 0, n: 0, padrao: l.custo_padrao ?? null };
    const q = Math.max(0, Number(l.quantidade) || 0);
    a.pq += q * Number(l.custo_contabil); a.q += q; a.soma += Number(l.custo_contabil); a.n++; m.set(k, a);
  }
  return [...m.values()].map((a) => ({ sku: a.sku, regiao: a.regiao, custo_contabil: Math.round((a.q > 0 ? a.pq / a.q : a.soma / a.n) * 10000) / 10000, custo_padrao: a.padrao, quantidade: a.q }));
}

/** Custo contábil vigente na data (último registro do histórico até a data) para os SKUs, na região do almoxarifado. */
export async function custoContabilNaData(skus: string[], almox: string, data: string): Promise<Map<string, number>> {
  const regiao = regiaoDe(almox), alvo = [...new Set(skus.map(skuNorm))], out = new Map<string, number>();
  for (let i = 0; i < alvo.length; i += 200) {
    const { data: rows, error } = await sb.from("custo_contabil_historico").select("sku, data, custo_contabil").eq("regiao", regiao).lte("data", data).in("sku", alvo.slice(i, i + 200)).order("data", { ascending: false }).limit(5000);
    if (error) break; // tabela ainda não criada: segue com o custo de hoje
    for (const r of rows ?? []) if (!out.has(r.sku)) out.set(r.sku, Number(r.custo_contabil));
  }
  return out;
}
