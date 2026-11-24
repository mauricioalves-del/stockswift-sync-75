/** Cada SKU avaliado tem o mesmo peso; pendentes e contagens cegas não entram. */
export function acuracidadePorItem(itens: readonly { st: string }[]): number | null {
  const avaliados = itens.filter((item) => item.st === "ACURADO" || item.st === "DIVERGENTE");
  if (!avaliados.length) return null;
  const acurados = avaliados.filter((item) => item.st === "ACURADO").length;
  return Math.round((acurados / avaliados.length) * 1000) / 10;
}