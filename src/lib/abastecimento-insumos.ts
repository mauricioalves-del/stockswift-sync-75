import { chaveSku, type CatProduto } from "./abastecimento-ressalva";
import { nomeValido } from "./abastecimento-nome-sistema";

export const GRUPOS_INSUMOS = [
  { valor: "Mercadoria de Revenda", nome: "Produtos de revenda" },
  { valor: "Embalagem", nome: "Embalagens" },
  { valor: "Materia Prima", nome: "Matérias-primas" },
] as const;
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const grupoInsumo = (v: string) => GRUPOS_INSUMOS.find((g) => normalizar(g.valor) === normalizar(v))?.valor ?? null;
export type ProdutoPedido = CatProduto & { grupo?: string; aprovado: boolean };

/** Extra operational supplies are independent from the immutable planning portfolio. System (native stock) names prevail. */
export function catalogoComInsumos(
  aprovado: CatProduto[],
  grupos: { codigo_produto: string; grupo: string }[],
  estoque: { id_produto: string; descricao?: string | null }[],
  registrado: { id_produto: string; descricao?: string | null }[] = [],
): ProdutoPedido[] {
  const sistema = new Map<string, string>();
  for (const e of estoque) {
    const nome = nomeValido(e.id_produto, e.descricao);
    const k = chaveSku(e.id_produto.trim());
    if (nome && !sistema.has(k)) sistema.set(k, nome);
  }
  const reg = new Map<string, string>();
  for (const e of registrado) {
    const nome = nomeValido(e.id_produto, e.descricao);
    if (nome) reg.set(chaveSku(e.id_produto.trim()), nome);
  }
  const nomeDe = (sku: string, atual?: string | null) => { const k = chaveSku(sku.trim()); return sistema.get(k) ?? nomeValido(sku, atual) ?? reg.get(k) ?? sku.trim(); };
  const porSku = new Map<string, ProdutoPedido>(aprovado.map((c) => [chaveSku(c.sku.trim()), { ...c, descricao: nomeDe(c.sku, c.descricao), aprovado: true }]));
  for (const g of grupos) {
    const grupo = grupoInsumo(g.grupo);
    if (!grupo) continue;
    const k = chaveSku(g.codigo_produto.trim());
    const atual = porSku.get(k);
    const sku = atual?.sku ?? g.codigo_produto.trim();
    porSku.set(k, { sku, descricao: nomeDe(sku, atual?.descricao), aprovado: atual?.aprovado ?? false, grupo });
  }
  return [...porSku.values()];
}
