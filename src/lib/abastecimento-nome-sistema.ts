import { chaveSku } from "./abastecimento-ressalva";

/** Nome válido: não vazio e diferente do próprio SKU. */
export function nomeValido(sku: string, descricao?: string | null): string | undefined {
  const nome = descricao?.trim();
  if (!nome || chaveSku(nome) === chaveSku(String(sku ?? "").trim())) return undefined;
  return nome;
}

/** Descrição do sistema (estoque nativo) por SKU normalizado; a primeira descrição válida de cada SKU vale. */
export function mapaNomesSistema(linhas: { id_produto: string; descricao?: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of linhas) {
    const k = chaveSku(String(l.id_produto ?? "").trim());
    const nome = nomeValido(l.id_produto, l.descricao);
    if (k && nome && !m.has(k)) m.set(k, nome);
  }
  return m;
}

/** A descrição do sistema prevalece; sem ela, usa a descrição guardada. */
export function nomeDoSistema(sku: string, guardada: string | null | undefined, sistema: Map<string, string>): string | null {
  return sistema.get(chaveSku(String(sku ?? "").trim())) ?? guardada ?? null;
}

/** Formas do código no estoque nativo (com e sem zeros à esquerda: 8 e 10 dígitos). */
export function variantesSku(sku: string): string[] {
  const s = String(sku ?? "").trim(), k = chaveSku(s);
  return [...new Set([s, k, k.padStart(8, "0"), k.padStart(10, "0")].filter(Boolean))];
}
