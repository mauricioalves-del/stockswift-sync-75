// Leitura da planilha "Bases_V2.xlsx" do Portal de Abastecimento (9 abas), conforme o kit de reconstrução.
//
//  SOLICITAÇÃO LOJA <Eldorado | Pátio | Itaim>  (cabeçalho na linha 5)  chave: sku_sistema
//        colunas usadas: produto, categoria, linear_real (venda/dia), exposicao, pedido
//  CAIXARIA                      chave: codigo   -> full_case (por código; se não bater, pela descrição exata)
//  Sortimento_Alm_SP_Loja / _Loja_Patio / _Loja_Eldorado   chave: cod_sku -> ativo
//  BASE VENDAS                   chave: codprod  -> qtd (últimos 30 dias, sem cancelados)
//  (SALDO ESTOQUE SISTEMA não é lida: o estoque vem do próprio Stock Savvy.)
import * as XLSX from "xlsx";

export type LojaCodigo = "JESUINO" | "PATIO" | "ELDORADO";

export type ProdutoLojaCarga = {
  loja: LojaCodigo; id_produto: string; ativo: boolean;
  venda_dia: number | null; exposicao: number | null; vendas_30d: number | null;
  categoria: string | null; tipo_produto: string | null; pedido: number | null;
};
export type ProdutoCarga = { id_produto: string; descricao: string | null; full_case: number | null };
export type Pendencia = { aba: string; linha: number; campo: string; valor: string; motivo: string };

export type ResultadoCarga = {
  produtoLoja: ProdutoLojaCarga[];
  produtos: ProdutoCarga[];
  pendencias: Pendencia[];
  abasEncontradas: string[];
  abasFaltando: string[];
  porLoja: Record<string, { skus: number; ativos: number; comVendaDia: number; comExposicao: number }>;
  vendasForaDoCatalogo: number;
  bloqueios: string[];
};

const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Apelidos de loja: "Loja Itaim"/"Loja Itam" => Jesuino. */
export function lojaDoTexto(t: unknown): LojaCodigo | null {
  const n = norm(t);
  if (/itaim|itam|jesuino|sp_loja/.test(n)) return "JESUINO";
  if (/patio|paulista/.test(n)) return "PATIO";
  if (/eldorado/.test(n)) return "ELDORADO";
  return null;
}

export function numeroBr(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || s.startsWith("#")) return null;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const VERDADEIRO = new Set(["1", "s", "sim", "x", "true", "verdadeiro", "ativo", "y", "yes"]);
export function ehAtivo(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  return VERDADEIRO.has(norm(v));
}

/** Zeros à esquerda: "5304030" => "05304030" quando o cadastro conhece o código com zeros. */
export function codigoSku(v: unknown, conhecidos: Set<string>): string {
  let s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (!/^\d+$/.test(s)) return s;
  if (conhecidos.has(s)) return s;
  const p = s.padStart(8, "0");
  if (conhecidos.has(p)) return p;
  return s.length < 8 ? p : s;
}

type Linha = unknown[];

/** Matriz da aba; células com erro do Excel viram "#ERR:#REF!" para virarem pendência (sem quebrar a carga). */
function matriz(ws: XLSX.WorkSheet): Linha[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const r = XLSX.utils.decode_range(ref);
  const out: Linha[] = [];
  for (let R = r.s.r; R <= r.e.r; R++) {
    const linha: Linha = [];
    for (let C = r.s.c; C <= r.e.c; C++) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!c) linha.push(null);
      else if (c.t === "e") linha.push("#ERR:" + (c.w ?? "#N/A"));
      else linha.push(c.v ?? null);
    }
    out.push(linha);
  }
  return out;
}

function achaCabecalho(m: Linha[], chave: string, padrao?: number): number {
  for (let i = 0; i < Math.min(m.length, 20); i++) if (m[i].some((c) => norm(c) === chave)) return i;
  return padrao ?? -1;
}

function indices(cab: Linha): Record<string, number> {
  const ix: Record<string, number> = {};
  cab.forEach((c, i) => { const n = norm(c); if (n && !(n in ix)) ix[n] = i; });
  return ix;
}

