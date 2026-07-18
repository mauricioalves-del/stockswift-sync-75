// Utilidades do módulo Dispersão de Lote (Produção)
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "./xlsx-utils";


export type Faixas = { atencao: number; critico: number };
export const FAIXAS_DEFAULT: Faixas = { atencao: 5, critico: 15 };

export type Classificacao = "NORMAL" | "ATENCAO" | "CRITICO" | "NAO_PREVISTO";

/**
 * % Dispersão = (dif / previsto) * 100.
 * previsto=0 & consumo>0 -> "Consumo Não Previsto" (Infinity marcador — usar tipo abaixo).
 * previsto=0 & consumo=0 -> 0.
 */
export function percentualDispersao(dif: number, previsto: number, consumo: number): number | "NAO_PREVISTO" {
  if (previsto === 0) return consumo === 0 ? 0 : "NAO_PREVISTO";
  return (dif / previsto) * 100;
}

export function classificar(pct: number | "NAO_PREVISTO", faixas: Faixas = FAIXAS_DEFAULT): Classificacao {
  if (pct === "NAO_PREVISTO") return "NAO_PREVISTO";
  const abs = Math.abs(pct);
  if (abs <= faixas.atencao) return "NORMAL";
  if (abs <= faixas.critico) return "ATENCAO";
  return "CRITICO";
}

/** Retorna { perda, sobra } separadamente (perda = consumiu a mais; sobra = consumiu a menos). */
export function custoDesvio(dif: number, custoUnit: number): { perda: number; sobra: number } {
  const custo = dif * (custoUnit || 0);
  if (custo > 0) return { perda: custo, sobra: 0 }; // dif > 0 => consumiu MAIS que previsto (perda)
  return { perda: 0, sobra: -custo };
}

export function badgeCor(c: Classificacao): string {
  if (c === "NORMAL") return "bg-success/15 text-success border-success/30";
  if (c === "ATENCAO") return "bg-warning/15 text-warning border-warning/30";
  if (c === "CRITICO") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

export function labelClass(c: Classificacao): string {
  return c === "NORMAL" ? "Normal" : c === "ATENCAO" ? "Atenção" : c === "CRITICO" ? "Crítico" : "Não Previsto";
}

// ============= Import Planilhas =============

export type BomRow = {
  linha: number;
  id_produto: string; produto?: string;
  id_subconjunto?: string; subconjunto?: string;
  id_item: string; item?: string;
  qtd: number;
  tem_filho?: boolean; gera_oc?: boolean;
  linha_origem?: string; custo?: number; item_unidade?: string;
  status: "OK" | "ERRO"; erros: string[];
};

export type ConsumoRow = {
  linha: number;
  ano_mes: string; id_op: string;
  produto?: string; desc_produto?: string;
  material: string; desc_material?: string;
  um?: string;
  qtd_consumo: number; qtd_previsto: number;
  qtd_produzida?: number;
  status: "OK" | "ERRO"; erros: string[];
};

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  return pickCI(r, ...keys);
}

