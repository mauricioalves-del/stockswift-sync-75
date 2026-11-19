// Pilar Controle Logístico: leitura da planilha de fechamento de fretes (envios por modal, trechos do PJ e
// transferências LATAM Pará ↔ SP), classificação por natureza (venda, compra, interno) e indicadores do mês.
import * as XLSX from "xlsx";

export type Natureza = "venda" | "compra" | "interno";
export type Envio = { data: string; pedido: string | null; valor_pedido: number | null; cliente: string | null; operacao: string | null; cc: string | null; natureza: Natureza; modal: string | null; km: number | null; fora_sp: boolean | null; uf: string | null; origem_destino: string | null; kg: number | null; frete: number; isopor: number; gelox: number; seguro: number; cobrado: number; observacao: string | null; fonte: string; chave: string };
export type TrechoPJ = { prestador: string; data: string; saida: string | null; destino: string | null; operacao: string | null; cc: string | null; km: number | null; valor: number; fonte: string; chave: string };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const txt = (v: unknown) => { const s = String(v ?? "").trim(); return !s || /^[-'*_]+$/.test(s) ? null : s; };
export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/g, ""); if (!s || /^[-'*_]+$/.test(s)) return null;
  // planilha em formato americano (1,425.00) ou brasileiro (1.425,00)
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, "");
  const n = Number(s); return isFinite(n) ? n : null;
};
export const data = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v).trim()); // m/d/aaaa, como nas planilhas de frete
  return us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
};

