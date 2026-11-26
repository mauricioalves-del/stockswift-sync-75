export type SinalLote = "NEG" | "POS" | "OK";

/** Sinalização visual exata, independente da tolerância do indicador por SKU. */
export function sinalLote(concluido: boolean, quantidade: number | null, sistema: number | null): SinalLote | null {
  if (!concluido || quantidade == null || sistema == null) return null;
  return quantidade < sistema ? "NEG" : quantidade > sistema ? "POS" : "OK";
}

export function validarSinalLote(sinal: unknown): SinalLote | null {
  return sinal === "NEG" || sinal === "POS" || sinal === "OK" ? sinal : null;
}