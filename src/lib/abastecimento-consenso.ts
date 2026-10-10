// Consenso mensal (meta de vendas da diretoria) por loja (almox) e SKU.
//
// Formato do arquivo "Consenso_Mensal.xlsx": 2 linhas de topo (ano e mês) e um cabeçalho com
//   SKU Sistema | Almox | Canal | Produto | Linha | Tipo | Gramatura | UNIT (uma coluna por mês: Ago, Set, Out ...)
// Cada célula de mês é a meta de UNIDADES do mês para aquela loja e SKU.
import * as XLSX from "xlsx";
import { lojaDoTexto, numeroBr, codigoSku, type LojaCodigo, type Pendencia } from "./abastecimento-carga";

export type ConsensoItem = { loja: LojaCodigo; id_produto: string; mes: string; unidades: number; canal: string; tipo: string | null; produto: string | null };
export type ResultadoConsenso = {
  itens: ConsensoItem[];
  pendencias: Pendencia[];
  bloqueios: string[];
  alertas: string[];
  meses: string[];
  aba: string | null;
  porLoja: Record<string, { skus: number; comMeta: number; unidadesPorMes: Record<string, number> }>;
};

const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const MESES: Record<string, number> = { jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12 };

export function diasDoMesIso(mes: string): number {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate() : 30;
}

function mesDaCelula(v: unknown, ano: number | null): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const n = MESES[norm(s)];
  if (n && ano) return `${ano}-${String(n).padStart(2, "0")}`;
  return null;
}

