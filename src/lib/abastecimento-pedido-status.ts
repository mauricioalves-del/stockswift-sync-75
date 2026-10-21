type PedidoStatus = { status: string; historico_status?: string[]; aprov_comercial_em?: string | null; aprov_diretor_em?: string | null; itens: { qtd_separada: number | null }[] };

/** Compatibility with orders recorded before retirement of director approval. */
export const statusPedido = (status: string) => status === "AGUARD_DIRETOR" ? "AGUARD_COMERCIAL" : status;

export function statusAnterior(p: PedidoStatus): string | null {
  const anterior = p.historico_status?.at(-1);
  if (anterior) return statusPedido(anterior);
  switch (p.status) {
    case "AGUARD_DIRETOR": return "AGUARD_COMERCIAL";
    case "ABERTO": return p.aprov_comercial_em || p.aprov_diretor_em ? "AGUARD_COMERCIAL" : null;
    case "EM_SEPARACAO": return "ABERTO";
    case "SEPARADO": return "EM_SEPARACAO";
    case "ENVIADO": return p.itens.some(i => Number(i.qtd_separada) > 0) ? "SEPARADO" : "ABERTO";
    case "RECEBIDO": return "ENVIADO";
    default: return null;
  }
}