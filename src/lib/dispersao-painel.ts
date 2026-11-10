// Painel executivo da Dispersão de Lote (Ficha Técnica × consumo real por OP).
// Separa o que é desvio de PROCESSO (material previsto na ficha) do que é material NÃO PREVISTO (substituição ou
// ficha desatualizada) e mede, por material, o VIÉS (desvio sistemático: a ficha está errada) e a VARIABILIDADE
// (desvio que oscila entre OPs: processo instável ou apontamento trocado entre OPs).
import type { Faixas } from "./dispersao";

export type LinhaDisp = {
  id_op: string | null; mes: string; empresa: string | null;
  material: string; desc_material: string | null; produto: string | null; desc_produto: string | null;
  qtd_previsto: number; qtd_consumo: number; qtd_dif: number; custo: number; impacto: number;
};

const SEM = "sem-data";
const pctDe = (l: LinhaDisp) => (Number(l.qtd_previsto) > 0 ? (Number(l.qtd_dif) / Number(l.qtd_previsto)) * 100 : null);

export function resumo(linhas: LinhaDisp[], f: Faixas) {
  let perda = 0, economia = 0, naoPrevistoRs = 0, naoPrevistoLin = 0, semCusto = 0, dentro = 0, previstas = 0, criticas = 0;
  const ops = new Map<string, boolean>(); // OP -> tem linha crítica
  for (const l of linhas) {
    const p = pctDe(l); const imp = Number(l.impacto) || 0;
    if (!(Number(l.custo) > 0) && Math.abs(Number(l.qtd_dif)) > 0.0001) semCusto++;
    if (p === null) { if (Number(l.qtd_consumo) > 0) { naoPrevistoLin++; naoPrevistoRs += Math.max(0, imp); } }
    else {
      previstas++;
      if (Math.abs(p) <= f.atencao) dentro++;
      if (Math.abs(p) > f.critico) criticas++;
      if (imp > 0) perda += imp; else economia += imp;
    }
    const k = String(l.id_op ?? "");
    ops.set(k, (ops.get(k) ?? false) || (p !== null && Math.abs(p) > f.critico));
  }
  const opsOk = [...ops.values()].filter((c) => !c).length;
  return {
    linhas: linhas.length, ops: ops.size, opsOk, pctOpsOk: ops.size ? opsOk / ops.size : null,
    aderencia: previstas ? dentro / previstas : null, pctCriticas: previstas ? criticas / previstas : null,
    perda, economia, liquido: perda + economia, naoPrevistoRs, naoPrevistoLin, semCusto,
  };
}

export function mensal(linhas: LinhaDisp[], f: Faixas) {
  const m = new Map<string, LinhaDisp[]>();
  for (const l of linhas) if (l.mes && l.mes !== SEM) m.set(l.mes, [...(m.get(l.mes) ?? []), l]);
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([mes, ls]) => {
    const r = resumo(ls, f);
    return { mes, perda: Math.round(r.perda), economia: Math.round(-r.economia), naoPrevisto: Math.round(r.naoPrevistoRs), aderencia: r.aderencia === null ? null : Math.round(r.aderencia * 1000) / 10, ops: r.ops };
  });
}

/** Pareto da perda de processo (material previsto na ficha) por material. */
export function pareto(linhas: LinhaDisp[], top = 15) {
  const m = new Map<string, { material: string; desc: string; perda: number }>();
  for (const l of linhas) {
    if (!(Number(l.qtd_previsto) > 0) || !(Number(l.impacto) > 0)) continue;
    const a = m.get(l.material) ?? { material: l.material, desc: l.desc_material ?? l.material, perda: 0 };
    a.perda += Number(l.impacto); m.set(l.material, a);
  }
  const lista = [...m.values()].sort((a, b) => b.perda - a.perda);
  const total = lista.reduce((s, x) => s + x.perda, 0);
  let acum = 0;
  const itens = lista.slice(0, top).map((x) => { acum += x.perda; return { ...x, acumPct: total ? (acum / total) * 100 : 0 }; });
  const top10 = total ? lista.slice(0, 10).reduce((s, x) => s + x.perda, 0) / total : null;
  return { itens, total, materiais: lista.length, top10 };
}