function num(s: string | number | undefined | null): number {
  if (s === null || s === undefined || s === "") return 0;
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  const raw = String(s).trim();
  if (!raw) return 0;
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  let normalized = raw;
  if (hasDot && hasComma) {
    // pt-BR: "1.234,56" — ponto é separador de milhar, vírgula é decimal
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "0,7" — vírgula é decimal
    normalized = raw.replace(",", ".");
  } // se só ponto, é decimal padrão — não mexer
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
function boolFrom(s: string): boolean { const v = s.toLowerCase(); return v === "sim" || v === "s" || v === "true" || v === "1"; }

function toAnoMes(s: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;
  const n = Number(s);
  if (!Number.isNaN(n) && n > 30000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  return "";
}

export function parseBomPlanilha(file: ArrayBuffer): BomRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" }));

  return rows.map((r, i) => {
    const id_produto = pick(r, "IDProduto", "ID_Produto", "id_produto");
    const id_item = pick(r, "IDItem", "ID_Item", "id_item");
    const qtd = num(pick(r, "Qtd", "QTD", "qtd", "Quantidade"));
    const erros: string[] = [];
    if (!id_produto) erros.push("IDProduto vazio");
    if (!id_item) erros.push("IDItem vazio");
    return {
      linha: i + 2,
      id_produto, produto: pick(r, "Produto", "produto"),
      id_subconjunto: pick(r, "IDSubconjunto", "id_subconjunto"),
      subconjunto: pick(r, "Subconjunto", "subconjunto"),
      id_item, item: pick(r, "Item", "item"),
      qtd,
      tem_filho: boolFrom(pick(r, "TemFilho", "tem_filho")),
      gera_oc: boolFrom(pick(r, "GeraOC", "gera_oc")),
      linha_origem: pick(r, "Linha", "LinhaOrigem", "linha_origem", "Origem"),
      custo: num(pick(r, "Custo", "custo")),
      item_unidade: pick(r, "Unidade", "ItemUnidade", "item_unidade", "UM"),
      status: erros.length ? "ERRO" : "OK",
      erros,
    };
  });
}

export function parseConsumoPlanilha(file: ArrayBuffer): ConsumoRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" }));
  return rows.map((r, i) => {
    const ano_mes = toAnoMes(pick(r, "AnoMes", "Ano_Mes", "ano_mes", "Período", "Periodo"));
    const id_op = pick(r, "IDOP", "ID_OP", "id_op", "OP");
    const material = pick(r, "Material", "material", "SKU");
    const qtd_consumo = num(pick(r, "QtdConsumo", "Qtd_Consumo", "qtd_consumo", "Consumo"));
    const qtd_previsto = num(pick(r, "QtdPrevisto", "Qtd_Previsto", "qtd_previsto", "Previsto"));
    const qtd_produzida_s = pick(r, "QtdProduzida", "Qtd_Produzida", "qtd_produzida", "Produzido");
    const erros: string[] = [];
    if (!ano_mes) erros.push("AnoMes inválido");
    if (!id_op) erros.push("IDOP vazio");
    if (!material) erros.push("Material vazio");
    return {
      linha: i + 2, ano_mes, id_op,
      produto: pick(r, "Produto", "produto"),
      desc_produto: pick(r, "DescProduto", "Desc_Produto", "desc_produto"),
      material, desc_material: pick(r, "DescMaterial", "Desc_Material", "desc_material"),
      um: pick(r, "UM", "um", "Unidade"),
      qtd_consumo, qtd_previsto,
      qtd_produzida: qtd_produzida_s ? num(qtd_produzida_s) : undefined,
      status: erros.length ? "ERRO" : "OK",
      erros,
    };
  });
}

export function gerarModeloBOM(): Blob {
  const aoa = [
    ["IDProduto", "Produto", "IDSubconjunto", "Subconjunto", "IDItem", "Item", "Qtd", "TemFilho", "GeraOC", "Linha", "Custo", "Unidade"],
    ["PROD-001", "Chocolate 70%", "SUB-001", "Massa base", "MAT-001", "Cacau em pó", 0.7, "Não", "Sim", "Xiba", 25.50, "KG"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "BOM");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function gerarModeloConsumo(): Blob {
  const aoa = [
    ["AnoMes", "IDOP", "Produto", "DescProduto", "Material", "DescMaterial", "UM", "QtdConsumo", "QtdPrevisto", "QtdProduzida"],
    ["2026-04", "OP-1001", "PROD-001", "Chocolate 70%", "MAT-001", "Cacau em pó", "KG", 72.5, 70, 100],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "CONSUMO");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const CAUSAS: Array<{ v: string; l: string }> = [
  { v: "FALHA_PROCESSO", l: "Falha de Processo" },
  { v: "ERRO_APONTAMENTO", l: "Erro de Pesagem/Apontamento" },
  { v: "VARIACAO_MATERIA_PRIMA", l: "Variação de Umidade/Matéria-prima" },
  { v: "FALHA_EQUIPAMENTO", l: "Falha de Equipamento" },
  { v: "FICHA_DESATUALIZADA", l: "Ficha Técnica Desatualizada" },
  { v: "OUTRO", l: "Outro" },
];

export const STATUS_ACAO: Array<{ v: string; l: string }> = [
  { v: "IDENTIFICADA", l: "Identificada" },
  { v: "EM_ANALISE", l: "Em Análise" },
  { v: "ACAO_DEFINIDA", l: "Ação Definida" },
  { v: "EM_ANDAMENTO", l: "Em Andamento" },
  { v: "CONCLUIDA", l: "Concluída" },
];

export function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
