/** Mesmos estados da Fila de Aprovação de Baixas Operacionais. */
export const BAIXAS_EM_ABERTO = ["PENDENTE", "ANALISE", "AJUSTE_SOLICITADO", "AGUARDANDO_ADMIN"];
export type BaixaReposicao = { codigo_produto: string; id_local: string | null; quantidade: number; status_fluxo: string; data_execucao?: string | null };
const normalizar = (s: string) => s.trim().replace(/^0+/, "");
export const chaveSaldoBaixa = (sku: string, almox: string) => `${almox}|${normalizar(sku)}`;
export function somarBaixasEmAberto(baixas: BaixaReposicao[], skuSaldo: (sku: string) => string = normalizar): Map<string, number> {
  const totais = new Map<string, number>();
  for (const b of baixas) {
    const q = Number(b.quantidade);
    if (!b.id_local || b.data_execucao || !BAIXAS_EM_ABERTO.includes(b.status_fluxo) || !Number.isFinite(q) || q <= 0) continue;
    const k = chaveSaldoBaixa(skuSaldo(b.codigo_produto), b.id_local);
    totais.set(k, (totais.get(k) ?? 0) + q);
  }
  return totais;
}
export const saldoLiquidoBaixas = (estoque: number, baixas: number) => Math.max(0, estoque - baixas);
