// Utilidades da Árvore de Ficha Técnica + leitura cruzada com v_impacto_consumo.
// 100% leitura — nenhuma escrita em ficha_tecnica_bom acontece aqui.
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { classificar, percentualDispersao, type Classificacao, type Faixas } from "@/lib/dispersao";

export type BomNo = {
  id_produto: string;
  produto: string | null;
  id_subconjunto: string | null;
  subconjunto: string | null;
  id_item: string;
  item: string | null;
  qtd: number;
  tem_filho: boolean;
  gera_oc: boolean;
  item_unidade: string | null;
};

export type ImpactoLinha = {
  numero_op: string;
  sku_produto_final: string | null;
  desc_prod: string | null;
  material: string;
  desc_material: string | null;
  um: string | null;
  qtd_consumo: number;
  qtd_previsto: number;
  qtd_dif: number;
  impacto_rs: number | null;
  tipo_desvio: "ok" | "perda" | "economia";
};

const norm = (s: unknown) => String(s ?? "").trim();

const COLS = "id_produto,produto,id_subconjunto,subconjunto,id_item,item,qtd,tem_filho,gera_oc,item_unidade";

function dedup(rows: any[]): BomNo[] {
  const map = new Map<string, BomNo>();
  for (const r of rows) {
    const key = norm(r.id_item);
    const atual = map.get(key);
    const no: BomNo = {
      id_produto: norm(r.id_produto),
      produto: r.produto ?? null,
      id_subconjunto: norm(r.id_subconjunto) || null,
      subconjunto: r.subconjunto ?? null,
      id_item: norm(r.id_item),
      item: r.item ?? null,
      qtd: Number(r.qtd ?? 0),
      tem_filho: !!r.tem_filho,
      gera_oc: !!r.gera_oc,
      item_unidade: r.item_unidade ?? null,
    };
    // Linhas duplicadas na importação: mantém a de maior quantidade (versão mais recente da FT).
    if (!atual || no.qtd > atual.qtd) map.set(key, no);
  }
  return Array.from(map.values()).sort((a, b) => (a.item ?? a.id_item).localeCompare(b.item ?? b.id_item));
}

/**
 * Filhos diretos de um nó da árvore. Na base importada, a composição de qualquer
 * nó (produto acabado ou subconjunto) está nas linhas onde id_subconjunto = código do nó.
 * Fallback por id_produto para bases antigas.
 */
export async function carregarFilhos(idNo: string): Promise<BomNo[]> {
  const alvo = norm(idNo);
  if (!alvo) return [];
  const porSub = await fetchAll<any>((from, to) =>
    (supabase as any).from("ficha_tecnica_bom").select(COLS).eq("id_subconjunto", alvo).range(from, to),
  );
  if (porSub.length) return dedup(porSub);
  const porProduto = await fetchAll<any>((from, to) =>
    (supabase as any).from("ficha_tecnica_bom").select(COLS).eq("id_produto", alvo).range(from, to),
  );
  return dedup(porProduto);
}

/** Descrição de um código, buscando em produto → subconjunto → item. */
export async function descricaoDeCodigo(codigo: string): Promise<string | null> {
  const alvo = norm(codigo);
  if (!alvo) return null;
  const { data } = await (supabase as any)
    .from("ficha_tecnica_bom")
    .select("produto,subconjunto,item,id_produto,id_subconjunto,id_item")
    .or(`id_produto.eq.${alvo},id_subconjunto.eq.${alvo},id_item.eq.${alvo}`)
    .limit(50);
  for (const r of (data ?? []) as any[]) {
    if (norm(r.id_produto) === alvo && r.produto) return r.produto;
  }
  for (const r of (data ?? []) as any[]) {
    if (norm(r.id_subconjunto) === alvo && r.subconjunto) return r.subconjunto;
  }
  for (const r of (data ?? []) as any[]) {
    if (norm(r.id_item) === alvo && r.item) return r.item;
  }
  return null;
}


export type AgregadoItem = {
  linhas: ImpactoLinha[];
  ops: number;
  previsto: number;
  consumo: number;
  dif: number;
  impacto: number;
  pct: number | "NAO_PREVISTO";
  cls: Classificacao;
  semProducao: boolean;
  causa: "Estrutural" | "Apontamento" | null;
  /** filtro que leva à tela Dispersão de Lote */
  filtro: { produto?: string; material?: string };
};

/**
 * Agrega Previsto/Consumo/Dif/Impacto de um nó da árvore:
 * - gera_oc = true  → o item tem OP própria: agrega por sku_produto_final = id_item.
 * - gera_oc = false → consumido dentro da OP do pai: agrega por material = id_item
 *   E sku_produto_final = produto raiz da árvore.
 */
