// Nome curto de loja/almoxarifado para botões e títulos apertados (ex.: "Loja Patio Paulista" → "L. Patio").
// Regras: CD/almoxarifado central vira "CD"; "Loja X ..." vira "L. X", truncando a primeira palavra em 4 letras quando ela tem mais de 5.
// O nome completo continua no tooltip (title) de cada botão.
export function nomeCurtoLoja(codigo: string, nome?: string | null): string {
  const n = (nome ?? "").trim();
  if (!n) return codigo || "—";
  if (codigo.toUpperCase() === "CD" || /almox|centro de distribui|f[aá]brica|\bcd\b/i.test(n)) return "CD";
  const semPrefixo = n.replace(/^(loja|l)\.?\s+/i, "");
  const primeira = (semPrefixo.split(/\s+/)[0] ?? semPrefixo).replace(/[.,;:]$/, "");
  return `L. ${primeira.length > 5 ? primeira.slice(0, 4) : primeira}`;
}
