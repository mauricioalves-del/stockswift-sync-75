// Visão Geral de Estoque: a matriz produto × almoxarifado da planilha do ERP, com o estado de cada célula de loja e CD
// na visão de Disponibilidade (mesmo cálculo do dashboard: política de cobertura, portfólio validado e elegibilidade OOS).
import { montarDash, type DashLinha, type StatusDash } from "./abastecimento-dash";
import { nk, type Bruto } from "./abastecimento-dados";

export type Estado = "ruptura" | "abaixo" | "ok" | "excesso";
export type ColunaDef = { k: string; rot: string; planilha: string; plano: string | null };
/** Colunas na ordem da planilha. `plano` = código do local na Disponibilidade (null = só informativo, sem cor). */
export const COLUNAS: ColunaDef[] = [
  { k: "CD", rot: "Fábrica (CD)", planilha: "Alm_SP_Fabrica", plano: "CD" },
  { k: "JESUINO", rot: "Loja SP (Itaim)", planilha: "Alm_SP_Loja", plano: "JESUINO" },
  { k: "PARA", rot: "Pará", planilha: "Alm_Para", plano: null },
  { k: "PROCESSO", rot: "Em processo", planilha: "Alm_SP_Processo", plano: null },
  { k: "QUALIDADE", rot: "Qualidade", planilha: "Alm_SP_Qualidade", plano: null },
  { k: "PDV", rot: "PDV Ativação", planilha: "Alm_PDV_Ativacao", plano: null },
  { k: "PATIO", rot: "Loja Pátio", planilha: "Alm_Loja_Patio", plano: "PATIO" },
  { k: "ELDORADO", rot: "Loja Eldorado", planilha: "Alm_Loja_Eldorado", plano: "ELDORADO" },
];
/** Nome do almoxarifado no banco (na planilha a loja Pátio aparece como Alm_Loja_Patio; no banco é Alm_Paulista). */
export function origemDe(c: ColunaDef, b: Bruto): string {
  if (c.k === "CD") return b.cd;
  const l = c.plano ? b.lojas.find((x) => x.codigo === c.plano) : null; return l ? l.almoxarifado : c.planilha;
}
const ESTADO: Record<StatusDash, Estado> = { ruptura: "ruptura", stockout: "abaixo", ok: "ok", stockover: "excesso" };
export const ROTULO: Record<Estado, string> = { ruptura: "Ruptura", abaixo: "Abaixo do mínimo", ok: "OK", excesso: "Excesso" };

export type Celula = { qtd: number; estado: Estado | null; minimo: number | null; maximo: number | null; foraMeta: boolean };
export type LinhaGeral = { sku: string; descricao: string; categoria: string | null; celulas: Record<string, Celula>; total: number; estados: Estado[]; estadosLojas: Estado[]; noPlano: boolean; foraMeta: boolean };

const ordem = (l: LinhaGeral) => (l.estados.includes("ruptura") ? 0 : l.estados.includes("abaixo") ? 1 : l.estados.includes("excesso") ? 2 : l.estados.includes("ok") ? 3 : 4);
export function montarEstoqueGeral(b: Bruto, hoje: string, elegivel: (sku: string, data: string) => boolean = () => true, linhasDash?: DashLinha[]): LinhaGeral[] {
  const dash = linhasDash ?? montarDash(b, hoje);
  const plano = new Map<string, DashLinha>(); for (const l of dash) plano.set(`${l.local}|${nk(l.sku)}`, l);
  const origem = new Map<string, string>(COLUNAS.map((c) => [c.k, origemDe(c, b)]));
  const porSku = new Map<string, { sku: string; desc: string; qtd: Map<string, number> }>();
  const abre = (k: string, sku: string, desc: string) => porSku.get(k) ?? (porSku.set(k, { sku, desc, qtd: new Map() }), porSku.get(k)!);
  const origens = new Set(origem.values());
  for (const e of b.estoque) {
    if (!origens.has(e.origem)) continue; const q = Number(e.quantidade) || 0; if (q <= 0) continue;
    const alvo = SALDO_DE_PARA[nk(e.id_produto)]; const id = alvo ?? e.id_produto;   // DE-PARA: saldo do acabado vira o do produto local
    const o = abre(nk(id), id, alvo ? "" : (e.descricao ?? "")); if (!alvo && !o.desc && e.descricao) o.desc = e.descricao;
    if (id.length > o.sku.length) o.sku = id; o.qtd.set(e.origem, (o.qtd.get(e.origem) ?? 0) + q);
  }
  for (const l of dash) abre(nk(l.sku), l.sku, l.produto);       // SKU do plano aparece mesmo sem nenhum saldo
  const out: LinhaGeral[] = [];
  for (const [k, o] of porSku) {
    const celulas: Record<string, Celula> = {}; const estados = new Set<Estado>(), estadosLojas = new Set<Estado>(); let total = 0, categoria: string | null = null, foraMeta = false, noPlano = false;
    for (const c of COLUNAS) {
      const qtd = o.qtd.get(origem.get(c.k)!) ?? 0; total += qtd;
      const p = c.plano ? plano.get(`${c.plano}|${k}`) : undefined; let estado: Estado | null = null, fm = false;
      if (p) { categoria = categoria ?? p.categoria; if (elegivel(p.sku, hoje)) { estado = ESTADO[p.status]; estados.add(estado); if (c.plano !== "CD") estadosLojas.add(estado); noPlano = true; } else fm = true; }
      celulas[c.k] = { qtd, estado, minimo: p ? p.minimo : null, maximo: p ? p.maximo : null, foraMeta: fm };
      if (fm) foraMeta = true;
    }
    out.push({ sku: o.sku, descricao: o.desc || o.sku, categoria, celulas, total, estados: [...estados], estadosLojas: [...estadosLojas], noPlano, foraMeta });
  }
  return out.sort((a, b2) => ordem(a) - ordem(b2) || b2.total - a.total || a.sku.localeCompare(b2.sku));
}