export type Quadrante = "revisar_ft" | "instavel" | "apontamento" | "controle";
export const QUAD: Record<Quadrante, { nome: string; acao: string; cor: string }> = {
  revisar_ft: { nome: "Revisar ficha técnica", acao: "Desvio sistemático e estável: a quantidade da ficha não representa o consumo real. Ajustar a ficha técnica.", cor: "#2563eb" },
  instavel: { nome: "Processo instável", acao: "Desvio grande e variável entre OPs: perda de processo. Atacar na linha (padronização, treinamento, equipamento).", cor: "#dc2626" },
  apontamento: { nome: "Apontamento / compensação", acao: "Perde numa OP e sobra em outra, com média perto da ficha: apontamento em OP errada ou lote dividido. Corrigir o apontamento.", cor: "#f59e0b" },
  controle: { nome: "Sob controle", acao: "Consumo aderente à ficha.", cor: "#16a34a" },
};

/** Viés (Σdif ÷ Σprevisto) × variabilidade (desvio-padrão do % por OP) por material, com o quadrante de ação. */
export function matriz(linhas: LinhaDisp[], f: Faixas, minOps = 3) {
  const m = new Map<string, { material: string; desc: string; dif: number; prev: number; pcts: number[]; perda: number; economia: number; ops: Set<string> }>();
  for (const l of linhas) {
    const p = pctDe(l); if (p === null) continue;
    const a = m.get(l.material) ?? { material: l.material, desc: l.desc_material ?? l.material, dif: 0, prev: 0, pcts: [], perda: 0, economia: 0, ops: new Set<string>() };
    a.dif += Number(l.qtd_dif); a.prev += Number(l.qtd_previsto); a.pcts.push(Math.max(-200, Math.min(200, p)));
    const imp = Number(l.impacto) || 0; if (imp > 0) a.perda += imp; else a.economia += imp;
    if (l.id_op) a.ops.add(l.id_op); m.set(l.material, a);
  }
  const out = [] as { material: string; desc: string; vies: number; variab: number; perda: number; economia: number; liquido: number; ops: number; quadrante: Quadrante }[];
  for (const a of m.values()) {
    if (a.pcts.length < minOps || a.prev <= 0) continue;
    const media = a.pcts.reduce((s, x) => s + x, 0) / a.pcts.length;
    const dp = Math.sqrt(a.pcts.reduce((s, x) => s + (x - media) ** 2, 0) / (a.pcts.length - 1));
    const vies = (a.dif / a.prev) * 100;
    const sist = Math.abs(vies) > f.atencao, inst = dp > f.critico;
    const quadrante: Quadrante = sist && !inst ? "revisar_ft" : sist && inst ? "instavel" : inst ? "apontamento" : "controle";
    out.push({ material: a.material, desc: a.desc, vies: Math.round(vies * 10) / 10, variab: Math.round(dp * 10) / 10, perda: a.perda, economia: a.economia, liquido: a.perda + a.economia, ops: a.ops.size || a.pcts.length, quadrante });
  }
  return out.sort((a, b) => Math.abs(b.liquido) + b.perda - (Math.abs(a.liquido) + a.perda));
}

export function porUnidade(linhas: LinhaDisp[], f: Faixas) {
  const m = new Map<string, LinhaDisp[]>();
  for (const l of linhas) { const k = l.empresa || "Sem unidade"; m.set(k, [...(m.get(k) ?? []), l]); }
  return [...m].map(([unidade, ls]) => ({ unidade, ...resumo(ls, f) })).sort((a, b) => b.perda - a.perda);
}