export function agregarItem(
  impacto: ImpactoLinha[],
  no: BomNo,
  idProdutoRaiz: string,
  faixas: Faixas,
): AgregadoItem {
  const item = norm(no.id_item);
  const raiz = norm(idProdutoRaiz);
  const linhas = no.gera_oc
    ? impacto.filter((r) => norm(r.sku_produto_final) === item)
    : impacto.filter((r) => norm(r.material) === item && norm(r.sku_produto_final) === raiz);

  let previsto = 0, consumo = 0, imp = 0;
  const ops = new Set<string>();
  for (const r of linhas) {
    previsto += Number(r.qtd_previsto ?? 0);
    consumo += Number(r.qtd_consumo ?? 0);
    imp += Number(r.impacto_rs ?? 0);
    ops.add(r.numero_op);
  }
  const dif = consumo - previsto;
  const pct = percentualDispersao(dif, previsto, consumo);
  return {
    linhas,
    ops: ops.size,
    previsto,
    consumo,
    dif,
    impacto: imp,
    pct,
    cls: classificar(pct, faixas),
    semProducao: linhas.length === 0,
    causa: causaProvavel(linhas, faixas),
    filtro: no.gera_oc ? { produto: item } : { produto: raiz, material: item },
  };
}

/**
 * Causa provável a partir do histórico de OPs:
 * >= 3 OPs com desvio e >= 70% delas na mesma direção → "Estrutural"; caso contrário "Apontamento".
 */
export function causaProvavel(linhas: ImpactoLinha[], faixas: Faixas): "Estrutural" | "Apontamento" | null {
  const comDesvio = linhas.filter((r) => {
    const pct = percentualDispersao(Number(r.qtd_dif ?? 0), Number(r.qtd_previsto ?? 0), Number(r.qtd_consumo ?? 0));
    return classificar(pct, faixas) !== "NORMAL" && Number(r.qtd_dif ?? 0) !== 0;
  });
  if (comDesvio.length === 0) return null;
  const pos = comDesvio.filter((r) => Number(r.qtd_dif) > 0).length;
  const neg = comDesvio.length - pos;
  const dominante = Math.max(pos, neg) / comDesvio.length;
  return comDesvio.length >= 3 && dominante >= 0.7 ? "Estrutural" : "Apontamento";
}

/** Mediana simples. */
export function mediana(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Remove outliers fora de 1.5x IQR. */
export function semOutliers(vals: number[]): number[] {
  if (vals.length < 4) return vals;
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const min = q1 - 1.5 * iqr, max = q3 + 1.5 * iqr;
  const f = s.filter((v) => v >= min && v <= max);
  return f.length ? f : s;
}

export type SugestaoFT = {
  qtd_sugerida: number;
  metodo_calculo: string;
  justificativa: string;
  ops_analisadas: number;
};

/**
 * Sugere nova quantidade de FT: mediana de (consumo real ÷ quantidade produzida) das
 * últimas 12 OPs do item, descartando outliers fora de 1.5x IQR.
 */
export async function calcularSugestaoFT(params: {
  produtoRaiz: string;
  materialId: string;
  gera_oc: boolean;
  qtdAtual: number;
  impactoLinhas: ImpactoLinha[];
}): Promise<SugestaoFT | null> {
  const { produtoRaiz, materialId, gera_oc, qtdAtual, impactoLinhas } = params;
  const alvoProduto = gera_oc ? materialId : produtoRaiz;
  let q = (supabase as any)
    .from("producao_consumo")
    .select("id_op, material, produto, qtd_consumo, qtd_produzida, data_producao")
    .eq("produto", alvoProduto)
    .order("data_producao", { ascending: false, nullsFirst: false })
    .limit(400);
  if (!gera_oc) q = q.eq("material", materialId);
  const { data, error } = await q;
  if (error) throw error;

  const porOp = new Map<string, { consumo: number; produzida: number }>();
  for (const r of (data ?? []) as any[]) {
    const op = norm(r.id_op);
    if (!op) continue;
    const cur = porOp.get(op) ?? { consumo: 0, produzida: 0 };
    cur.consumo += Number(r.qtd_consumo ?? 0);
    cur.produzida = Math.max(cur.produzida, Number(r.qtd_produzida ?? 0));
    porOp.set(op, cur);
  }
  const ratios = Array.from(porOp.values())
    .filter((v) => v.produzida > 0 && v.consumo > 0)
    .slice(0, 12)
    .map((v) => v.consumo / v.produzida);
  if (!ratios.length) return null;

  const limpos = semOutliers(ratios);
  const sugerida = mediana(limpos);
  const desvios = impactoLinhas
    .map((r) => percentualDispersao(Number(r.qtd_dif ?? 0), Number(r.qtd_previsto ?? 0), Number(r.qtd_consumo ?? 0)))
    .filter((p): p is number => p !== "NAO_PREVISTO");
  const pctMedio = desvios.length ? desvios.reduce((s, v) => s + v, 0) / desvios.length : 0;
  const impactoAcum = impactoLinhas.reduce((s, r) => s + Math.abs(Number(r.impacto_rs ?? 0)), 0);

  return {
    qtd_sugerida: Number(sugerida.toFixed(6)),
    metodo_calculo: `Mediana de (consumo real ÷ quantidade produzida) das últimas ${limpos.length} OP(s) analisadas (${ratios.length} coletadas, outliers fora de 1.5×IQR descartados).`,
    justificativa:
      `${ratios.length} OP(s) analisadas; desvio médio de ${pctMedio.toFixed(1)}% frente à FT atual (${qtdAtual}); ` +
      `impacto financeiro acumulado de R$ ${impactoAcum.toFixed(2)} no período.`,
    ops_analisadas: ratios.length,
  };
}
