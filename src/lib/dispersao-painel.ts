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