/** Material consumido sem estar na ficha (previsto 0): substituição ou ficha desatualizada. */
export function naoPrevistos(linhas: LinhaDisp[]) {
  const m = new Map<string, { material: string; desc: string; consumo: number; rs: number; ops: Set<string>; produtos: Set<string> }>();
  for (const l of linhas) {
    if (Number(l.qtd_previsto) > 0 || !(Number(l.qtd_consumo) > 0)) continue;
    const a = m.get(l.material) ?? { material: l.material, desc: l.desc_material ?? l.material, consumo: 0, rs: 0, ops: new Set<string>(), produtos: new Set<string>() };
    a.consumo += Number(l.qtd_consumo); a.rs += Math.max(0, Number(l.impacto) || 0);
    if (l.id_op) a.ops.add(l.id_op); if (l.produto) a.produtos.add(l.desc_produto || l.produto); m.set(l.material, a);
  }
  return [...m.values()].map((a) => ({ ...a, ops: a.ops.size, produtos: [...a.produtos] })).sort((a, b) => b.rs - a.rs);
}

/** OPs com maior perda de processo. */
export function topOps(linhas: LinhaDisp[], n = 10) {
  const m = new Map<string, { op: string; produto: string; perda: number; economia: number; linhas: number; mes: string }>();
  for (const l of linhas) {
    if (!(Number(l.qtd_previsto) > 0)) continue;
    const k = String(l.id_op ?? ""); const a = m.get(k) ?? { op: k, produto: l.desc_produto || l.produto || "", perda: 0, economia: 0, linhas: 0, mes: l.mes };
    const imp = Number(l.impacto) || 0; if (imp > 0) a.perda += imp; else a.economia += imp; a.linhas++; m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.perda - a.perda).slice(0, n);
}

/** Produtos acabados (descrição) em que cada material foi apontado. */
export function produtosPorMaterial(linhas: LinhaDisp[]) {
  const m = new Map<string, Set<string>>();
  for (const l of linhas) {
    const p = l.desc_produto || l.produto; if (!p) continue;
    const s = m.get(l.material) ?? new Set<string>(); s.add(p); m.set(l.material, s);
  }
  return m;
}

/** Linhas com desvio e sem custo cadastrado, agregadas por material. */
export function semCustoPorMaterial(linhas: LinhaDisp[]) {
  const m = new Map<string, { material: string; desc: string; linhas: number; dif: number; ops: Set<string> }>();
  for (const l of linhas) {
    if (Number(l.custo) > 0 || !(Math.abs(Number(l.qtd_dif)) > 0.0001)) continue;
    const a = m.get(l.material) ?? { material: l.material, desc: l.desc_material ?? l.material, linhas: 0, dif: 0, ops: new Set<string>() };
    a.linhas++; a.dif += Number(l.qtd_dif); if (l.id_op) a.ops.add(l.id_op); m.set(l.material, a);
  }
  return [...m.values()].map((a) => ({ ...a, ops: a.ops.size })).sort((a, b) => b.linhas - a.linhas);
}

export type DecisaoColuna = { t: string; direita?: boolean };
export type DecisaoLinha = { material: string; desc: string; valores: string[]; tons?: (string | undefined)[]; produtos: string[] };
export type Decisao = { p: "alta" | "media" | "baixa"; t: string; d: string; colunas: DecisaoColuna[]; linhas: DecisaoLinha[] };

