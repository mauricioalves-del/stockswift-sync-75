// Diálogo de Ressalvas do pedido: busca no catálogo aprovado, aviso de disponibilidade e totais das sugestões.
export type CatProduto = { sku: string; descricao: string; classe?: string | null };
export type SugRessalva = { id_produto: string; descricao: string; qtd: number };
export type SaldoProduto = { estoque: number; reservado_outros: number; saldo_inicial: number };

/** Chave do SKU: sem zeros à esquerda (o mesmo SKU aparece com e sem zero nas bases). */
export const chaveSku = (s: string) => String(s ?? "").replace(/^0+/, "");
const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Catálogo filtrado: todos os termos da busca (sem acento) em SKU ou descrição, sem os já sugeridos. SKU que começa com a busca vem primeiro. */
export function filtrarCatalogo(cat: CatProduto[], busca: string, jaSugeridos: Set<string>, limite = 80): CatProduto[] {
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  const q = chaveSku(busca.trim());
  const ok = cat.filter((c) => !jaSugeridos.has(chaveSku(c.sku)) && termos.every((t) => norm(c.sku).includes(t) || norm(c.descricao).includes(t)));
  const peso = (c: CatProduto) => (q && chaveSku(c.sku).startsWith(q) ? 0 : 1);
  return ok.sort((a, b) => peso(a) - peso(b) || a.descricao.localeCompare(b.descricao, "pt-BR", { sensitivity: "base" })).slice(0, limite);
}
export function resumoSugestoes(s: SugRessalva[]): { produtos: number; unidades: number } {
  return { produtos: s.length, unidades: s.reduce((a, x) => a + (Number.isFinite(x.qtd) ? x.qtd : 0), 0) };
}
/** Quantidade digitada (aceita vírgula). null = inválida. */
export function qtdValida(texto: string): number | null {
  const n = Number(String(texto ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** Aviso (não bloqueia: quem decide é o Diretor) quando a sugestão passa do que há disponível no origem. */
export function avisoDisponibilidade(qtd: number, saldo: SaldoProduto | null | undefined): string | null {
  if (!saldo || !(qtd > 0)) return null;
  if (saldo.saldo_inicial <= 0) return "Sem estoque disponível no origem";
  if (qtd > saldo.saldo_inicial) return `Acima do disponível no origem (${saldo.saldo_inicial} un)`;
  return null;
}
/** Resultado de abast_saldo_produtos → mapa por SKU (sem zeros). Sem resposta: mapa vazio (a tela segue sem a informação). */
export function mapaSaldos(rows: any[] | null | undefined): Map<string, SaldoProduto> {
  return new Map((rows ?? []).map((r) => [chaveSku(String(r.sku)), { estoque: Number(r.estoque ?? 0), reservado_outros: Number(r.reservado_outros ?? 0), saldo_inicial: Number(r.saldo_inicial ?? 0) }]));
}
