export function referenciaCentroCusto(motivo: string): "PRODUTO" | "CONTEXTO" | "ALMOX" {
  const nome = motivo.trim().toLocaleLowerCase("pt-BR");
  if (["descarte/descontinuado", "sensorial/inovações"].includes(nome)) return "PRODUTO";
  if (["cortesia", "degustação"].includes(nome)) return "CONTEXTO";
  return "ALMOX";
}

export function resolverCentroCusto(motivo: string, contexto?: string | null, almox?: string | null): string | null {
  const referencia = referenciaCentroCusto(motivo);
  if (referencia === "PRODUTO") return "P10008 - PRODUTO";
  return (referencia === "CONTEXTO" ? contexto : almox)?.trim() || null;
}

export function rotuloReferenciaCentroCusto(motivo: string): string {
  const referencia = referenciaCentroCusto(motivo);
  if (referencia === "PRODUTO") return "P10008 - PRODUTO";
  if (referencia === "CONTEXTO") return motivo.trim().toLocaleLowerCase("pt-BR") === "cortesia" ? "Área solicitante" : "Operação escolhida";
  return "Almoxarifado solicitante";
}