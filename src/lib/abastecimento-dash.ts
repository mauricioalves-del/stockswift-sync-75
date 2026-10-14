// Dashboard de Disponibilidade (Out of Stock · Stockout · Stock Over): posição de hoje, projeção com trânsito e farol de ruptura futura.
import { montarItens, nk, destinoNota, type Bruto } from "./abastecimento-dados";
import { resolverParam } from "./abastecimento-cobertura";
import { somaDias, diasEntre } from "./abastecimento-dash-hist";

export const DIA_ENTREGA = 3;            // quarta-feira (0 = domingo): o CD entrega sempre na quarta
export const HORIZONTE_FAROL = 15;       // dias olhados à frente
export type StatusDash = "ruptura" | "stockout" | "ok" | "stockover";
export type Cluster = "ruptura" | "critico" | "urgente" | "alerta" | "atencao" | "monitorar" | "ok";
export type Reposicao = "enderecado" | "tarde" | "sem_pedido" | "fora";
export type Entrada = { data: string; qtd: number; origem: "pedido" | "nota" };

export const CLUSTERS: { k: Cluster; rotulo: string; faixa: string; cor: string }[] = [
  { k: "ruptura", rotulo: "Ruptura", faixa: "já zerado", cor: "#7f1d1d" },
  { k: "critico", rotulo: "Crítico", faixa: "≤ 3 d", cor: "#dc2626" },
  { k: "urgente", rotulo: "Urgente", faixa: "4–5 d", cor: "#ef6c57" },
  { k: "alerta", rotulo: "Alerta", faixa: "6–7 d", cor: "#f97316" },
  { k: "atencao", rotulo: "Atenção", faixa: "8–10 d", cor: "#eab308" },
  { k: "monitorar", rotulo: "Monitorar", faixa: "11–15 d", cor: "#3b82f6" },
  { k: "ok", rotulo: "OK", faixa: "> 15 d", cor: "#16a34a" },
];

export type DashLinha = {
  local: string; sku: string; produto: string; categoria: string; familia: string;
  estoque: number; exposicao: number; minimo: number | null; maximo: number | null; vbm: number; cobertura: number | null;
  custo: number | null; excessoUn: number; excessoRs: number; status: StatusDash;
  emTransito: number; emTransitoRs: number; chegaEm: string | null; entradas: Entrada[];
  zeraEm: string | null; diasAteZerar: number | null; zeraSemTransito: string | null; cluster: Cluster;
  reposicao: Reposicao; diasSemEstoque: number; semAcao: boolean; alerta: boolean; sugestao: number;
};

/** Próxima entrega do CD: a primeira quarta-feira estritamente depois de hoje. */
export function proximaEntrega(hoje: string): string {
  const dow = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))).getUTCDay();
  let n = (DIA_ENTREGA - dow + 7) % 7; if (n === 0) n = 7; return somaDias(hoje, n);
}
/** Out of Stock: estoque físico 0 · Stockout: 0 < estoque < mínimo · Stock Over: estoque > máximo. */
export function statusDe(estoque: number, minimo: number | null, maximo: number | null): StatusDash {
  if (estoque <= 0) return "ruptura";
  if (minimo !== null && estoque < minimo) return "stockout";
  if (maximo !== null && estoque > maximo) return "stockover";
  return "ok";
}
export function clusterDe(dias: number | null, ruptura: boolean): Cluster {
  if (ruptura || dias === 0) return "ruptura";
  if (dias === null || dias > 15) return "ok";
  return dias <= 3 ? "critico" : dias <= 5 ? "urgente" : dias <= 7 ? "alerta" : dias <= 10 ? "atencao" : "monitorar";
}
/** Estoque projetado no INÍCIO do dia `dia`: estoque + entradas até o dia − venda/dia × dias decorridos. */
export function estoqueNoDia(estoque: number, vbm: number, entradas: Entrada[], hoje: string, dia: string): number {
  const k = Math.max(0, diasEntre(hoje, dia)); const ent = entradas.filter((e) => e.data <= dia).reduce((a, e) => a + e.qtd, 0);
  return Math.max(0, estoque + ent - vbm * k);
}
/** Data em que o estoque projetado (início do dia) fica abaixo de 1 unidade. null = além do horizonte (ou sem venda). */
export function projetar(estoque: number, vbm: number, entradas: Entrada[], hoje: string, horizonte = HORIZONTE_FAROL): { zeraEm: string | null; dias: number | null } {
  for (let k = 0; k <= horizonte; k++) {
    const dia = somaDias(hoje, k); const s = estoque + entradas.filter((e) => e.data <= dia).reduce((a, e) => a + e.qtd, 0) - vbm * k;
    if (s < 1) return { zeraEm: dia, dias: k };
    if (vbm <= 0) break;
  }
  return { zeraEm: null, dias: null };
}

