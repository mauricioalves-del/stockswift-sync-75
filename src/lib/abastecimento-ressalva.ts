// Diálogo de Ressalvas do pedido: busca no catálogo aprovado, aviso de disponibilidade e totais das sugestões.
export type CatProduto = { sku: string; descricao: string; classe?: string | null };
export type SugRessalva = { id_produto: string; descricao: string; qtd: number; caixa?: number; fracionar?: boolean };
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
/** Aviso de disponibilidade; a aprovação comercial também valida o limite no banco. */
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

/** Disponível para sugestão extra: saldo do origem menos o que este mesmo pedido já leva do SKU (o saldo do banco só desconta os OUTROS pedidos). */
export function saldoParaExtra(saldo: SaldoProduto | null | undefined, qtdNoPedido: number): SaldoProduto | null {
  if (!saldo) return null;
  const ja = Math.max(0, Number(qtdNoPedido) || 0);
  return { ...saldo, reservado_outros: saldo.reservado_outros + ja, saldo_inicial: saldo.saldo_inicial - ja };
}
/** Caixa do produto: abast_produto.full_case (> 1, arredondado para cima); família vendida solta ou sem cadastro = 1. Mesma regra do motor. */
export function caixaDoProduto(fullCase: unknown, solto: boolean): number {
  if (solto) return 1;
  const fc = Number(fullCase);
  return Number.isFinite(fc) && fc > 1 ? Math.ceil(fc) : 1;
}
/** Origem com menos de uma caixa disponível: aceita o saldo solto (mesma regra da edição de itens e da alocação do CD). */
const modoSolto = (caixa: number, s: SaldoProduto | null | undefined) => !!s && caixa > 1 && s.saldo_inicial > 0 && s.saldo_inicial < caixa;
/** Quantidade inicial ao escolher o produto: uma caixa; com menos de uma caixa no origem, o saldo solto. */
export function qtdInicial(caixa: number, s: SaldoProduto | null | undefined): number {
  return s && modoSolto(caixa, s) ? Math.floor(s.saldo_inicial) : caixa;
}
/** Botões − / +: anda uma caixa (ou 1 un no saldo solto), sem passar do disponível nem ficar abaixo do mínimo. */
export function passoQtd(atual: number | null, d: number, caixa: number, s: SaldoProduto | null | undefined, fracionar = false): number {
  if (fracionar || modoSolto(caixa, s)) {
    const n = Math.max(1, (atual ?? 0) + d);
    return s ? Math.max(0, Math.min(s.saldo_inicial, n)) : n;
  }
  const base = atual && atual > 0 ? (d > 0 ? Math.floor(atual / caixa) : Math.ceil(atual / caixa)) * caixa : 0;
  let n = Math.max(caixa, base + d * caixa);
  if (s && s.saldo_inicial >= caixa) n = Math.min(n, Math.floor(s.saldo_inicial / caixa) * caixa);
  return n;
}
/** Erro que impede adicionar/enviar a sugestão (caixa fechada e disponível no CD). null = ok. Sem saldo conhecido, vale só a caixa. */
export function erroQtdExtra(qtd: number | null, caixa: number, s: SaldoProduto | null | undefined, fracionar = false): string | null {
  if (!qtd || !Number.isFinite(qtd) || !(qtd > 0)) return "Informe uma quantidade maior que zero.";
  if (s && s.saldo_inicial <= 0) return "Sem estoque disponível no CD.";
  if (s && qtd > s.saldo_inicial) return `Acima do disponível no CD: ${Math.max(0, s.saldo_inicial)} un${caixa > 1 ? (s.saldo_inicial >= caixa ? ` (${Math.floor(s.saldo_inicial / caixa)} cx)` : " (menos de uma caixa)") : ""}.`;
  if (!fracionar && caixa > 1 && qtd % caixa !== 0 && !modoSolto(caixa, s)) return `A quantidade deve ser múltiplo da caixa (${caixa} un).`;
  return null;
}
