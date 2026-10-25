// Indicadores dos fechamentos de inventário do Atlas (fechamento_router.py → dashboard/*), em TypeScript.
// Base: itens dos fechamentos mensais (atlas_itens_fechamento) + data/almoxarifado do fechamento + custo do cadastro.
// Três modelos de acurácia, como no Atlas: item a item (% de SKUs sem divergência), IAQ (ponderada por quantidade) e
// IAP (ponderada por valor, só SKUs com custo cadastrado).
import { lerTudo } from "./atlas-investigacao";

export type ItemInv = { id: number; fechamento_id: number; sku: string; descricao: string | null; almoxarifado: string; categoria: string | null; qtd_sistema: number; qtd_contagem: number; divergencia: number; valor: number; pct: number | null; divergente: boolean; mes: string | null; data: string | null; recorrente: boolean; recorrencias: number };
export type Fechamento = { id: number; almoxarifado: string; data: string; mes: string };
export type DadosInv = { itens: ItemInv[]; fechamentos: Fechamento[]; custos: Map<string, number> };
export type FiltroInv = { almox: string | null; mes: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const FAIXAS: [number, number, string][] = [[0, 5, "0 a 5 un."], [5, 20, "5 a 20 un."], [20, 100, "20 a 100 un."], [100, Infinity, "mais de 100 un."]];

export async function carregarInventario(): Promise<DadosInv> {
  const [fech, itens, prod] = await Promise.all([
    lerTudo<any>("atlas_fechamentos_inventario", "id, almoxarifado, data_fechamento"),
    lerTudo<any>("atlas_itens_fechamento", "id, fechamento_id, sku, descricao_produto, almoxarifado, categoria_produto, qtd_sistema, qtd_contagem, divergencia_qtd, valor_estimado, percentual_acuracia, divergente, recorrencias_anteriores, destaque_recorrente"),
    lerTudo<any>("atlas_produtos", "sku, custo_unitario", (q) => q.not("custo_unitario", "is", null), "sku"),
  ]);
  return montarInventario(fech, itens, prod);
}

/** Monta a base a partir das linhas cruas (separado do carregamento para dar para testar com o backup). */
export function montarInventario(fech: any[], itens: any[], prod: any[]): DadosInv {
  const fechamentos: Fechamento[] = fech.filter((f) => f.data_fechamento).map((f) => ({ id: Number(f.id), almoxarifado: f.almoxarifado, data: String(f.data_fechamento).slice(0, 10), mes: String(f.data_fechamento).slice(0, 7) }));
  const fm = new Map(fechamentos.map((f) => [f.id, f]));
  return {
    fechamentos,
    custos: new Map(prod.filter((p) => p.custo_unitario != null).map((p) => [p.sku, Number(p.custo_unitario)])),
    itens: itens.map((i) => {
      const f = fm.get(Number(i.fechamento_id));
      return { id: Number(i.id), fechamento_id: Number(i.fechamento_id), sku: i.sku, descricao: i.descricao_produto, almoxarifado: i.almoxarifado, categoria: i.categoria_produto, qtd_sistema: Number(i.qtd_sistema) || 0, qtd_contagem: Number(i.qtd_contagem) || 0, divergencia: Number(i.divergencia_qtd) || 0, valor: Number(i.valor_estimado) || 0, pct: i.percentual_acuracia == null ? null : Number(i.percentual_acuracia), divergente: i.divergente === true || i.divergente === "t", mes: f?.mes ?? null, data: f?.data ?? null, recorrente: i.destaque_recorrente === true || i.destaque_recorrente === "t", recorrencias: Number(i.recorrencias_anteriores) || 0 };
    }),
  };
}

const filtrar = (D: DadosInv, f: FiltroInv) => D.itens.filter((i) => (!f.almox || i.almoxarifado === f.almox) && (!f.mes || i.mes === f.mes));
/** Valor da divergência pelo custo atual do cadastro; sem custo, o valor gravado no fechamento (planilha). */
const valorAtual = (D: DadosInv, i: ItemInv) => { const c = D.custos.get(i.sku); return c != null ? Math.abs(i.divergencia) * c : Math.abs(i.valor); };

// ---------- Painel Inventário ----------
export function kpis(D: DadosInv, f: FiltroInv) {
  const it = filtrar(D, f); const div = it.filter((i) => i.divergente);
  const comPct = it.filter((i) => i.pct != null);
  const faltas = div.filter((i) => i.divergencia < 0).reduce((s, i) => s + Math.abs(i.valor), 0);
  const sobras = div.filter((i) => i.divergencia > 0).reduce((s, i) => s + Math.abs(i.valor), 0);
  return {
    total: it.length, divergentes: div.length,
    acuracia: it.length ? r2(((it.length - div.length) / it.length) * 100) : null,
    acima95: comPct.length ? r2((comPct.filter((i) => i.pct! >= 0.95).length / comPct.length) * 100) : null,
    faltas: r2(faltas), sobras: r2(sobras), resultado: r2(sobras - faltas),
  };
}
function acuraciaPor(itens: ItemInv[], chave: (i: ItemInv) => string) {
  const m = new Map<string, { total: number; ok: number; comPct: number; acima: number }>();
  for (const i of itens) { const k = chave(i); const v = m.get(k) ?? { total: 0, ok: 0, comPct: 0, acima: 0 }; v.total++; if (!i.divergente) v.ok++; if (i.pct != null) { v.comPct++; if (i.pct >= 0.95) v.acima++; } m.set(k, v); }
  return [...m].map(([k, v]) => ({ chave: k, acuracia: v.total ? r2((v.ok / v.total) * 100) : null, acima95: v.comPct ? r2((v.acima / v.comPct) * 100) : null, total: v.total })).sort((a, b) => (b.acuracia ?? 0) - (a.acuracia ?? 0));
}
export const porGrupo = (D: DadosInv, f: FiltroInv) => acuraciaPor(filtrar(D, f), (i) => i.categoria || "Sem categoria");
export const porAlmox = (D: DadosInv, mes: string | null) => acuraciaPor(filtrar(D, { almox: null, mes }), (i) => i.almoxarifado);

export function rankingFinanceiro(D: DadosInv, f: FiltroInv, limite = 10) {
  const m = new Map<string, { descricao: string | null; valor: number }>();
  for (const i of filtrar(D, f)) { if (!i.divergente) continue; const v = m.get(i.sku) ?? { descricao: i.descricao, valor: 0 }; v.descricao = i.descricao; v.valor += i.divergencia < 0 ? i.valor : -i.valor; m.set(i.sku, v); }
  const l = [...m].map(([sku, v]) => ({ sku, descricao: v.descricao, valor: r2(v.valor) }));
  return { faltas: l.filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, limite), sobras: l.filter((x) => x.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, limite).map((x) => ({ ...x, valor: Math.abs(x.valor) })) };
}

