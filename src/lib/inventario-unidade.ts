// Unidade de medida na contagem: KG e LT precisam saltar aos olhos para o time não
// contar peso/volume como se fosse unidade.
export type TomUnidade = "alerta" | "padrao";

/** Só as unidades de peso e volume declaradas pelo usuário ficam em destaque. */
const ALERTA = new Set(["KG", "KGS", "LT", "LTS"]);

/** "kg", " Kg. " e "KG" são a mesma unidade. */
export function normalizarUnidade(un: string | null | undefined): string {
  return String(un ?? "").trim().toUpperCase().replace(/[.\s]/g, "");
}

export function tomUnidade(un: string | null | undefined): TomUnidade {
  return ALERTA.has(normalizarUnidade(un)) ? "alerta" : "padrao";
}

/** Unidade do SKU: a primeira informada entre os lotes (lotes manuais podem chegar sem). */
export function unidadeDosLotes(linhas: { unidade?: string | null }[]): string {
  const achada = linhas.find((l) => String(l.unidade ?? "").trim() !== "")?.unidade;
  return String(achada ?? "").trim();
}
