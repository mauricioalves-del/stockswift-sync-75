// Ordenação e filtro por coluna (estilo grid do ERP): clique no título para ordenar, ícone de filtro em cada coluna.
// Regras:
//   - número: 1º clique = MAIOR para MENOR; 2º = menor para maior; 3º = volta à ordem padrão. Vazio fica sempre por último.
//   - texto/categoria: 1º clique = A→Z; 2º = Z→A; 3º = ordem padrão.
//   - filtros de colunas diferentes se combinam (E).
export type TipoCol = "txt" | "cat" | "num";
export type Filtro = { txt?: string; vals?: string[]; min?: string; max?: string };
export type Ordem = { k: string; dir: "asc" | "desc" } | null;
export type ColDef<T> = { k: string; r: string; t: TipoCol; v: (x: T) => string | number | null | undefined; al?: "right" };

export function numero(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.trim().replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
  const n2 = Number(s.trim().replace(",", "."));
  const v = Number.isFinite(n2) ? n2 : n;
  return Number.isFinite(v) ? v : null;
}

export function filtroAtivo(f: Filtro | undefined): boolean {
  if (!f) return false;
  return !!(f.txt && f.txt.trim()) || f.vals !== undefined || (f.min !== undefined && f.min.trim() !== "") || (f.max !== undefined && f.max.trim() !== "");
}

export function passaFiltros<T>(x: T, cols: ColDef<T>[], filtros: Record<string, Filtro>): boolean {
  for (const c of cols) {
    const f = filtros[c.k];
    if (!filtroAtivo(f)) continue;
    const v = c.v(x);
    if (c.t === "txt") {
      if (f!.txt && f!.txt.trim() && !String(v ?? "").toLowerCase().includes(f!.txt.trim().toLowerCase())) return false;
    } else if (c.t === "cat") {
      if (f!.vals !== undefined && !f!.vals.includes(String(v ?? ""))) return false;
    } else {
      const n = v === null || v === undefined || v === "" ? null : Number(v);
      const mi = numero(f!.min), ma = numero(f!.max);
      if (mi !== null && (n === null || n < mi)) return false;
      if (ma !== null && (n === null || n > ma)) return false;
    }
  }
  return true;
}

/** Próximo estado da ordem ao clicar no título da coluna. */
export function proximaOrdem(atual: Ordem, col: { k: string; t: TipoCol }): Ordem {
  const primeira: "asc" | "desc" = col.t === "num" ? "desc" : "asc";
  if (!atual || atual.k !== col.k) return { k: col.k, dir: primeira };
  if (atual.dir === primeira) return { k: col.k, dir: primeira === "desc" ? "asc" : "desc" };
  return null;
}

/** Comparador da coluna na direção pedida (vazios sempre no fim). */
export function comparar<T>(a: T, b: T, col: ColDef<T>, dir: "asc" | "desc"): number {
  const va = col.v(a), vb = col.v(b);
  const na = va === null || va === undefined || va === "", nb = vb === null || vb === undefined || vb === "";
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  const c = col.t === "num" ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

export function opcoesCategoria<T>(itens: T[], col: ColDef<T>): { valor: string; n: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) { const v = String(col.v(i) ?? ""); m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { sensitivity: "base" }));
}