export function aoaDaAbaConsenso(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

export function interpretarConsenso(
  abas: { nome: string; aoa: unknown[][] }[],
  opts: { conhecidos?: Set<string>; sortimento?: Record<string, Set<string>> } = {},
): ResultadoConsenso {
  const res: ResultadoConsenso = { itens: [], pendencias: [], bloqueios: [], alertas: [], meses: [], aba: null, porLoja: {} };
  const conhecidos = opts.conhecidos ?? new Set<string>();
  let achou: { aba: { nome: string; aoa: unknown[][] }; h: number } | null = null;
  for (const aba of abas) {
    for (let i = 0; i < Math.min(aba.aoa.length, 25); i++) {
      const ns = (aba.aoa[i] ?? []).map(norm);
      if (ns.some((n) => n === "sku_sistema" || n === "sku") && ns.includes("almox")) { achou = { aba, h: i }; break; }
    }
    if (achou) break;
  }
  if (!achou) { res.bloqueios.push('Não achei o cabeçalho (colunas "SKU Sistema" e "Almox").'); return res; }
  const { aba, h } = achou;
  res.aba = aba.nome;
  const head = (aba.aoa[h] ?? []) as unknown[];
  const ns = head.map(norm);
  const iSku = ns.findIndex((n) => n === "sku_sistema" || n === "sku");
  const iAlm = ns.indexOf("almox");
  const iCanal = ns.indexOf("canal"), iProd = ns.indexOf("produto"), iTipo = ns.indexOf("tipo");

  // Colunas de mês: a linha logo acima do cabeçalho tem o mês; duas acima, o ano (preenchido para a direita).
  const linhaMes = (aba.aoa[h - 1] ?? []) as unknown[];
  const linhaAno = (aba.aoa[h - 2] ?? []) as unknown[];
  const colMes: { col: number; mes: string }[] = [];
  let ano: number | null = null;
  for (let c = 0; c < head.length; c++) {
    const a = Number(linhaAno[c]);
    if (Number.isFinite(a) && a > 2000 && a < 2100) ano = a;
    if (c <= Math.max(iSku, iAlm, iCanal, iProd, iTipo)) continue;
    const m = mesDaCelula(linhaMes[c], ano) ?? mesDaCelula(head[c], ano);
    if (m) colMes.push({ col: c, mes: m });
  }
  if (colMes.length === 0) { res.bloqueios.push("Não achei as colunas de mês (ex.: Ago, Set, Out) acima do cabeçalho."); return res; }
  res.meses = colMes.map((x) => x.mes);

  const unico = new Map<string, ConsensoItem>();
  const repetidos = new Set<string>();
  for (let i = h + 1; i < aba.aoa.length; i++) {
    const row = aba.aoa[i] ?? [];
    const skuBruto = row[iSku];
    if (skuBruto === null || skuBruto === undefined || String(skuBruto).trim() === "") continue;
    const loja = lojaDoTexto(row[iAlm]);
    if (!loja) { if (res.pendencias.length < 200) res.pendencias.push({ aba: aba.nome, linha: i + 1, campo: "almox", valor: String(row[iAlm] ?? ""), motivo: "loja não reconhecida (use Itaim, Pátio ou Eldorado)" }); continue; }
    const sku = codigoSku(skuBruto, conhecidos);
    const canal = iCanal >= 0 ? String(row[iCanal] ?? "").trim() : "";
    for (const { col, mes } of colMes) {
      const bruto = row[col];
      if (bruto === null || bruto === undefined || String(bruto).trim() === "") continue;
      const v = numeroBr(bruto);
      if (v === null || v < 0) { if (res.pendencias.length < 200) res.pendencias.push({ aba: aba.nome, linha: i + 1, campo: mes, valor: String(bruto), motivo: v === null ? "número inválido" : "valor negativo" }); continue; }
      const chave = `${loja}|${sku}|${mes}|${canal}`;
      const anterior = unico.get(chave);
      if (anterior) { repetidos.add(sku); if (v <= anterior.unidades) continue; } // mesmo SKU repetido (ex.: com e sem zero à esquerda): fica o maior valor
      unico.set(chave, { loja, id_produto: sku, mes, unidades: v, canal, tipo: iTipo >= 0 ? String(row[iTipo] ?? "").trim() || null : null, produto: iProd >= 0 ? String(row[iProd] ?? "").trim() || null : null });
    }
  }
  res.itens = [...unico.values()];
  if (repetidos.size > 0) res.alertas.push(`${repetidos.size} SKU(s) aparecem repetidos no arquivo (por exemplo ${[...repetidos].slice(0, 3).join(", ")}), com e sem zero à esquerda. Usei o MAIOR valor de cada mês; revise o arquivo.`);

  // Resumo por loja
  const skusPorLoja: Record<string, Set<string>> = {}, comMetaPorLoja: Record<string, Set<string>> = {};
  for (const it of res.itens) {
    const o = (res.porLoja[it.loja] ??= { skus: 0, comMeta: 0, unidadesPorMes: {} });
    o.unidadesPorMes[it.mes] = (o.unidadesPorMes[it.mes] ?? 0) + it.unidades;
    (skusPorLoja[it.loja] ??= new Set()).add(it.id_produto);
    if (it.unidades > 0) (comMetaPorLoja[it.loja] ??= new Set()).add(it.id_produto);
  }
  for (const l of Object.keys(res.porLoja)) { res.porLoja[l].skus = skusPorLoja[l]?.size ?? 0; res.porLoja[l].comMeta = comMetaPorLoja[l]?.size ?? 0; }

  // Alertas de qualidade
  const lojas = Object.keys(res.porLoja);
  const serie = (l: string, sku: string) => res.meses.map((m) => res.itens.filter((x) => x.loja === l && x.id_produto === sku && x.mes === m).reduce((a, b) => a + b.unidades, 0));
  for (let a = 0; a < lojas.length; a++) for (let b = a + 1; b < lojas.length; b++) {
    const comum = [...(comMetaPorLoja[lojas[a]] ?? [])].filter((s) => (comMetaPorLoja[lojas[b]] ?? new Set()).has(s));
    if (comum.length < 5) continue;
    const iguais = comum.filter((s) => { const x = serie(lojas[a], s), y = serie(lojas[b], s); return x.every((v, k) => v === y[k]); }).length;
    if (iguais / comum.length >= 0.9) res.alertas.push(`As metas de ${lojas[a]} e ${lojas[b]} são IDÊNTICAS em ${iguais} de ${comum.length} SKUs com meta: possível cópia de uma loja para a outra. Confirme com a diretoria.`);
  }
  const foraCadastro = new Set<string>(); let unFora = 0;
  if (conhecidos.size > 0) for (const it of res.itens) if (it.unidades > 0 && !conhecidos.has(it.id_produto)) { foraCadastro.add(it.id_produto); unFora += it.unidades; }
  if (foraCadastro.size > 0) res.alertas.push(`${foraCadastro.size} SKUs com meta não têm registro no estoque (${Math.round(unFora)} un no período). Sem registro, o estoque é zero: podem estar em ruptura hoje.`);
  const cafe = res.itens.filter((x) => x.unidades > 0 && norm(x.tipo) === "cafeteria");
  if (cafe.length > 0) res.alertas.push(`${new Set(cafe.map((x) => x.id_produto)).size} SKUs do tipo Cafeteria têm meta, mas não são controlados no estoque de reposição.`);
  if (opts.sortimento) for (const l of lojas) {
    const s = opts.sortimento[l]; if (!s) continue;
    const semMeta = [...s].filter((x) => !skusPorLoja[l]?.has(x)).length;
    const metaFora = [...(comMetaPorLoja[l] ?? [])].filter((x) => !s.has(x)).length;
    if (semMeta > 0) res.alertas.push(`${l}: ${semMeta} SKUs do sortimento ativo não aparecem no consenso.`);
    if (metaFora > 0) res.alertas.push(`${l}: ${metaFora} SKUs têm meta, mas não estão no sortimento ativo.`);
  }
  return res;
}

/** Meta diária média na janela [inicio, inicio+dias): média, dia a dia, de (meta do mês ÷ dias do mês). */
export function consensoMedioNaJanela(porMes: Record<string, number>, inicioIso: string, dias: number): number {
  if (dias <= 0) return 0;
  let soma = 0;
  const base = Date.UTC(+inicioIso.slice(0, 4), +inicioIso.slice(5, 7) - 1, +inicioIso.slice(8, 10));
  for (let d = 0; d < dias; d++) {
    const dt = new Date(base + d * 86400000);
    const mes = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    soma += (porMes[mes] ?? 0) / diasDoMesIso(mes);
  }
  return soma / dias;
}

/** Série diária de meta (um valor por dia) a partir de `inicioIso`. */
export function serieDiariaConsenso(porMes: Record<string, number>, inicioIso: string, dias: number): number[] {
  const base = Date.UTC(+inicioIso.slice(0, 4), +inicioIso.slice(5, 7) - 1, +inicioIso.slice(8, 10));
  const out: number[] = [];
  for (let d = 0; d < dias; d++) {
    const dt = new Date(base + d * 86400000);
    const mes = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push((porMes[mes] ?? 0) / diasDoMesIso(mes));
  }
  return out;
}
