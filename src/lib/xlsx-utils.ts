// Utilidades compartilhadas para parsers de planilhas.
// Motivação: cabeçalhos reais dos usuários frequentemente vêm com espaços
// extras (" custo ") ou variações de caixa ("Custo" vs "custo"). Todo parser
// deve tolerar essas variações — o usuário não precisa "limpar" o arquivo.

/**
 * Para cada linha, adiciona aliases de chave normalizados (trim + lowercase),
 * preservando as chaves originais. Assim, tanto `r["Custo"]` quanto
 * `r["custo"]`, `r[" Custo "]`, etc. resolvem ao mesmo valor.
 */
export function normalizeSheetRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      const trimmed = k.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed !== k && r[trimmed] === undefined) (r as any)[trimmed] = r[k];
      if (lower !== k && r[lower] === undefined) (r as any)[lower] = r[k];
    }
  }
  return rows;
}

/**
 * Busca tolerante: tenta as chaves exatas primeiro; depois cai para uma
 * comparação por trim+lowercase varrendo as chaves reais da linha.
 */
export function pickCI(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  const norm = new Map<string, string>();
  for (const kk of Object.keys(r)) norm.set(kk.trim().toLowerCase(), kk);
  for (const k of keys) {
    const orig = norm.get(k.trim().toLowerCase());
    if (orig != null) {
      const v = r[orig];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}