export type FiltroGeral = { estados: Estado[]; semPlano: boolean; stockout: boolean; stockover: boolean; busca: string; soPlano: boolean };
export const FILTRO_VAZIO: FiltroGeral = { estados: [], semPlano: false, stockout: false, stockover: false, busca: "", soPlano: false };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Grupo A (posição): ruptura/abaixo/ok/excesso em qualquer local do plano, ou fora do planejamento. Grupo B (status): Stockout/Stock Over nas LOJAS. Entre grupos vale "e"; dentro de cada grupo, "ou". */
export function filtrarLinhas(ls: LinhaGeral[], f: FiltroGeral): LinhaGeral[] {
  const q = norm(f.busca.trim()); const temA = f.estados.length > 0 || f.semPlano, temB = f.stockout || f.stockover;
  return ls.filter((l) => {
    if (f.soPlano && !l.noPlano) return false;
    if (q && !norm(l.descricao).includes(q) && !l.sku.includes(q)) return false;
    if (temA && !(f.estados.some((e) => l.estados.includes(e)) || (f.semPlano && !l.noPlano))) return false;
    if (temB && !((f.stockout && l.estadosLojas.includes("abaixo")) || (f.stockover && l.estadosLojas.includes("excesso")))) return false;
    return true;
  });
}
export function contar(ls: LinhaGeral[]) {
  const c = { total: ls.length, noPlano: 0, semPlano: 0, ruptura: 0, abaixo: 0, ok: 0, excesso: 0, stockout: 0, stockover: 0 };
  for (const l of ls) { if (l.noPlano) c.noPlano++; else c.semPlano++; for (const e of ["ruptura", "abaixo", "ok", "excesso"] as Estado[]) if (l.estados.includes(e)) c[e]++; if (l.estadosLojas.includes("abaixo")) c.stockout++; if (l.estadosLojas.includes("excesso")) c.stockover++; }
  return c;
}
/** CSV no layout da planilha (Id_produto, descricao, um almoxarifado por coluna) + total e o estado de cada local do plano. */
export function csvEstoque(ls: LinhaGeral[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const plan = COLUNAS.filter((c) => c.plano);
  const cab = ["Id_produto", "descricao", ...COLUNAS.map((c) => c.planilha), "Total", ...plan.map((c) => `Estado ${c.rot}`)];
  const corpo = ls.map((l) => [l.sku, l.descricao, ...COLUNAS.map((c) => String(l.celulas[c.k].qtd).replace(".", ",")), String(l.total).replace(".", ","), ...plan.map((c) => { const x = l.celulas[c.k]; return x.estado ? ROTULO[x.estado] : x.foraMeta ? "Fora da meta OOS" : "Fora do planejamento"; })]);
  return "\uFEFF" + [cab, ...corpo].map((r) => r.map(esc).join(";")).join("\r\n");
}
