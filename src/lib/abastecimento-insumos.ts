import { chaveSku, type CatProduto } from "./abastecimento-ressalva";

export const GRUPOS_INSUMOS = [
  { valor: "Mercadoria de Revenda", nome: "Produtos de revenda" },
  { valor: "Embalagem", nome: "Embalagens" },
  { valor: "Materia Prima", nome: "Matérias-primas" },
] as const;
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const grupoInsumo = (v: string) => GRUPOS_INSUMOS.find((g) => normalizar(g.valor) === normalizar(v))?.valor ?? null;
export type ProdutoPedido = CatProduto & { grupo?: string; aprovado: boolean };

/** A SKU repeated as its description is not a registered product name. */
function nomeValido(sku: string, descricao?: string | null): string | undefined {
  const nome = descricao?.trim();
  if (!nome || chaveSku(nome) === chaveSku(sku.trim())) return undefined;
  return nome;
}

/** Extra operational supplies are independent from the immutable planning portfolio. */
export function catalogoComInsumos(
  aprovado: CatProduto[],
  grupos: { codigo_produto: string; grupo: string }[],
  estoque: { id_produto: string; descricao?: string | null }[],
  registrado: { id_produto: string; descricao?: string | null }[] = [],
): ProdutoPedido[] {
  const nomes = new Map<string, string>();
  for (const e of [...estoque, ...registrado]) {
    const nome = nomeValido(e.id_produto, e.descricao);
    if (nome) nomes.set(chaveSku(e.id_produto.trim()), nome);
  }
  const porSku = new Map<string, ProdutoPedido>(aprovado.map((c) => [chaveSku(c.sku.trim()), { ...c, descricao: nomeValido(c.sku, c.descricao) ?? nomes.get(chaveSku(c.sku.trim())) ?? c.sku, aprovado: true }]));
  for (const g of grupos) {
    const grupo = grupoInsumo(g.grupo);
    if (!grupo) continue;
    const k = chaveSku(g.codigo_produto.trim());
    const atual = porSku.get(k);
    porSku.set(k, { sku: atual?.sku ?? g.codigo_produto.trim(), descricao: nomeValido(atual?.sku ?? g.codigo_produto, atual?.descricao) ?? nomes.get(k) ?? g.codigo_produto.trim(), aprovado: atual?.aprovado ?? false, grupo });
  }
  return [...porSku.values()];
}