/** Ranking por SKU entre todos os fechamentos (só almoxarifado filtra): recorrência, impacto em faltas e score de risco. */
export function rankingSku(D: DadosInv, almox: string | null, modo: "recorrentes" | "impacto" | "risco", limite = 10) {
  const m = new Map<string, { descricao: string | null; almox: string | null; ocorrencias: number; valor: number; ultima: string | null }>();
  for (const i of D.itens) {
    if (!i.divergente || (almox && i.almoxarifado !== almox) || (modo === "impacto" && !(i.divergencia < 0))) continue;
    const v = m.get(i.sku) ?? { descricao: i.descricao, almox: null, ocorrencias: 0, valor: 0, ultima: null };
    v.descricao = i.descricao; v.ocorrencias++; v.valor += Math.abs(i.valor);
    if (modo === "risco") v.almox = i.almoxarifado;
    if (i.data && (!v.ultima || i.data > v.ultima)) { v.ultima = i.data; if (modo !== "risco") v.almox = i.almoxarifado; }
    m.set(i.sku, v);
  }
  let l = [...m].map(([sku, v]) => ({ sku, ...v, valor: r2(v.valor), score: r2(v.ocorrencias * v.valor) }));
  if (modo === "risco") l = l.filter((x) => x.ocorrencias >= 2).sort((a, b) => b.score - a.score);
  else if (modo === "impacto") l.sort((a, b) => b.valor - a.valor);
  else l.sort((a, b) => b.ocorrencias - a.ocorrencias);
  return l.slice(0, limite);
}