export function interpretarBases(wb: XLSX.WorkBook, conhecidos: Set<string> = new Set()): ResultadoCarga {
  const res: ResultadoCarga = {
    produtoLoja: [], produtos: [], pendencias: [], abasEncontradas: [], abasFaltando: [],
    porLoja: {}, vendasForaDoCatalogo: 0, bloqueios: [],
  };
  const pend = (aba: string, linha: number, campo: string, valor: unknown, motivo: string) => {
    if (res.pendencias.length < 500) res.pendencias.push({ aba, linha, campo, valor: String(valor), motivo });
  };
  const celula = (aba: string, linha: number, campo: string, v: unknown): number | null => {
    if (typeof v === "string" && v.startsWith("#ERR:")) { pend(aba, linha, campo, v.slice(5), "célula com erro do Excel"); return null; }
    const n = numeroBr(v);
    if (n === null && v !== null && v !== undefined && String(v).trim() !== "") pend(aba, linha, campo, v, "número inválido");
    return n;
  };

  const abas = wb.SheetNames.map((nome) => ({ nome, n: norm(nome) }));
  const ehSolic = (a: { n: string }) => a.n.includes("solicitacao") && a.n.includes("loja");
  const solic = abas.filter(ehSolic).map((a) => ({ ...a, loja: lojaDoTexto(a.nome) })).filter((a) => a.loja);
  const caixaria = abas.find((a) => a.n.includes("caixaria"));
  const sortimentos = abas.filter((a) => a.n.startsWith("sortimento")).map((a) => ({ ...a, loja: lojaDoTexto(a.nome) })).filter((a) => a.loja);
  const vendas = abas.find((a) => a.n.includes("base") && a.n.includes("vendas"));

  (["ELDORADO", "PATIO", "JESUINO"] as LojaCodigo[]).forEach((l) => { if (!solic.some((s) => s.loja === l)) res.abasFaltando.push(`SOLICITAÇÃO LOJA (${l})`); });
  if (!caixaria) res.abasFaltando.push("CAIXARIA");
  (["ELDORADO", "PATIO", "JESUINO"] as LojaCodigo[]).forEach((l) => { if (!sortimentos.some((s) => s.loja === l)) res.abasFaltando.push(`Sortimento (${l})`); });
  if (!vendas) res.abasFaltando.push("BASE VENDAS");

  const porChave = new Map<string, ProdutoLojaCarga>();
  const descricoes = new Map<string, string>();

  // 1) SOLICITAÇÃO LOJA: venda/dia, exposição, categoria e pedido
  for (const a of solic) {
    res.abasEncontradas.push(a.nome);
    const m = matriz(wb.Sheets[a.nome]);
    const h = achaCabecalho(m, "sku_sistema", 4);
    if (h < 0 || !m[h]) { res.bloqueios.push(`Aba "${a.nome}": não achei a coluna sku_sistema.`); continue; }
    const ix = indices(m[h]);
    if (ix["sku_sistema"] === undefined || ix["linear_real"] === undefined || ix["exposicao"] === undefined) {
      res.bloqueios.push(`Aba "${a.nome}": faltam colunas (sku_sistema, linear_real, exposicao).`);
      continue;
    }
    for (let i = h + 1; i < m.length; i++) {
      const row = m[i];
      const bruto = row[ix["sku_sistema"]];
      if (bruto === null || bruto === undefined || String(bruto).trim() === "") continue;
      if (typeof bruto === "string" && bruto.startsWith("#ERR:")) { pend(a.nome, i + 1, "sku_sistema", bruto.slice(5), "célula com erro do Excel"); continue; }
      const sku = codigoSku(bruto, conhecidos);
      const prod = ix["produto"] !== undefined ? row[ix["produto"]] : null;
      if (prod && !descricoes.has(sku)) descricoes.set(sku, String(prod).trim());
      porChave.set(`${a.loja}|${sku}`, {
        loja: a.loja as LojaCodigo, id_produto: sku, ativo: false,
        venda_dia: celula(a.nome, i + 1, "linear_real", row[ix["linear_real"]]),
        exposicao: celula(a.nome, i + 1, "exposicao", row[ix["exposicao"]]),
        vendas_30d: null,
        categoria: ix["categoria"] !== undefined && row[ix["categoria"]] ? String(row[ix["categoria"]]).trim() : null,
        tipo_produto: ix["tipo_produto"] !== undefined && row[ix["tipo_produto"]] ? String(row[ix["tipo_produto"]]).trim() : null,
        pedido: ix["pedido"] !== undefined ? celula(a.nome, i + 1, "pedido", row[ix["pedido"]]) : null,
      });
    }
  }

  // 2) Sortimento: quem está ativo em cada loja
  const comSortimento = new Set<string>();
  for (const a of sortimentos) {
    res.abasEncontradas.push(a.nome);
    comSortimento.add(a.loja as string);
    const m = matriz(wb.Sheets[a.nome]);
    const h = achaCabecalho(m, "cod_sku", 0);
    if (h < 0 || !m[h]) { res.bloqueios.push(`Aba "${a.nome}": não achei a coluna cod_sku.`); continue; }
    const ix = indices(m[h]);
    if (ix["cod_sku"] === undefined) { res.bloqueios.push(`Aba "${a.nome}": não achei a coluna cod_sku.`); continue; }
    for (let i = h + 1; i < m.length; i++) {
      const bruto = m[i][ix["cod_sku"]];
      if (bruto === null || bruto === undefined || String(bruto).trim() === "") continue;
      const sku = codigoSku(bruto, conhecidos);
      const ativo = ix["ativo"] !== undefined ? ehAtivo(m[i][ix["ativo"]]) : true;
      const k = `${a.loja}|${sku}`;
      const atual = porChave.get(k);
      if (atual) atual.ativo = ativo;
      else porChave.set(k, { loja: a.loja as LojaCodigo, id_produto: sku, ativo, venda_dia: null, exposicao: null, vendas_30d: null, categoria: null, tipo_produto: null, pedido: null });
    }
  }
  // Sem aba de sortimento para a loja: tudo que está na SOLICITAÇÃO daquela loja vale como ativo (avisa na auditoria).
  for (const v of porChave.values()) {
    if (!comSortimento.has(v.loja) && solic.some((s) => s.loja === v.loja)) v.ativo = true;
  }

  // 3) CAIXARIA: full_case por código; se não bater, pela descrição exata
  const fullCase = new Map<string, number>();
  if (caixaria) {
    res.abasEncontradas.push(caixaria.nome);
    const m = matriz(wb.Sheets[caixaria.nome]);
    const h = achaCabecalho(m, "codigo", 0);
    const ix = h >= 0 && m[h] ? indices(m[h]) : {};
    if (ix["codigo"] === undefined || ix["full_case"] === undefined) {
      res.bloqueios.push(`Aba "${caixaria.nome}": faltam colunas (codigo, full_case).`);
    } else {
      const porDescricao = new Map<string, number>();
      for (let i = h + 1; i < m.length; i++) {
        const fc = celula(caixaria.nome, i + 1, "full_case", m[i][ix["full_case"]]);
        if (fc === null) continue;
        const cod = m[i][ix["codigo"]];
        if (cod !== null && cod !== undefined && String(cod).trim() !== "") fullCase.set(codigoSku(cod, conhecidos), fc);
        const d = ix["descricao"] !== undefined ? norm(m[i][ix["descricao"]]) : "";
        if (d) porDescricao.set(d, fc);
      }
      for (const [sku, desc] of descricoes) {
        if (!fullCase.has(sku)) { const fc = porDescricao.get(norm(desc)); if (fc !== undefined) fullCase.set(sku, fc); }
      }
    }
  }

  // 4) BASE VENDAS: soma da quantidade por loja e SKU (sem cancelados)
  if (vendas) {
    res.abasEncontradas.push(vendas.nome);
    const m = matriz(wb.Sheets[vendas.nome]);
    const h = achaCabecalho(m, "codprod", 0);
    const ix = h >= 0 && m[h] ? indices(m[h]) : {};
    if (ix["codprod"] === undefined || ix["qtd"] === undefined || ix["empresa"] === undefined) {
      res.bloqueios.push(`Aba "${vendas.nome}": faltam colunas (codprod, empresa, qtd).`);
    } else {
      const canc = (v: unknown) => ehAtivo(v);
      const soma = new Map<string, number>();
      for (let i = h + 1; i < m.length; i++) {
        const row = m[i];
        if (row[ix["codprod"]] === null || row[ix["codprod"]] === undefined) continue;
        if (ix["pedido_cancelado"] !== undefined && canc(row[ix["pedido_cancelado"]])) continue;
        if (ix["nota_cancelada"] !== undefined && canc(row[ix["nota_cancelada"]])) continue;
        const loja = lojaDoTexto(row[ix["empresa"]]);
        const q = numeroBr(row[ix["qtd"]]);
        if (!loja || q === null) continue;
        const k = `${loja}|${codigoSku(row[ix["codprod"]], conhecidos)}`;
        soma.set(k, (soma.get(k) ?? 0) + q);
      }
      for (const [k, q] of soma) {
        const p = porChave.get(k);
        if (p) p.vendas_30d = q;
        else res.vendasForaDoCatalogo += 1; // vendas de códigos fora do catálogo: registradas à parte
      }
    }
  }

  // 5) Montagem
  res.produtoLoja = [...porChave.values()];
  const ids = new Set(res.produtoLoja.map((p) => p.id_produto));
  res.produtos = [...ids].map((id) => ({ id_produto: id, descricao: descricoes.get(id) ?? null, full_case: fullCase.get(id) ?? null }));
  for (const p of res.produtoLoja) {
    const o = (res.porLoja[p.loja] ??= { skus: 0, ativos: 0, comVendaDia: 0, comExposicao: 0 });
    o.skus++; if (p.ativo) o.ativos++; if (p.venda_dia !== null) o.comVendaDia++; if (p.exposicao !== null) o.comExposicao++;
  }
  if (solic.length === 0) res.bloqueios.push('Nenhuma aba "SOLICITAÇÃO LOJA" (Eldorado, Pátio ou Itaim) foi encontrada.');
  if (res.produtoLoja.length === 0) res.bloqueios.push("Nenhum produto foi lido da planilha.");
  return res;
}