/** Entradas por loja|sku: pedidos (aberto/separação/separado chegam na próxima quarta; enviado chega amanhã) e notas de transferência pendentes (D+1 da emissão). */
export function construirEntradas(b: Bruto, hoje: string): Map<string, Entrada[]> {
  const m = new Map<string, Entrada[]>(); const add = (k: string, e: Entrada) => { if (e.qtd > 0) (m.get(k) ?? m.set(k, []).get(k)!).push(e); };
  for (const p of b.pedidosAbertos) {
    const data = p.status === "ENVIADO" ? somaDias(hoje, 1) : proximaEntrega(hoje);
    const qtd = p.status === "SEPARADO" || p.status === "EM_SEPARACAO" || p.status === "ABERTO" || p.status === "ENVIADO" ? Number(p.qtd) || 0 : 0;
    add(`${p.loja}|${nk(p.id_produto)}`, { data, qtd, origem: "pedido" });
  }
  for (const n of b.notas) {
    const d = destinoNota(String(n.almox ?? "")); if (!d || d === "CD") continue;
    const prev = n.dt ? somaDias(String(n.dt), 1) : somaDias(hoje, 1); const data = prev < hoje ? hoje : prev;
    add(`${d}|${nk(n.cod_prod)}`, { data, qtd: Number(n.qtd) || 0, origem: "nota" });
  }
  for (const v of m.values()) v.sort((a, b) => a.data.localeCompare(b.data));
  return m;
}

function situacao(estoque: number, vbm: number, entradas: Entrada[], hoje: string): { rep: Reposicao; diasSem: number; zeraSem: string | null } {
  const zeraSem = projetar(estoque, vbm, [], hoje).zeraEm; const prim = entradas[0]?.data ?? null;
  if (estoque <= 0) { if (!prim) return { rep: "sem_pedido", diasSem: 0, zeraSem: hoje }; return diasEntre(hoje, prim) <= 7 ? { rep: "enderecado", diasSem: diasEntre(hoje, prim), zeraSem: hoje } : { rep: "tarde", diasSem: diasEntre(hoje, prim), zeraSem: hoje }; }
  if (!zeraSem) return { rep: "fora", diasSem: 0, zeraSem: null };
  if (!prim) return { rep: "sem_pedido", diasSem: 0, zeraSem };
  return prim <= zeraSem ? { rep: "enderecado", diasSem: 0, zeraSem } : { rep: "tarde", diasSem: diasEntre(zeraSem, prim), zeraSem };
}

export function montarDash(b: Bruto, hoje: string): DashLinha[] {
  const m = montarItens(b, { base: "real", denominador: "calendario", hojeIso: hoje, universo: "sortimento" });
  const entradasDe = construirEntradas(b, hoje); const linhas: DashLinha[] = [];
  for (const l of b.lojas) for (const it of m.itens[l.codigo] ?? []) {
    const est = Math.max(0, it.estoque ?? 0), vbm = it.demandaDia ?? 0, expo = it.exposicao ?? 0, ent = entradasDe.get(`${l.codigo}|${nk(it.sku)}`) ?? [];
    linhas.push(montarLinha(l.codigo, it.sku, it.descricao, it.grupo, it.familia, est, expo, it.minQ, it.maxQ, vbm, it.custo, ent, it.sugestao, hoje));
  }
  // Almox SP (CD): abastece as lojas e não vende direto. Demanda = soma das lojas; mínimo/máximo com a cobertura própria do CD (regra "CD" em Cobertura e parâmetros).
  const por = new Map<string, { sku: string; desc: string; grupo: string; fam: string; est: number; custo: number | null; vbm: number }>();
  for (const l of b.lojas) for (const it of m.itens[l.codigo] ?? []) {
    const o = por.get(nk(it.sku)) ?? { sku: it.sku, desc: it.descricao, grupo: it.grupo, fam: it.familia, est: Math.max(0, it.cdBruto), custo: it.custo, vbm: 0 }; o.vbm += it.demandaDia ?? 0; por.set(nk(it.sku), o);
  }
  for (const o of por.values()) {
    const p = resolverParam(b.params, b.coberturas ?? [], "CD", o.fam).p;
    const min = Math.ceil(o.vbm * p.diasMin), max = Math.ceil(o.vbm * p.diasMax + o.vbm * p.diasSeguranca), ideal = Math.ceil(o.vbm * p.diasIdeal + o.vbm * p.diasSeguranca);
    linhas.push(montarLinha("CD", o.sku, o.desc, o.grupo, o.fam, o.est, 0, o.vbm > 0 ? min : null, o.vbm > 0 ? max : null, o.vbm, o.custo, [], Math.max(0, ideal - o.est), hoje));
  }
  return linhas;
}