export function evolucaoMensal(D: DadosInv, almox: string | null) {
  const meses = new Map<string, { ids: Set<number>; almox: Set<string> }>();
  for (const f of D.fechamentos) { if (almox && f.almoxarifado !== almox) continue; const v = meses.get(f.mes) ?? { ids: new Set(), almox: new Set() }; v.ids.add(f.id); v.almox.add(f.almoxarifado); meses.set(f.mes, v); }
  let ant: number | null = null;
  return [...meses].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, v]) => {
    const it = D.itens.filter((i) => v.ids.has(i.fechamento_id));
    const ac = it.length ? r2((it.filter((i) => !i.divergente).length / it.length) * 100) : null;
    const varPp = ac != null && ant != null ? r2(ac - ant) : null; ant = ac;
    return { mes, rotulo: `${mes.slice(5)}/${mes.slice(2, 4)}`, acuracia: ac, varPp, fechamentos: v.ids.size, almoxarifados: v.almox.size, valor: r2(it.filter((i) => i.divergente).reduce((s, i) => s + Math.abs(i.valor), 0)) };
  });
}

// ---------- Acurácia Ponderada ----------
export function tresModelos(D: DadosInv, itens: ItemInv[]) {
  if (!itens.length) return { item: null as number | null, iaq: null as number | null, iap: null as number | null, cobertura: null as number | null, portfolio: 0, divergenteValor: 0, qtdSistema: 0, qtdDivergente: 0 };
  const div = itens.filter((i) => i.divergente);
  const item = r2(((itens.length - div.length) / itens.length) * 100);
  const qtdSistema = itens.reduce((s, i) => s + Math.abs(i.qtd_sistema), 0);
  const qtdDivergente = div.reduce((s, i) => s + Math.abs(i.divergencia), 0);
  const iaq = qtdSistema ? r2((1 - qtdDivergente / qtdSistema) * 100) : null;
  const comCusto = itens.filter((i) => D.custos.has(i.sku));
  const portfolio = comCusto.reduce((s, i) => s + i.qtd_sistema * D.custos.get(i.sku)!, 0);
  const divergenteValor = comCusto.filter((i) => i.divergente).reduce((s, i) => s + Math.abs(i.divergencia) * D.custos.get(i.sku)!, 0);
  const iap = comCusto.length && portfolio ? r2((1 - divergenteValor / portfolio) * 100) : null;
  return { item, iaq, iap, cobertura: r2((comCusto.length / itens.length) * 100), portfolio: r2(portfolio), divergenteValor: r2(divergenteValor), qtdSistema: r2(qtdSistema), qtdDivergente: r2(qtdDivergente) };
}
export const comparativo = (D: DadosInv, f: FiltroInv) => tresModelos(D, filtrar(D, f));
function comparativoPor(D: DadosInv, itens: ItemInv[], chave: (i: ItemInv) => string) {
  const m = new Map<string, ItemInv[]>(); for (const i of itens) (m.get(chave(i)) ?? m.set(chave(i), []).get(chave(i))!).push(i);
  return [...m].map(([k, l]) => ({ chave: k, ...tresModelos(D, l) })).sort((a, b) => (b.item ?? 0) - (a.item ?? 0));
}
export const comparativoPorGrupo = (D: DadosInv, f: FiltroInv) => comparativoPor(D, filtrar(D, f), (i) => i.categoria || "Sem categoria");
export const comparativoPorAlmox = (D: DadosInv, mes: string | null) => comparativoPor(D, filtrar(D, { almox: null, mes }), (i) => i.almoxarifado);

