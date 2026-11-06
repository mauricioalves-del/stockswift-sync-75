import { destinoNota, nk } from "./abastecimento-dados";

export type NotaTransitoMissao = {
  cod_prod: string | null; almox: string | null; qtd: number | null;
  nr_nf: string | null; lote: string | null; recebimento: string | null;
  nota_cancelada: string | null;
};
export type TransitoMissao = { qtd: number; notas: number; detalhes: string[] };
type Loja = { codigo: string; almoxarifado: string };
const normalizarAlmox = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Informação de conferência: nunca integra o saldo congelado nem a divergência. */
export function somarTransitoMissao(
  notas: NotaTransitoMissao[], origem: string | null, skus: string[], lojas: Loja[], cd: string,
): Map<string, TransitoMissao> {
  const out = new Map<string, TransitoMissao>();
  if (!origem) return out;
  const universo = new Set(skus.map(nk));
  const nfs = new Map<string, Set<string>>();
  for (const n of notas) {
    if (n.recebimento !== "Pendente" || n.nota_cancelada === "S") continue;
    const sku = nk(n.cod_prod), qtd = Number(n.qtd);
    if (!sku || !universo.has(sku) || !Number.isFinite(qtd) || qtd <= 0) continue;
    const almox = String(n.almox ?? "");
    const destino = destinoNota(normalizarAlmox(almox));
    const destinoAlmox = destino === "CD" ? cd : lojas.find((l) => l.codigo === destino)?.almoxarifado;
    if (normalizarAlmox(almox) !== normalizarAlmox(origem) &&
      (!destinoAlmox || normalizarAlmox(destinoAlmox) !== normalizarAlmox(origem))) continue;
    const cur = out.get(sku) ?? { qtd: 0, notas: 0, detalhes: [] };
    cur.qtd += qtd;
    const set = nfs.get(sku) ?? new Set<string>();
    set.add(String(n.nr_nf ?? "(sem NF)"));
    nfs.set(sku, set);
    cur.notas = set.size;
    cur.detalhes.push(`NF ${n.nr_nf ?? "—"} · Lote ${n.lote || "—"}: ${qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}`);
    out.set(sku, cur);
  }
  return out;
}