/** Total resumido para rótulos de gráfico: 6000 → "6k", 7500 → "7,5k", 850 → "850". */
export function moedaResumo(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (a >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return Math.round(v).toLocaleString("pt-BR");
}

/** Natureza do frete (Exploratório Fretes): interno = remessas entre unidades/lojas/boxes e Pará ↔ SP; compra = suprimentos; venda = o resto (pedidos, cortesias, amostras). */
export function natureza(operacao: string | null, cc: string | null, cliente: string | null): Natureza {
  const o = sem(`${operacao ?? ""} ${cliente ?? ""}`), c = sem(cc);
  if (/LATAM|TRANSF|BOX|ABASTEC|PATIO|ELDORADO|OPERACOES|DEV LOJA|DEVOLUCAO DE PRODUTOS|ESTRUT ATIVACAO|ATIVACAO/.test(o) && !/^VENDA|CORTESIA/.test(sem(operacao))) return "interno";
  if (/SUPRIMENTO|RETIRADA|COMPRA(?!.*LOJA)|COLETA|FORNECEDOR/.test(o) && !/COMPRA LOJA/.test(o)) return "compra";
  if (c === "OPERACAO" && !/VENDA|CORTESIA|AMOSTRA/.test(o)) return "interno";
  return "venda";
}
const chaveEnvio = (e: { data: string; pedido: string | null; cliente: string | null; modal: string | null; frete: number; kg: number | null; operacao: string | null; observacao: string | null }) =>
  [e.data, sem(e.pedido), sem(e.cliente), sem(e.modal), e.frete.toFixed(2), e.kg ?? "", sem(e.operacao), sem(e.observacao)].join("|");

function linhas(ws: XLSX.WorkSheet, obrig: string[]) {
  const m = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const i = m.slice(0, 6).findIndex((l) => { const s = new Set((l ?? []).map(sem)); return obrig.every((c) => s.has(sem(c))); });
  if (i < 0) return null;
  const cab = (m[i] ?? []).map(sem);
  return m.slice(i + 1).filter((l) => l && l.some((c) => c != null && c !== "")).map((l) => { const o: Record<string, unknown> = {}; cab.forEach((c, j) => { if (c && !(c in o)) o[c] = l[j]; }); return o; });
}
const g = (o: Record<string, unknown>, ...k: string[]) => { for (const x of k) { const v = o[sem(x)]; if (v != null && v !== "") return v; } return null; };

export function lerPlanilhaFretes(buf: ArrayBuffer, arquivo: string) {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const envios = new Map<string, Envio>(), trechos = new Map<string, TrechoPJ>(), abas: { aba: string; tipo: string; linhas: number }[] = [];
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    // 1) LATAM / transferências Pará ↔ SP
    const lat = linhas(ws, ["Kilograma", "Custo do Frete (R$)"]);
    if (lat) { let n = 0; for (const r of lat) { const d = data(g(r, "Data")); const frete = num(g(r, "Custo do Frete (R$)")) ?? 0; if (!d || !frete) continue;
      const e: Omit<Envio, "chave"> = { data: d, pedido: txt(g(r, "Número do Pedido/cupom/NF")), valor_pedido: num(g(r, "Valor do Pedido")), cliente: txt(g(r, "Cliente")), operacao: txt(g(r, "Operação")), cc: txt(g(r, "CC")), natureza: "interno", modal: txt(g(r, "Modo de envio")), km: null, fora_sp: /SIM/.test(sem(g(r, "Fora SP Capital"))), uf: txt(g(r, "Estado")), origem_destino: txt(g(r, "Origem / Destino")), kg: num(g(r, "Kilograma")), frete, isopor: num(g(r, "Isopor (R$)")) ?? 0, gelox: num(g(r, "Gelox (R$)")) ?? 0, seguro: num(g(r, "Seguro")) ?? 0, cobrado: num(g(r, "Valor Cobrado do Cliente (R$)")) ?? 0, observacao: txt(g(r, "Observações")), fonte: `${arquivo} › ${nome}` };
      // duplicidade = mesma data, operação, modal, kg e frete (independe de isopor/gelox)
      const k = ["LATAM", e.data, sem(e.operacao), sem(e.modal), e.kg ?? "", e.frete.toFixed(2)].join("|"); if (!envios.has(k)) { envios.set(k, { ...e, chave: k }); n++; } }
      abas.push({ aba: nome, tipo: "Transferências Pará ↔ SP", linhas: n }); continue; }
    // 2) Trechos do PJ (relatório de quilometragem)
    const pj = linhas(ws, ["Saída", "Destino", "KMs"]);
    if (pj) { let n = 0; for (const r of pj) { const d = data(g(r, "Data")); const valor = num(g(r, "Valor (R$)", "vValorA")); if (!d || valor == null) continue;
      const t = { prestador: "Nelson", data: d, saida: txt(g(r, "Saída")), destino: txt(g(r, "Destino")), operacao: txt(g(r, "Operação")), cc: txt(g(r, "CC")), km: num(g(r, "KMs")), valor, fonte: `${arquivo} › ${nome}` };
      const k = ["PJ", t.data, sem(t.saida), sem(t.destino), t.valor.toFixed(2)].join("|"); if (!trechos.has(k)) { trechos.set(k, { ...t, chave: k }); n++; } }
      abas.push({ aba: nome, tipo: "Trechos do PJ", linhas: n }); continue; }
    // 3) Envios por modal (Lalamove, Melhor Envios, Nelson, prestadores, Correios, Uber)
    const env = linhas(ws, ["Modo de envio", "Custo do Frete (R$)"]);
    if (env) { let n = 0; for (const r of env) { const d = data(g(r, "Data de entrega", "Data de POSTAGEM / ENTREGA", "Data")); const frete = num(g(r, "Custo do Frete (R$)")) ?? 0; const modal = txt(g(r, "Modo de envio")); if (!d || !modal) continue;
      const operacao = txt(g(r, "Operação")), cc = txt(g(r, "CC")), cliente = txt(g(r, "Cliente"));
      const e: Omit<Envio, "chave"> = { data: d, pedido: txt(g(r, "Número do Pedido/cupom/NF", "Número do Pedido")), valor_pedido: num(g(r, "Valor do Pedido")), cliente, operacao, cc, natureza: natureza(operacao, cc, cliente), modal, km: num(g(r, "KM")), fora_sp: g(r, "Fora SP Capital") == null ? null : /SIM/.test(sem(g(r, "Fora SP Capital"))), uf: txt(g(r, "Estado")), origem_destino: null, kg: null, frete, isopor: num(g(r, "Isopor (R$)")) ?? 0, gelox: num(g(r, "Gelox (R$)")) ?? 0, seguro: 0, cobrado: num(g(r, "Valor Cobrado do Cliente (R$)")) ?? 0, observacao: txt(g(r, "Observações")), fonte: `${arquivo} › ${nome}` };
      if (!e.frete && !e.isopor && !e.gelox) continue;
      const k = chaveEnvio(e); if (!envios.has(k)) { envios.set(k, { ...e, chave: k }); n++; } }
      abas.push({ aba: nome, tipo: "Envios por modal", linhas: n }); }
  }
  return { envios: [...envios.values()], trechos: [...trechos.values()], abas };
}

