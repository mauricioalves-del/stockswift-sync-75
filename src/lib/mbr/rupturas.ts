// MBR · Indicador de rupturas das lojas (fonte: abast_disponibilidade_diaria, o mesmo dado do Dashboard de
// Disponibilidade). Taxa de ruptura = dias-SKU em ruptura ÷ dias-SKU elegíveis, por mês, loja e item.
import { supabase } from "@/integrations/supabase/client";
import { mesesAte, fimDoMes } from "./dados3";
import { COR, MARGEM, LARGURA, fmtMoeda, fmtNum, fmtPct, fmtPP, rotuloMes } from "./formato";
import { cabecalho, caixaLeitura, graficoBarrasH, graficoComboDuplo, linhaKpis, novoSlide, tabela, texto, type Pptx } from "./kit";

const sb = supabase as any;
const LC = LARGURA - 2 * MARGEM;
export type DadosRupturas = Awaited<ReturnType<typeof carregarRupturas>>;

async function contar(de: string, ate: string, ruptura: boolean, loja?: string) {
  let q = sb.from("abast_disponibilidade_diaria").select("id_produto", { count: "exact", head: true }).eq("elegivel", true).gte("data", de).lte("data", ate);
  if (ruptura) q = q.eq("em_ruptura", true);
  if (loja) q = q.eq("loja", loja);
  const { count, error } = await q; if (error) throw error; return count ?? 0;
}

export async function carregarRupturas(mes: string) {
  const meses = mesesAte(mes, 6);
  const serie = await Promise.all(meses.map(async (m) => {
    const [eleg, rup] = await Promise.all([contar(`${m}-01`, fimDoMes(m), false), contar(`${m}-01`, fimDoMes(m), true)]);
    return { mes: m, elegiveis: eleg, rupturas: rup, pct: eleg ? (100 * rup) / eleg : null };
  }));
  const rows: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from("abast_disponibilidade_diaria").select("data, loja, id_produto, descricao, categoria, causa, venda_perdida_rs, venda_perdida_un").eq("elegivel", true).eq("em_ruptura", true).gte("data", `${mes}-01`).lte("data", fimDoMes(mes)).order("data").range(f, f + 999);
    if (error) throw error; rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const lojas = [...new Set(rows.map((r) => String(r.loja)))];
  const porLoja = await Promise.all(lojas.map(async (l) => {
    const eleg = await contar(`${mes}-01`, fimDoMes(mes), false, l), rup = rows.filter((r) => r.loja === l);
    return { loja: l, elegiveis: eleg, rupturas: rup.length, pct: eleg ? (100 * rup.length) / eleg : null, vendaPerdida: rup.reduce((a, r) => a + (Number(r.venda_perdida_rs) || 0), 0) };
  }));
  const itens = new Map<string, { sku: string; descricao: string; dias: number; lojas: Set<string>; vendaPerdida: number }>();
  const causas = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.id_produto); const e = itens.get(k) ?? { sku: k, descricao: r.descricao ?? k, dias: 0, lojas: new Set<string>(), vendaPerdida: 0 };
    e.dias++; e.lojas.add(r.loja); e.vendaPerdida += Number(r.venda_perdida_rs) || 0; itens.set(k, e);
    const c = r.causa || "Sem causa"; causas.set(c, (causas.get(c) ?? 0) + 1);
  }
  const atual = serie.at(-1)!, ant = serie.length >= 2 ? serie.at(-2)! : null;
  return {
    serie, atual, deltaPP: atual.pct != null && ant?.pct != null ? atual.pct - ant.pct : null,
    vendaPerdida: rows.reduce((a, r) => a + (Number(r.venda_perdida_rs) || 0), 0),
    skus: itens.size, porLoja: porLoja.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)),
    topItens: [...itens.values()].map((x) => ({ ...x, lojas: x.lojas.size })).sort((a, b) => b.vendaPerdida - a.vendaPerdida || b.dias - a.dias).slice(0, 8),
    causas: [...causas].map(([nome, n]) => ({ nome, n, pct: rows.length ? (100 * n) / rows.length : 0 })).sort((a, b) => b.n - a.n),
  };
}

