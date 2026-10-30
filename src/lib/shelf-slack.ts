// Montagem das mensagens de Risco de Shelf para o Slack (puro, testável).

export type LoteSlack = {
  sku: string;
  descricao: string;
  lote: string;
  almoxarifado: string;
  data_validade: string | null;
  quantidade: number;
  custo_contabil: number; // valor total do lote (qtd × custo)
};

export function diasParaVencer(validade: string | null, hoje = new Date()): number | null {
  if (!validade) return null;
  const v = new Date(validade.slice(0, 10) + "T00:00:00Z").getTime();
  const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((v - h) / 86400000);
}

export function dataBR(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function almoxDosLotes(lotes: LoteSlack[]): string {
  return Array.from(new Set(lotes.map((l) => l.almoxarifado).filter(Boolean))).sort().join(", ");
}

export function tituloTrend(observacao: string, almox: string, data: Date): string {
  return `:warning: *Risco de Shelf* - ${observacao.trim()} - Almox - ${almox} - ${dataBR(data)}`;
}

export function totalCusto(lotes: LoteSlack[]): number {
  return Math.round(lotes.reduce((s, l) => s + (Number(l.custo_contabil) || 0), 0) * 100) / 100;
}

export function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function dividir<T>(arr: T[], tamanho = 40): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += tamanho) out.push(arr.slice(i, i + tamanho));
  return out;
}

function pad(s: string, n: number, dir: "l" | "r" = "r") {
  const t = s.length > n ? s.slice(0, n - 1) + "…" : s;
  return dir === "r" ? t.padEnd(n) : t.padStart(n);
}

/** Tabela monoespaçada (bloco de código no Slack). */
export function tabelaLotes(lotes: LoteSlack[], hoje = new Date()): string {
  const cab = `${pad("SKU", 11)} ${pad("Produto", 28)} ${pad("Lote", 20)} ${pad("Almox", 14)} ${pad("Validade", 10)} ${pad("Dias", 5, "l")} ${pad("Qtd", 9, "l")} ${pad("Custo contábil", 16, "l")}`;
  const linhas = lotes.map((l) => {
    const d = diasParaVencer(l.data_validade, hoje);
    const val = l.data_validade ? l.data_validade.slice(0, 10).split("-").reverse().join("/") : "—";
    return `${pad(l.sku, 11)} ${pad(l.descricao, 28)} ${pad(l.lote || "—", 20)} ${pad(l.almoxarifado, 14)} ${pad(val, 10)} ${pad(d == null ? "—" : String(d), 5, "l")} ${pad(l.quantidade.toLocaleString("pt-BR"), 9, "l")} ${pad(brl(l.custo_contabil), 16, "l")}`;
  });
  return "```\n" + [cab, "-".repeat(cab.length), ...linhas].join("\n") + "\n```";
}
