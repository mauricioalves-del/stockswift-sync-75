// Regras de Preço de Venda e do desconto para colaborador (Shelf Life).
// Funções puras — reutilizáveis no Modal de Ação e em relatórios.

export const PERCENTUAL_DESCONTO_PADRAO = 60;

/** Normaliza SKU como texto, preservando zeros à esquerda. */
export function normalizarSku(v: unknown): string {
  return String(v ?? "").trim();
}

export function chaveSku(v: unknown): string {
  return normalizarSku(v).toUpperCase();
}

/** Converte números vindos de planilha (1.234,56 / R$ 10,00 / 10.5). */
export function parseNumeroBR(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/R\$\s*/gi, "").replace(/%/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseBooleanBR(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return true;
  return ["sim", "s", "true", "1", "ativo", "x", "yes"].includes(s);
}

/** Preço final com o desconto de colaborador aplicado. */
export function calcularPrecoComDesconto(precoVenda: number, percentualDesconto: number): number {
  const pv = Number(precoVenda) || 0;
  const pct = Number(percentualDesconto);
  const p = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : PERCENTUAL_DESCONTO_PADRAO;
  return Math.round(pv * (1 - p / 100) * 100) / 100;
}

/** Identifica o tipo de ação "Desconto Colaborador" pelo nome cadastrado. */
export function ehDescontoColaborador(nomeTipo: string | null | undefined): boolean {
  const s = String(nomeTipo ?? "").trim().toLowerCase();
  return s.includes("desconto") && s.includes("colaborador");
}

export type PrecoVendaRow = {
  id: string;
  sku: string;
  descricao: string | null;
  prod_ref1: string | null;
  pr_venda: number;
  marca: string | null;
  pr_sugerido: number | null;
  vl_custo: number | null;
  percentual_desconto_tabela: number | null;
  percentual_margem: number | null;
  margem_real: number | null;
  ativo: boolean;
  atualizado_em: string;
};
