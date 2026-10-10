// Malha = consenso da diretoria. Envio por arquivo (CSV ou Excel), um valor por loja e SKU.
//
// Cálculo (igual ao do Excel de abastecimento): Linear Malha = consenso do mês (unidades) ÷ dias do mês.
//   Ex.: 17 un em outubro (31 dias) => 0,548 un/dia.
//
// Formatos aceitos (cabeçalho em qualquer linha das 20 primeiras; acentos e maiúsculas não importam):
//   Longo:  SKU | Loja | Consenso       (uma linha por SKU e loja)
//   Largo:  SKU | Itaim | Pátio | Eldorado   (uma coluna por loja)
import * as XLSX from "xlsx";
import { lojaDoTexto, numeroBr, codigoSku, type LojaCodigo, type Pendencia } from "./abastecimento-carga";

export type ItemMalha = { loja: LojaCodigo; id_produto: string; venda_malha: number };
export type ResultadoMalha = {
  itens: ItemMalha[];
  pendencias: Pendencia[];
  porLoja: Record<string, number>;
  bloqueios: string[];
  formato: "longo" | "largo" | null;
  aba: string | null;
  diasMes: number;
  mes: string;
  unidade: "mensal" | "diaria";
};

const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const ALIAS_SKU = new Set(["sku", "sku_sistema", "cod_sku", "codigo", "cod", "id_produto", "codprod", "cod_produto"]);
const ALIAS_LOJA = new Set(["loja", "filial", "unidade", "empresa", "destino"]);
const ehValor = (n: string): boolean => /^(consenso|malha|forecast|previsao|demanda|unidades|quantidade|qtd)/.test(n);

/** Dias do mês de "AAAA-MM" (28 a 31). */
export function diasDoMes(mes: string): number {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 30;
  return new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
}

/** Texto CSV (separador ; , ou tabulação; aspas) para matriz. */
export function csvParaAoa(texto: string): unknown[][] {
  const limpo = texto.replace(/^\uFEFF/, "");
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length === 0) return [];
  const cab = linhas[0];
  const cont = (c: string) => (cab.match(new RegExp(c === "\t" ? "\t" : "\\" + c, "g")) ?? []).length;
  const sep = [";", "\t", ","].sort((a, b) => cont(b) - cont(a))[0];
  return linhas.map((l) => {
    const out: string[] = []; let cur = ""; let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (aspas && l[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  });
}

export function aoaDaAba(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

function achaCabecalho(aoa: unknown[][]): { linha: number; formato: "longo" | "largo" } | null {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const ns = (aoa[i] ?? []).map(norm);
    if (!ns.some((n) => ALIAS_SKU.has(n))) continue;
    if (ns.some((n) => ALIAS_LOJA.has(n)) && ns.some(ehValor)) return { linha: i, formato: "longo" };
    if ((aoa[i] ?? []).some((c) => lojaDoTexto(c) !== null)) return { linha: i, formato: "largo" };
  }
  return null;
}

/** Interpreta a malha. `abas` = matrizes das abas (CSV tem uma só); usa a primeira com cabeçalho reconhecível. */
export function interpretarMalha(
  abas: { nome: string; aoa: unknown[][] }[],
  opts: { mes: string; unidade: "mensal" | "diaria"; conhecidos?: Set<string> },
): ResultadoMalha {
  const diasMes = diasDoMes(opts.mes);
  const res: ResultadoMalha = { itens: [], pendencias: [], porLoja: {}, bloqueios: [], formato: null, aba: null, diasMes, mes: opts.mes, unidade: opts.unidade };
  const conhecidos = opts.conhecidos ?? new Set<string>();
  if (!/^\d{4}-\d{2}$/.test(opts.mes)) { res.bloqueios.push("Informe o mês do consenso (AAAA-MM)."); return res; }

  let aba: { nome: string; aoa: unknown[][] } | null = null;
  let cab: { linha: number; formato: "longo" | "largo" } | null = null;
  for (const a of abas) { const c = achaCabecalho(a.aoa); if (c) { aba = a; cab = c; break; } }
  if (!aba || !cab) {
    res.bloqueios.push('Não achei o cabeçalho. Use as colunas "SKU", "Loja" e "Consenso" (uma linha por SKU e loja), ou "SKU" e uma coluna por loja (Itaim, Pátio, Eldorado).');
    return res;
  }
  res.formato = cab.formato; res.aba = aba.nome;
  const head = (aba.aoa[cab.linha] ?? []) as unknown[];
  const ns = head.map(norm);
  const iSku = ns.findIndex((n) => ALIAS_SKU.has(n));
  const converter = (v: number) => (opts.unidade === "mensal" ? v / diasMes : v);
  const porChave = new Map<string, ItemMalha>();
  const nota = (linha: number, campo: string, valor: unknown, motivo: string) => { if (res.pendencias.length < 300) res.pendencias.push({ aba: aba!.nome, linha, campo, valor: String(valor), motivo }); };

  const registra = (linha: number, lojaTxt: unknown, skuBruto: unknown, bruto: unknown) => {
    const loja = lojaDoTexto(lojaTxt);
    if (!loja) { nota(linha, "loja", lojaTxt ?? "", "loja não reconhecida (use Itaim/Jesuíno, Pátio ou Eldorado)"); return; }
    if (bruto === null || bruto === undefined || String(bruto).trim() === "") return;
    const v = numeroBr(bruto);
    if (v === null) { nota(linha, "consenso", bruto, "número inválido"); return; }
    if (v < 0) { nota(linha, "consenso", bruto, "valor negativo"); return; }
    const sku = codigoSku(skuBruto, conhecidos);
    porChave.set(`${loja}|${sku}`, { loja, id_produto: sku, venda_malha: converter(v) });
  };

  for (let i = cab.linha + 1; i < aba.aoa.length; i++) {
    const row = aba.aoa[i] ?? [];
    const skuBruto = row[iSku];
    if (skuBruto === null || skuBruto === undefined || String(skuBruto).trim() === "") continue;
    if (cab.formato === "longo") {
      const iLoja = ns.findIndex((n) => ALIAS_LOJA.has(n));
      const iVal = ns.findIndex(ehValor);
      registra(i + 1, row[iLoja], skuBruto, row[iVal]);
    } else {
      head.forEach((h, c) => { if (c !== iSku && lojaDoTexto(h) !== null) registra(i + 1, h, skuBruto, row[c]); });
    }
  }
  res.itens = [...porChave.values()];
  for (const it of res.itens) res.porLoja[it.loja] = (res.porLoja[it.loja] ?? 0) + 1;
  if (res.itens.length === 0) res.bloqueios.push("Nenhum valor de consenso foi lido do arquivo.");
  return res;
}

/** Modelo para o usuário preencher. */
export function modeloMalhaCsv(): string {
  return "\uFEFF" + ["SKU;Loja;Consenso (un/mes)", "05004057;Itaim;17", "05004057;Patio;40", "05004057;Eldorado;32"].join("\r\n") + "\r\n";
}
