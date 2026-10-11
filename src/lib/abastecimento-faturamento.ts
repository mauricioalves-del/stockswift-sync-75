// Carga de faturamento (vendas) -> consumo diário por loja e SKU.
//
// Lê a planilha de faturamento (layout "BASE VENDAS": dt_emissao, CodProd, qtd, Natureza, Nota_Cancelada, Grupo, Empresa, Vendedor...)
// e devolve unidades por (loja, SKU, dia). Dados de cliente (nome, CPF/CNPJ) NUNCA saem do navegador.
//
// Dois layouts aceitos:
//   A) base bruta de faturamento: CodProd, qtd, dt_emissao, Natureza, Nota_Cancelada, Grupo, Empresa, Vendedor, Loja_Origem...
//   B) aba "Faturamento": Origem, SKU, Data, Quantidade, Descricao, Loja, Loja_Evento (uma linha por venda).
// Ponto de venda a abastecer, em ordem de prioridade:
//   1) coluna "Loja" (referência direta; "Ativação" e outros pontos que não são loja ficam de fora);
//   2) coluna "Origem" / "Loja_Origem" (Alm_SP_Loja = Itaim; Alm_PDV_Ativacao, Alm_SP_Fabrica e Alm_Para não são loja);
//   3) Empresa + Vendedor conforme o cadastro das lojas (padrões com "!" excluem, ex.: !CPLUG - Ativacao*).
// Layout A só entra venda (Natureza = VENDAS), sem nota cancelada e dos grupos escolhidos (padrão: Produto Acabado).
// Layout B não traz grupo: use `skusPermitidos` (produtos acabados do cadastro) para filtrar.
import * as XLSX from "xlsx";
import { lojaDoTexto, numeroBr, codigoSku, casaVendedor, LOJAS_PADRAO, type LojaCfg, type LojaCodigo, type Pendencia } from "./abastecimento-carga";

export type LinhaConsumo = { loja: LojaCodigo; id_produto: string; data: string; quantidade: number; descricao: string | null };
export type ResultadoFaturamento = {
  linhas: LinhaConsumo[];
  aba: string | null; periodo: { de: string | null; ate: string | null };
  lojaPorColuna: boolean;
  layout: "A" | "B" | null;
  lidas: number; descartadas: { natureza: number; cancelada: number; grupo: number; semLoja: number; semData: number; semSku: number; foraDoCadastro: number };
  outrosPontos: Record<string, { linhas: number; unidades: number }>;   // Ativação, B2B etc.: não são loja a abastecer
  porLoja: Record<string, { unidades: number; skus: number; ultimaData: string | null; linhas: number }>;
  gruposVistos: Record<string, number>;
  pendencias: Pendencia[]; bloqueios: string[];
};

const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function dataIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Padrões de vendedor com exclusão: "!ABC*" retira quem começa com ABC; sem positivos, vale "qualquer um". */
export function casaVendedorLista(vend: unknown, padroes: string[]): boolean {
  const pos = padroes.filter((p) => !p.trim().startsWith("!")), neg = padroes.filter((p) => p.trim().startsWith("!")).map((p) => p.trim().slice(1));
  if (neg.length && casaVendedor(vend, neg)) return false;
  return pos.length === 0 ? String(vend ?? "").trim() !== "" : casaVendedor(vend, pos);
}
const semZeros = (s: string) => s.replace(/^0+/, "");