/** Curva de concentração (Pareto) do valor divergente. */
export function concentracao(D: DadosInv, f: FiltroInv, topN = 10) {
  const div = filtrar(D, f).filter((i) => i.divergente).map((i) => ({ i, v: valorAtual(D, i) })).sort((a, b) => b.v - a.v);
  const total = div.reduce((s, x) => s + x.v, 0); let acum = 0;
  const curva = div.slice(0, 50).map((x, k) => { acum += x.v; return { posicao: k + 1, sku: x.i.sku, descricao: x.i.descricao, almox: x.i.almoxarifado, data: x.i.data, divergencia: x.i.divergencia, valor: r2(x.v), pctItens: Math.round(((k + 1) / div.length) * 1000) / 10, pctValor: total ? Math.round((acum / total) * 1000) / 10 : 0 }; });
  const topValor = div.slice(0, topN).reduce((s, x) => s + x.v, 0);
  return { curva, total: div.length, valorTotal: r2(total), topN: Math.min(topN, div.length), topNPct: total ? Math.round((topValor / total) * 1000) / 10 : null };
}

export function magnitude(D: DadosInv, f: FiltroInv) {
  const div = filtrar(D, f).filter((i) => i.divergente);
  const faixas = FAIXAS.map(([min, max, rotulo]) => { const g = div.filter((i) => Math.abs(i.divergencia) >= min && Math.abs(i.divergencia) < max); return { faixa: rotulo, itens: g.length, valor: r2(g.reduce((s, i) => s + valorAtual(D, i), 0)) }; });
  return { faixas, total: div.length, pctPequenas: div.length ? Math.round((faixas[0].itens / div.length) * 1000) / 10 : null };
}

export function faltaSobra(D: DadosInv, f: FiltroInv, topN = 5) {
  const div = filtrar(D, f).filter((i) => i.divergente);
  const ser = (l: ItemInv[]) => l.map((i) => ({ sku: i.sku, descricao: i.descricao, almox: i.almoxarifado, divergencia: i.divergencia, valor: r2(valorAtual(D, i)) }));
  const falta = div.filter((i) => i.divergencia < 0).sort((a, b) => valorAtual(D, b) - valorAtual(D, a));
  const sobra = div.filter((i) => i.divergencia > 0).sort((a, b) => valorAtual(D, b) - valorAtual(D, a));
  return { falta: ser(falta.slice(0, topN)), sobra: ser(sobra.slice(0, topN)), valorFalta: r2(falta.reduce((s, i) => s + valorAtual(D, i), 0)), valorSobra: r2(sobra.reduce((s, i) => s + valorAtual(D, i), 0)), qtdFalta: falta.length, qtdSobra: sobra.length };
}

export function evolucaoPonderada(D: DadosInv, almox: string | null) {
  const meses = [...new Set(D.fechamentos.filter((f) => !almox || f.almoxarifado === almox).map((f) => f.mes))].sort();
  let ant: { item: number | null; iaq: number | null; iap: number | null; mod: number | null } = { item: null, iaq: null, iap: null, mod: null };
  return meses.map((mes) => {
    const it = filtrar(D, { almox, mes }); const t = tresModelos(D, it);
    const mod = r2(it.filter((i) => i.divergente).reduce((s, i) => s + valorAtual(D, i), 0));
    const v = (a: number | null, b: number | null) => (a == null || b == null ? null : r2(a - b));
    const linha = { mes, rotulo: `${mes.slice(5)}/${mes.slice(2, 4)}`, item: t.item, iaq: t.iaq, iap: t.iap, valorMod: mod, varItem: v(t.item, ant.item), varIaq: v(t.iaq, ant.iaq), varIap: v(t.iap, ant.iap), varMod: v(mod, ant.mod) };
    ant = { item: t.item, iaq: t.iaq, iap: t.iap, mod };
    return linha;
  });
}

export function opcoesInv(D: DadosInv) {
  return { almox: [...new Set(D.fechamentos.map((f) => f.almoxarifado))].sort(), meses: [...new Set(D.fechamentos.map((f) => f.mes))].sort().reverse() };
}
