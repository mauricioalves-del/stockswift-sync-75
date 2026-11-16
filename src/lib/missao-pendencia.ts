/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export const hojeBR = (d: Date = new Date()): string =>
  d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const maisUmDia = (data: string): string => {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};

/**
 * A pendência de contagem pode ser confirmada (missão encerrada sem contagem)
 * a partir de 1 dia após a data de execução, se a missão ainda não foi concluída nem cancelada.
 * Mesma regra é validada no banco.
 */
export function podeConfirmarPendencia(
  m: { status: string; data_execucao: string | null },
  hoje: string = hojeBR(),
): boolean {
  if (!m.data_execucao) return false;
  if (m.status === "CONCLUIDA" || m.status === "CANCELADA") return false;
  return maisUmDia(m.data_execucao) <= hoje;
}