export function slideRupturas(p: Pptx, mesLabel: string, pag: number, d: DadosRupturas | null) {
  const s = novoSlide(p);
  const t = d?.atual.pct != null ? `Ruptura nas lojas em ${fmtPct(d.atual.pct)} no mês${d.deltaPP != null ? `, ${d.deltaPP <= 0 ? "queda" : "alta"} de ${fmtPP(Math.abs(d.deltaPP))}` : ""}` : "Indicador de rupturas das lojas";
  cabecalho(s, t, mesLabel, pag, "Dias-SKU em ruptura ÷ dias-SKU elegíveis no portfólio da loja — mesmo dado do Dashboard de Disponibilidade.");
  if (!d) { caixaLeitura(s, MARGEM, 1.7, LC, 1.3, "Rupturas indisponíveis", "Não foi possível ler a disponibilidade diária das lojas.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  const lojaPior = d.porLoja[0];
  linhaKpis(s, 1.62, [
    { valor: fmtPct(d.atual.pct), rotulo: "Taxa de ruptura do mês", cor: (d.atual.pct ?? 0) > 5 ? COR.ERRO : COR.SUCESSO },
    { valor: d.deltaPP == null ? "—" : `${d.deltaPP > 0 ? "+" : ""}${fmtPP(d.deltaPP)}`, rotulo: "Variação vs. mês anterior", cor: (d.deltaPP ?? 0) > 0 ? COR.ERRO : COR.SUCESSO },
    { valor: fmtMoeda(d.vendaPerdida), rotulo: "Venda perdida estimada", cor: COR.ERRO },
    { valor: fmtNum(d.skus), rotulo: "SKUs que romperam no mês" },
    { valor: lojaPior ? lojaPior.loja : "—", rotulo: lojaPior ? `Loja mais crítica · ${fmtPct(lojaPior.pct)}` : "Loja mais crítica" },
  ], 0.7);
  const lg = (LC - 0.35) * 0.55, x2 = MARGEM + lg + 0.35, l2 = LC - lg - 0.35;
  texto(s, MARGEM, 2.5, lg, 0.25, "EVOLUÇÃO DA TAXA DE RUPTURA E DIAS-SKU EM RUPTURA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  graficoComboDuplo(p, s, MARGEM, 2.78, lg, 2.1, d.serie.map((x) => rotuloMes(x.mes)), { nome: "Dias-SKU em ruptura", valores: d.serie.map((x) => x.rupturas), cor: COR.AZUL_CLARO, formato: "#,##0", rotulos: true }, { nome: "Taxa de ruptura (%)", valores: d.serie.map((x) => (x.pct == null ? null : Math.round(x.pct * 10) / 10)) as any, cor: COR.ERRO, formato: "0.0" });
  texto(s, x2, 2.5, l2, 0.25, "TAXA DE RUPTURA POR LOJA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (d.porLoja.length) graficoBarrasH(p, s, x2, 2.78, l2, 2.1, d.porLoja.map((l) => l.loja), "Ruptura (%)", d.porLoja.map((l) => Math.round((l.pct ?? 0) * 10) / 10), { cor: COR.ERRO, formato: "0.0" });
  texto(s, MARGEM, 5.0, lg, 0.25, "ITENS COM MAIOR VENDA PERDIDA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (d.topItens.length) tabela(s, MARGEM, 5.25, lg, 1.6, ["SKU", "Produto", "Dias-loja", "Lojas", "Venda perdida"], d.topItens.slice(0, 6).map((i) => [i.sku, i.descricao.slice(0, 34), fmtNum(i.dias), fmtNum(i.lojas), { t: fmtMoeda(i.vendaPerdida), cor: COR.ERRO, negrito: true }]), { larguras: [1.1, 3.2, 0.9, 0.7, 1.3], tamanho: 9 });
  else caixaLeitura(s, MARGEM, 5.25, lg, 1.6, "Sem rupturas", "Nenhum item em ruptura no mês.");
  texto(s, x2, 5.0, l2, 0.25, "CAUSAS DA RUPTURA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (d.causas.length) tabela(s, x2, 5.25, l2, 1.6, ["Causa", "Dias-SKU", "Part."], d.causas.slice(0, 6).map((c) => [c.nome.slice(0, 30), fmtNum(c.n), fmtPct(c.pct)]), { larguras: [2.9, 1, 0.9], tamanho: 9 });
}
