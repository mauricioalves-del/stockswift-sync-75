// Contagem de Inventário — separação da lista entre inventários em aberto e finalizados.
// Um inventário só sai da lista "em aberto" quando chega a um status de encerramento
// (finalizado) ou quando é cancelado; todos os estágios intermediários continuam abertos.

export type GrupoInventario = "aberto" | "finalizado";

const STATUS_FECHADOS = new Set(["finalizado", "cancelado"]);

export function grupoInventario(status: string | null | undefined): GrupoInventario {
  return STATUS_FECHADOS.has(String(status ?? "").trim().toLowerCase()) ? "finalizado" : "aberto";
}

export function dividirInventarios<T extends { status: string | null | undefined }>(inv: T[]) {
  const abertos: T[] = [];
  const finalizados: T[] = [];
  for (const i of inv) (grupoInventario(i.status) === "aberto" ? abertos : finalizados).push(i);
  return { abertos, finalizados };
}