export type FixoPJ = { prestador: string; mes: string; valor: number; rateio: Record<string, number> };
/** Indicadores do pilar por mês. */
/** Indicadores do período [de, ate] (datas AAAA-MM-DD); os custos fixos entram pelos meses do período. */
export function indicadoresLogistica(envios: Envio[], trechos: TrechoPJ[], fixos: FixoPJ[], de: string, ate: string = `${de.slice(0, 7)}-31`) {
  if (de.length === 7) de = `${de}-01`;
  const dentro = (d: string) => d >= de && d <= ate;
  const e = envios.filter((x) => dentro(x.data)), t = trechos.filter((x) => dentro(x.data)), f = fixos.filter((x) => x.mes >= de.slice(0, 7) && x.mes <= ate.slice(0, 7));
  const soma = <T,>(l: T[], fn: (x: T) => number) => l.reduce((a, x) => a + (fn(x) || 0), 0);
  const totalEnvio = (x: Envio) => x.frete + x.isopor + x.gelox + x.seguro;
  const kmPJ = soma(t, (x) => x.valor), fixoPJ = soma(f, (x) => x.valor), envTot = soma(e, totalEnvio);
  const por = <K extends string>(fn: (x: Envio) => K) => { const m = new Map<K, { qtd: number; valor: number }>(); for (const x of e) { const k = fn(x), a = m.get(k) ?? { qtd: 0, valor: 0 }; a.qtd++; a.valor += totalEnvio(x); m.set(k, a); } return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.valor - a.valor); };
  const ult = e.filter((x) => x.natureza === "venda" && !/LATAM|AEREO/.test(sem(x.modal)));
  const transf = e.filter((x) => x.kg);
  const pjPorArea = new Map<string, number>(); for (const x of t) pjPorArea.set(x.cc || "—", (pjPorArea.get(x.cc || "—") ?? 0) + x.valor);
  const residencia = t.filter((x) => /RESIDENCIA/.test(sem(x.saida)) || /RESIDENCIA/.test(sem(x.destino)));
  return {
    total: envTot + kmPJ + fixoPJ, envios: envTot, kmPJ, fixoPJ, qtdEnvios: e.length,
    porNatureza: por((x) => x.natureza), porModal: por((x) => (x.modal ?? "—").toUpperCase()), porCC: por((x) => x.cc ?? "—"),
    custoMedioEntrega: ult.length ? soma(ult, totalEnvio) / ult.length : null,
    cortesias: e.filter((x) => /CORTESIA/.test(sem(x.operacao)) || /CORTESIA/.test(sem(x.cliente))).length,
    // resultado do frete só sobre o frete de venda: remessas internas e compras nunca são cobradas de cliente
    freteCobrado: soma(e.filter((x) => x.natureza === "venda"), (x) => x.cobrado), prejuizo: soma(e.filter((x) => x.natureza === "venda"), (x) => x.cobrado - totalEnvio(x)),
    transf: { qtd: transf.length, kg: soma(transf, (x) => x.kg ?? 0), valor: soma(transf, totalEnvio), porKg: soma(transf, (x) => x.kg ?? 0) ? soma(transf, totalEnvio) / soma(transf, (x) => x.kg ?? 0) : null },
    pj: { km: soma(t, (x) => x.km ?? 0), valorKm: kmPJ, fixo: fixoPJ, porArea: [...pjPorArea.entries()].map(([k, v]) => ({ k, valor: v })).sort((a, b) => b.valor - a.valor), residencia: soma(residencia, (x) => x.valor), trechosResidencia: residencia.length },
  };
}