const brlD = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pcD = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const sinal = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Decisões recomendadas com a lista completa de produtos (materiais) analisados em cada uma. */
export function decisoes(linhas: LinhaDisp[], f: Faixas): Decisao[] {
  const r = resumo(linhas, f); const mat = matriz(linhas, f); const np = naoPrevistos(linhas); const par = pareto(linhas, Number.MAX_SAFE_INTEGER);
  const prods = produtosPorMaterial(linhas); const pr = (m: string) => [...(prods.get(m) ?? [])];
  const colMatriz: DecisaoColuna[] = [{ t: "OPs", direita: true }, { t: "Viés", direita: true }, { t: "Variab.", direita: true }, { t: "Perda", direita: true }, { t: "Economia", direita: true }, { t: "Líquido", direita: true }];
  const linMatriz = (x: ReturnType<typeof matriz>[number]): DecisaoLinha => ({ material: x.material, desc: x.desc, produtos: pr(x.material),
    valores: [String(x.ops), sinal(x.vies), `${x.variab.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, brlD(x.perda), brlD(0 - x.economia), brlD(x.liquido)],
    tons: [undefined, undefined, undefined, "text-red-600", "text-emerald-700", "font-semibold"] });
  const a: Decisao[] = [];
  const inst = mat.filter((x) => x.quadrante === "instavel").sort((x, y) => y.perda - x.perda);
  if (inst.length) a.push({ p: "alta", t: `Atacar a perda de processo em ${inst.length} material(is) instável(is)`, d: inst.slice(0, 4).map((x) => `${x.desc} (${brlD(x.perda)}, viés ${x.vies > 0 ? "+" : ""}${x.vies}%)`).join("; ") + ".", colunas: colMatriz, linhas: inst.map(linMatriz) });
  if (np.length) a.push({ p: "alta", t: `Atualizar a ficha técnica: ${np.length} material(is) consumido(s) sem estar previsto(s)`, d: `${brlD(r.naoPrevistoRs)} lançados como perda são, na prática, substituição ou ficha desatualizada. Maiores: ${np.slice(0, 3).map((x) => `${x.desc} (${brlD(x.rs)})`).join("; ")}.`,
    colunas: [{ t: "OPs", direita: true }, { t: "Consumo", direita: true }, { t: "Valor", direita: true }],
    linhas: np.map((x) => ({ material: x.material, desc: x.desc, produtos: x.produtos, valores: [String(x.ops), x.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 2 }), brlD(x.rs)], tons: [undefined, undefined, "text-violet-600"] })) });
  const ft = mat.filter((x) => x.quadrante === "revisar_ft").sort((x, y) => Math.abs(y.liquido) - Math.abs(x.liquido));
  if (ft.length) a.push({ p: "media", t: `Revisar a quantidade da ficha técnica de ${ft.length} material(is) com desvio sistemático`, d: ft.slice(0, 4).map((x) => `${x.desc} (${x.vies > 0 ? "consome" : "sobra"} ${Math.abs(x.vies)}% ${x.vies > 0 ? "acima" : "da ficha"})`).join("; ") + ".", colunas: colMatriz, linhas: ft.map(linMatriz) });
  const ap = mat.filter((x) => x.quadrante === "apontamento").sort((x, y) => (y.perda - y.economia) - (x.perda - x.economia));
  if (ap.length) a.push({ p: "media", t: `Corrigir apontamentos em ${ap.length} material(is) que perdem numa OP e sobram em outra`, d: ap.slice(0, 4).map((x) => `${x.desc} (perda ${brlD(x.perda)} × sobra ${brlD(0 - x.economia)})`).join("; ") + ".", colunas: colMatriz, linhas: ap.map(linMatriz) });
  if (r.semCusto) {
    const sc = semCustoPorMaterial(linhas);
    a.push({ p: "baixa", t: `${r.semCusto} linha(s) com desvio e sem custo cadastrado`, d: "O impacto dessas linhas aparece como R$ 0. Cadastrar o custo no mestre de custos para medir a perda real.",
      colunas: [{ t: "Linhas", direita: true }, { t: "OPs", direita: true }, { t: "Diferença (qtd)", direita: true }],
      linhas: sc.map((x) => ({ material: x.material, desc: x.desc, produtos: pr(x.material), valores: [String(x.linhas), String(x.ops), x.dif.toLocaleString("pt-BR", { maximumFractionDigits: 2 })], tons: [undefined, undefined, x.dif > 0 ? "text-red-600" : "text-emerald-700"] })) });
  }
  if (par.top10 !== null && par.top10 > 0.5) {
    const top = par.itens.slice(0, 10);
    a.push({ p: "baixa", t: `Concentração: 10 materiais respondem por ${pcD(par.top10)} da perda de processo`, d: "Foco do plano de ação nesses materiais traz o maior retorno.",
      colunas: [{ t: "Perda", direita: true }, { t: "% da perda", direita: true }, { t: "% acumulado", direita: true }],
      linhas: top.map((x) => ({ material: x.material, desc: x.desc, produtos: pr(x.material), valores: [brlD(x.perda), pcD(par.total ? x.perda / par.total : 0), `${Math.round(x.acumPct)}%`], tons: ["text-red-600", undefined, undefined] })) });
  }
  return a;
}
