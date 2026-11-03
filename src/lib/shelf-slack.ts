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

export function tituloTrend(observacao: string, almox: string, data: Date, numero?: number | null): string {
  const n = numero ? ` #${numero}` : "";
  return `:warning: *Risco de Shelf${n}* - ${observacao.trim()} - Almox - ${almox} - ${dataBR(data)}`;
}

// ---------- Rastreio de envios: evita abrir duas Trends para o mesmo lote ----------
export type EnvioSlack = {
  id: string; numero: number; link: string | null; created_at: string; observacao: string;
  lotes: { sku: string; lote: string; almoxarifado: string }[];
};

/** Mesma chave usada na seleção da tela: SKU | lote | almoxarifado. */
export const chaveEnvio = (l: { sku: string; lote: string | null; almoxarifado: string | null }) =>
  `${String(l.sku ?? "").trim()}|${String(l.lote ?? "").trim()}|${String(l.almoxarifado ?? "").trim()}`;

/** Índice lote → envios que já o incluíram (mais recente primeiro). */
export function indexarEnviosPorLote(envios: EnvioSlack[] | null | undefined): Map<string, EnvioSlack[]> {
  const idx = new Map<string, EnvioSlack[]>();
  for (const e of envios ?? []) {
    for (const l of e.lotes ?? []) {
      const k = chaveEnvio(l);
      const lista = idx.get(k) ?? [];
      if (!lista.some((x) => x.id === e.id)) lista.push(e);
      idx.set(k, lista);
    }
  }
  for (const lista of idx.values()) lista.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.numero - a.numero);
  return idx;
}

/** Separa os lotes escolhidos entre novos e já enviados em alguma Trend. */
export function separarJaEnviados<T extends { sku: string; lote: string; almoxarifado: string }>(lotes: T[], idx: Map<string, EnvioSlack[]>) {
  const novos: T[] = [], enviados: { lote: T; envio: EnvioSlack }[] = [];
  for (const l of lotes) {
    const e = idx.get(chaveEnvio(l))?.[0];
    if (e) enviados.push({ lote: l, envio: e }); else novos.push(l);
  }
  return { novos, enviados };
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
