import { chaveSku, type CatProduto } from "./abastecimento-ressalva";

export const GRUPOS_INSUMOS = [
  { valor: "Mercadoria de Revenda", nome: "Produtos de revenda" },
  { valor: "Embalagem", nome: "Embalagens" },
  { valor: "Materia Prima", nome: "Matérias-primas" },
] as const;
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const grupoInsumo = (v: string) => GRUPOS_INSUMOS.find((g) => normalizar(g.valor) === normalizar(v))?.valor ?? null;
export type ProdutoPedido = CatProduto & { grupo?: string; aprovado: boolean };

/** Extra operational supplies are independent from the immutable planning portfolio. */
export function catalogoComInsumos(
  aprovado: CatProduto[],
  grupos: { codigo_produto: string; grupo: string }[],
  estoque: { id_produto: string; descricao?: string | null }[],
): ProdutoPedido[] {
  const nomes = new Map(estoque.filter((e) => e.descricao).map((e) => [chaveSku(e.id_produto), String(e.descricao)]));
  const porSku = new Map<string, ProdutoPedido>(aprovado.map((c) => [chaveSku(c.sku), { ...c, aprovado: true }]));
  for (const g of grupos) {
    const grupo = grupoInsumo(g.grupo);
    if (!grupo) continue;
    const k = chaveSku(g.codigo_produto);
    const atual = porSku.get(k);
    porSku.set(k, { sku: atual?.sku ?? g.codigo_produto, descricao: atual?.descricao ?? nomes.get(k) ?? g.codigo_produto, aprovado: atual?.aprovado ?? false, grupo });
  }
  return [...porSku.values()];
}