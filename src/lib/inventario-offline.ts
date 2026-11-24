// Fila offline da Contagem de Inventário: lançamentos feitos sem sinal ficam no aparelho
// e sobem na ordem em que foram feitos quando a conexão volta.
export type OpRegistrar = { tipo: "registrar"; chave: string; inv: string; item: string; fase: string; qtd: number | null; identificado: boolean | null; obs: string | null; em: string };
export type OpManual = { tipo: "manual"; chave: string; inv: string; codigo: string; lote: string; qtd: number; fase: string; identificado: boolean | null; em: string };
export type OpOffline = OpRegistrar | OpManual;

const KEY = "inv-offline-fila-v1";

/** Adiciona à fila; um novo valor para o mesmo item/fase/campo substitui o anterior (vale o último digitado). */
export function enfileirar(fila: OpOffline[], op: OpOffline): OpOffline[] {
  return [...fila.filter((o) => o.chave !== op.chave), op];
}
export function chaveRegistrar(item: string, fase: string, campo: "qtd" | "obs") { return `r:${item}:${fase}:${campo}`; }
export function chaveManual(inv: string, codigo: string, lote: string, fase: string) { return `m:${inv}:${codigo}:${lote.trim()}:${fase}`; }

/** Erro de rede (sem sinal) — esses lançamentos vão para a fila; erros de regra do servidor não. */
export function ehFalhaDeRede(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = String((err as any)?.message ?? err ?? "").toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed") || m.includes("load failed");
}

export function lerFila(): OpOffline[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function gravarFila(f: OpOffline[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(f));
  window.dispatchEvent(new Event("inv-offline-fila"));
}

/** Aplica os lançamentos pendentes sobre a lista carregada para a tela mostrar o que foi digitado offline. */
export function aplicarPendentes<T extends { id: string; qtd: number | null; observacao: string | null; identificado: boolean | null }>(linhas: T[], fila: OpOffline[], fase: string): T[] {
  const m = new Map(fila.filter((o): o is OpRegistrar => o.tipo === "registrar" && o.fase === fase).map((o) => [o.chave, o]));
  return linhas.map((l) => {
    const q = m.get(chaveRegistrar(l.id, fase, "qtd")), o = m.get(chaveRegistrar(l.id, fase, "obs"));
    if (!q && !o) return l;
    return { ...l, ...(q ? { qtd: q.qtd, identificado: q.identificado ?? l.identificado } : {}), ...(o ? { observacao: o.obs } : {}) };
  });
}

let enviando = false;
/** Envia a fila na ordem; para no primeiro erro de rede. Erros de regra descartam o lançamento e são reportados. */
export async function enviarFila(sb: any, onErroRegra: (msg: string) => void): Promise<number> {
  if (enviando) return 0; enviando = true; let ok = 0;
  try {
    for (;;) {
      const op = lerFila()[0]; if (!op) break;
      let r: any;
      try {
        r = op.tipo === "registrar"
          ? await sb.rpc("inv_registrar", { p_item: op.item, p_fase: op.fase, p_qtd: op.qtd, p_identificado: op.identificado, p_obs: op.obs })
          : await sb.rpc("inv_adicionar_manual", { p_inv: op.inv, p_codigo: op.codigo, p_lote: op.lote, p_qtd: op.qtd, p_fase: op.fase, p_identificado: op.identificado });
      } catch (e) { if (ehFalhaDeRede(e)) break; r = { error: e }; }
      if (r?.error && ehFalhaDeRede(r.error)) break;
      if (r?.error) onErroRegra(String(r.error.message ?? r.error)); else ok++;
      gravarFila(lerFila().filter((o) => !(o.chave === op.chave && o.em === op.em)));
    }
  } finally { enviando = false; }
  return ok;
}
