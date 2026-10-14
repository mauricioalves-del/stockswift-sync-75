// Dashboard de Disponibilidade — meta de ruptura, color code e histórico (foto diária).
export const META_RUPTURA = 0.03;      // ruptura ≤ 3,0%
export const CORTE_RUPTURA = 0.05;     // acima disso o atingimento é 0%
export type Farol = "verde" | "amarelo" | "laranja" | "vermelho";

/** Atingimento da meta: 100% até 3,0%; 75% em 4,0%; 50% em 5,0%; 0% acima de 5,0%; interpolação linear (sem over performance). */
export function atingimento(r: number): number {
  if (r <= 0.03) return 1;
  if (r <= 0.04) return 1 - (r - 0.03) / 0.01 * 0.25;
  if (r <= 0.05) return 0.75 - (r - 0.04) / 0.01 * 0.25;
  return 0;
}
export function farolRuptura(r: number): Farol { return r <= 0.03 ? "verde" : r <= 0.04 ? "amarelo" : r <= 0.05 ? "laranja" : "vermelho"; }

export type HistLinha = { data: string; loja: string; id_produto: string; categoria: string | null; descricao: string | null; em_ruptura: boolean };
export type FiltroHist = { de: string; ate: string; locais: string[] | null; categoria: string | null };

const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86400000);
export const somaDias = (d: string, n: number) => iso(ms(d) + n * 86400000);
/** Dias do período já transcorridos (até hoje). */
export function diasDoPeriodo(de: string, ate: string, hoje: string): string[] {
  const fim = ate < hoje ? ate : hoje; const out: string[] = [];
  for (let d = de; d <= fim; d = somaDias(d, 1)) out.push(d);
  return out;
}

export function filtrarHist(rows: HistLinha[], f: FiltroHist): HistLinha[] {
  return rows.filter((r) => r.data >= f.de && r.data <= f.ate && (!f.locais || f.locais.includes(r.loja)) && (!f.categoria || r.categoria === f.categoria));
}

export type ResumoPeriodo = { diasPeriodo: number; diasComRegistro: string[]; diasSemRegistro: string[]; itemDias: number; rupturaItemDias: number; ruptura: number | null; parcial: boolean };
/** Ruptura acumulada do período = Σ item-dias em ruptura ÷ Σ item-dias com saldo válido. */
export function resumoPeriodo(rows: HistLinha[], f: FiltroHist, hoje: string): ResumoPeriodo {
  const dias = diasDoPeriodo(f.de, f.ate, hoje); const sel = filtrarHist(rows, f);
  const com = new Set(sel.map((r) => r.data)); const diasCom = dias.filter((d) => com.has(d));
  const rupt = sel.filter((r) => r.em_ruptura).length;
  return { diasPeriodo: dias.length, diasComRegistro: diasCom, diasSemRegistro: dias.filter((d) => !com.has(d)), itemDias: sel.length, rupturaItemDias: rupt, ruptura: sel.length ? rupt / sel.length : null, parcial: diasCom.length < dias.length };
}

export type PontoSerie = { chave: string; rotulo: string; pct: number | null; itemDias: number; rupturas: number; acumulado: number | null; parcial: boolean; diasRegistrados: number; diasNoGrupo: number };
export type Agrupamento = "dia" | "semana" | "mes";
function chaveDe(d: string, ag: Agrupamento): string {
  if (ag === "dia") return d;
  if (ag === "mes") return d.slice(0, 7);
  const t = ms(d), dow = (new Date(t).getUTCDay() + 6) % 7;     // segunda = 0
  return iso(t - dow * 86400000);
}
/** Série do gráfico: % do ponto + % acumulado do período inteiro (do "De" até o ponto). */
export function serie(rows: HistLinha[], f: FiltroHist, hoje: string, ag: Agrupamento): PontoSerie[] {
  const dias = diasDoPeriodo(f.de, f.ate, hoje); const sel = filtrarHist(rows, f);
  const porDia = new Map<string, { n: number; r: number }>();
  for (const l of sel) { const o = porDia.get(l.data) ?? { n: 0, r: 0 }; o.n++; if (l.em_ruptura) o.r++; porDia.set(l.data, o); }
  const grupos = new Map<string, string[]>(); for (const d of dias) { const k = chaveDe(d, ag); (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(d); }
  let acN = 0, acR = 0;
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, ds]) => {
    let n = 0, r = 0, reg = 0; for (const d of ds) { const o = porDia.get(d); if (o) { n += o.n; r += o.r; reg++; } }
    acN += n; acR += r;
    const rotulo = ag === "dia" ? k.slice(8) : ag === "mes" ? k.slice(5) + "/" + k.slice(2, 4) : k.slice(8) + "/" + k.slice(5, 7);
    return { chave: k, rotulo, pct: n ? r / n : null, itemDias: n, rupturas: r, acumulado: acN ? acR / acN : null, parcial: reg < ds.length, diasRegistrados: reg, diasNoGrupo: ds.length };
  });
}

export type TopItem = { local: string; id_produto: string; produto: string; dias: number };
export function topDiasRuptura(rows: HistLinha[], f: FiltroHist, n = 10): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const l of filtrarHist(rows, f)) if (l.em_ruptura) { const k = l.loja + "|" + l.id_produto; const o = m.get(k) ?? { local: l.loja, id_produto: l.id_produto, produto: l.descricao ?? l.id_produto, dias: 0 }; o.dias++; m.set(k, o); }
  return [...m.values()].sort((a, b) => b.dias - a.dias || a.produto.localeCompare(b.produto, "pt-BR")).slice(0, n);
}

export type RupturaLocal = { local: string; itemDias: number; rupturaItemDias: number; ruptura: number | null };
export function rupturaPorLocal(rows: HistLinha[], f: FiltroHist): RupturaLocal[] {
  const m = new Map<string, RupturaLocal>();
  for (const l of filtrarHist(rows, { ...f, locais: null })) { const o = m.get(l.loja) ?? { local: l.loja, itemDias: 0, rupturaItemDias: 0, ruptura: null }; o.itemDias++; if (l.em_ruptura) o.rupturaItemDias++; m.set(l.loja, o); }
  return [...m.values()].map((o) => ({ ...o, ruptura: o.itemDias ? o.rupturaItemDias / o.itemDias : null }));
}