function montarLinha(local: string, sku: string, produto: string, categoria: string, familia: string, est: number, expo: number, min: number | null, max: number | null, vbm: number, custo: number | null, ent: Entrada[], sugestao: number, hoje: string): DashLinha {
  const status = statusDe(est, min, max);
  const exUn = max !== null && est > max ? est - max : 0;
  const com = projetar(est, vbm, ent, hoje); const sit = situacao(est, vbm, ent, hoje);
  const cluster = clusterDe(com.dias, est <= 0);
  const emTr = ent.reduce((a, e) => a + e.qtd, 0);
  const semAcao = cluster !== "ok" && sit.rep !== "enderecado";
  return {
    local, sku, produto, categoria, familia, estoque: est, exposicao: expo, minimo: min, maximo: max, vbm,
    cobertura: vbm > 0 ? Math.max(0, est - expo) / vbm : null, custo, excessoUn: exUn, excessoRs: custo ? exUn * custo : 0, status,
    emTransito: emTr, emTransitoRs: custo ? emTr * custo : 0, chegaEm: ent[0]?.data ?? null, entradas: ent,
    zeraEm: com.zeraEm, diasAteZerar: com.dias, zeraSemTransito: sit.zeraSem, cluster, reposicao: sit.rep, diasSemEstoque: sit.diasSem, semAcao,
    alerta: ["ruptura", "critico", "urgente"].includes(cluster) && (sit.rep === "sem_pedido" || sit.rep === "tarde"), sugestao,
  };
}

export type ResumoLocal = { skus: number; ruptura: number; stockout: number; stockover: number; ok: number; excessoRs: number; emTransitoUn: number; emTransitoRs: number; coberturaMedia: number | null; semAcao: number; alertas: number };
export function resumirLocal(ls: DashLinha[]): ResumoLocal {
  const cnt = (s: StatusDash) => ls.filter((l) => l.status === s).length;
  const comVenda = ls.filter((l) => l.vbm > 0), vb = comVenda.reduce((a, l) => a + l.vbm, 0), liq = comVenda.reduce((a, l) => a + Math.max(0, l.estoque - l.exposicao), 0);
  return { skus: ls.length, ruptura: cnt("ruptura"), stockout: cnt("stockout"), stockover: cnt("stockover"), ok: cnt("ok"), excessoRs: ls.reduce((a, l) => a + l.excessoRs, 0),
    emTransitoUn: ls.reduce((a, l) => a + l.emTransito, 0), emTransitoRs: ls.reduce((a, l) => a + l.emTransitoRs, 0), coberturaMedia: vb > 0 ? liq / vb : null,
    semAcao: ls.filter((l) => l.semAcao).length, alertas: ls.filter((l) => l.alerta).length };
}
/** Risco endereçado: dos SKUs já zerados ou que zeram (sem trânsito) em até 7 dias, quantos já têm reposição chegando a tempo. */
export function riscoEnderecado(ls: DashLinha[], hoje: string): { total: number; enderecados: number } {
  const pop = ls.filter((l) => l.estoque <= 0 || (l.zeraSemTransito !== null && diasEntre(hoje, l.zeraSemTransito) <= 7));
  return { total: pop.length, enderecados: pop.filter((l) => l.reposicao === "enderecado").length };
}
