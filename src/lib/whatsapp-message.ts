export type MensagemQueimaInput = {
  descricao: string;
  precoVenda: number;
  precoComDesconto: number;
  quantidade: number;
  unidade?: string | null;
  dataValidade?: string | null;
  sku?: string | null;
  lote?: string | null;
};

function brl(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtd(v: number, unidade?: string | null) {
  const n = Number(v) || 0;
  const un = String(unidade ?? "").trim().toUpperCase();
  if (!un || un === "UN" || un === "PC") return String(Math.round(n));
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function dataBR(iso?: string | null) {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

/** Template da mensagem de queima de estoque enviada aos colaboradores. */
export function montarMensagemQueima(i: MensagemQueimaInput): string {
  return [
    "🍇ATENÇÃO COLABORADORES🍇",
    "",
    "🔥SUPER QUEIMA DE ESTOQUE🔥",
    "Confira:",
    "",
    `${i.descricao} 🍫`,
    ` -> De: R$ ${brl(i.precoVenda)}`,
    ` -> Por: R$ ${brl(i.precoComDesconto)}`,
    ` Estoque: ${qtd(i.quantidade, i.unidade)}`,
    ` Validade: ${dataBR(i.dataValidade)}`,
    "",
    "Estoque limitado!",
    "Corra antes que acabe! 🏃💨",
  ].join("\n");
}