export function interpretarFaturamento(
  abas: { nome: string; aoa: unknown[][] }[],
  opts: { conhecidos?: Set<string>; lojas?: LojaCfg[]; grupos?: string[]; skusPermitidos?: Set<string> } = {},
): ResultadoFaturamento {
  const res: ResultadoFaturamento = {
    linhas: [], aba: null, periodo: { de: null, ate: null }, lojaPorColuna: false, layout: null, lidas: 0,
    descartadas: { natureza: 0, cancelada: 0, grupo: 0, semLoja: 0, semData: 0, semSku: 0, foraDoCadastro: 0 }, outrosPontos: {}, porLoja: {}, gruposVistos: {}, pendencias: [], bloqueios: [],
  };
  const conhecidos = opts.conhecidos ?? new Set<string>();
  const lojas = opts.lojas ?? LOJAS_PADRAO;
  const grupos = new Set((opts.grupos ?? ["Produto Acabado"]).map(norm));
  let achou: { nome: string; aoa: unknown[][]; h: number; layout: "A" | "B" } | null = null;
  for (const a of abas) for (let i = 0; i < Math.min(a.aoa.length, 20) && !achou; i++) {
    const ns = (a.aoa[i] ?? []).map(norm);
    if (ns.includes("codprod") && ns.includes("qtd") && (ns.includes("dt_emissao") || ns.includes("data"))) achou = { ...a, h: i, layout: "A" };
    else if (ns.includes("sku") && ns.includes("data") && ns.includes("quantidade")) achou = { ...a, h: i, layout: "B" };
  }
  if (!achou) { res.bloqueios.push('Não achei o cabeçalho do faturamento (use "CodProd/qtd/dt_emissao" ou "SKU/Data/Quantidade").'); return res; }
  res.aba = achou.nome; res.layout = achou.layout;
  const ix: Record<string, number> = {}; (achou.aoa[achou.h] ?? []).forEach((c, i) => { const n = norm(c); if (n && !(n in ix)) ix[n] = i; });
  const iCod = ix["codprod"] ?? ix["sku"], iQtd = ix["qtd"] ?? ix["quantidade"], iData = ix["dt_emissao"] ?? ix["data"], iDesc = ix["desc_produto"] ?? ix["descricao"];
  const iOrigem = ix["loja_origem"] ?? ix["origem"];
  const temLoja = ix["loja"] !== undefined;
  res.lojaPorColuna = temLoja;
  if (!temLoja && iOrigem === undefined && ix["empresa"] === undefined) { res.bloqueios.push('Sem coluna "Loja", "Origem" ou "Empresa": não consigo saber o ponto de venda.'); return res; }
  const alvos = lojas.map((c) => ({ c, emp: norm(c.empresa_erp) }));
  const agg = new Map<string, LinhaConsumo>();
  const outro = (nome: string, q: number) => { const o = (res.outrosPontos[nome] ??= { linhas: 0, unidades: 0 }); o.linhas++; o.unidades += q; };
  for (let i = achou.h + 1; i < achou.aoa.length; i++) {
    const row = achou.aoa[i] ?? [];
    const cod = row[iCod];
    if (cod === null || cod === undefined || String(cod).trim() === "") continue;
    res.lidas++;
    if (ix["natureza"] !== undefined && norm(row[ix["natureza"]]) !== "vendas") { res.descartadas.natureza++; continue; }
    if (ix["nota_cancelada"] !== undefined && norm(row[ix["nota_cancelada"]]) === "s") { res.descartadas.cancelada++; continue; }
    if (ix["grupo"] !== undefined) {
      const g = String(row[ix["grupo"]] ?? "").trim() || "(vazio)";
      res.gruposVistos[g] = (res.gruposVistos[g] ?? 0) + 1;
      if (!grupos.has(norm(g))) { res.descartadas.grupo++; continue; }
    }
    const data = dataIso(row[iData]);
    if (!data) { res.descartadas.semData++; continue; }
    const q = numeroBr(row[iQtd]);
    if (q === null || q <= 0) continue;
    if (opts.skusPermitidos && !opts.skusPermitidos.has(semZeros(String(cod).trim()))) { res.descartadas.foraDoCadastro++; continue; }
    let loja: LojaCodigo | null = null;
    const valLoja = temLoja ? String(row[ix["loja"]] ?? "").trim() : "";
    const valOrigem = iOrigem !== undefined ? String(row[iOrigem] ?? "").trim() : "";
    if (valLoja) { loja = lojaDoTexto(valLoja); if (!loja) { outro(valLoja, q); continue; } }
    else if (valOrigem) { loja = lojaDoTexto(valOrigem); if (!loja) { outro(valOrigem, q); continue; } }
    else if (ix["empresa"] !== undefined) {
      const emp = norm(row[ix["empresa"]]);
      for (const { c, emp: e } of alvos) {
        if (emp !== e) continue;
        if (ix["vendedor"] !== undefined ? !casaVendedorLista(row[ix["vendedor"]], c.vendedores) : !c.vendedores.includes("*")) continue;
        loja = c.codigo; break;
      }
    }
    if (!loja) { res.descartadas.semLoja++; continue; }
    const sku = codigoSku(cod, conhecidos);
    if (!sku) { res.descartadas.semSku++; continue; }
    const k = `${loja}|${sku}|${data}`;
    const a = agg.get(k);
    if (a) a.quantidade += q;
    else agg.set(k, { loja, id_produto: sku, data, quantidade: q, descricao: iDesc !== undefined ? String(row[iDesc] ?? "").trim() || null : null });
  }
  res.linhas = [...agg.values()];
  const skusPorLoja: Record<string, Set<string>> = {};
  for (const l of res.linhas) {
    const o = (res.porLoja[l.loja] ??= { unidades: 0, skus: 0, ultimaData: null, linhas: 0 });
    o.unidades += l.quantidade; o.linhas++; if (!o.ultimaData || l.data > o.ultimaData) o.ultimaData = l.data;
    (skusPorLoja[l.loja] ??= new Set()).add(l.id_produto);
    if (!res.periodo.de || l.data < res.periodo.de) res.periodo.de = l.data;
    if (!res.periodo.ate || l.data > res.periodo.ate) res.periodo.ate = l.data;
  }
  for (const l of Object.keys(res.porLoja)) res.porLoja[l].skus = skusPorLoja[l].size;
  if (res.linhas.length === 0) res.bloqueios.push("Nenhuma venda de produto acabado foi encontrada para as lojas.");
  return res;
}
export function aoaDaAbaFat(ws: XLSX.WorkSheet): unknown[][] { return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, cellDates: true } as any) as unknown[][]; }
