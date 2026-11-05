// Farol de Processo · Conferência de Movimentados (almoxarifados Fábrica, Processo, Qualidade e Pará).
// Movimentado = união de todas as bases de movimentação ativas: livro-caixa do Atlas (atlas_movimentacoes_brutas e
// atlas_dias_operacionais), planilha diária do ERP (movimentacoes_diarias) e movimentação por lote (atlas_movimentacoes_lote_diaria).
// Conciliado = o mesmo registro do indicador de Movimentados do Atlas: item sem divergência (atlas_movimentacoes_historico)
// ou com divergência (atlas_divergencias de origem movimentação). Conferências registradas no farol gravam nessas tabelas.
// Regra: todo dia útil com movimentação no almox precisa da conciliação dos itens movimentados até o dia útil seguinte (D+1).

export const ALMOX_FAROL = [
  { id: "FABRICA", nome: "Fábrica", atlas: "Almox_SP_Fabrica" },
  { id: "PROCESSO", nome: "Processo", atlas: "Almox_SP_Processo" },
  { id: "QUALIDADE", nome: "Qualidade", atlas: "Almox_SP_Qualidade" },
  { id: "PARA", nome: "Pará", atlas: "Almox_PA_Para" },
] as const;
export type AlmoxFarol = (typeof ALMOX_FAROL)[number]["id"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/** Identifica o almoxarifado do farol pelo nome vindo do ERP (Desc_Almox). Null = fora do processo. */
export function almoxDoFarol(descAlmox: string | null | undefined): AlmoxFarol | null {
  const s = semAcento(String(descAlmox ?? "")).replace(/[^A-Z0-9]+/g, " ");
  if (!s.trim()) return null;
  if (/PROCESSO/.test(s)) return "PROCESSO";
  if (/QUALIDADE/.test(s)) return "QUALIDADE";
  if (/FABRICA/.test(s)) return "FABRICA";
  if (/\bPARA\b|\bPA\b|\bBELEM\b/.test(s)) return "PARA";
  return null;
}

/** "AAAA-MM-DD" no fuso de São Paulo. */
export function diaSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 dom … 6 sáb
export const ehDiaUtil = (dia: string) => { const w = diaSemana(dia); return w >= 1 && w <= 5; };

/** Prazo da conferência: próximo dia útil após o movimento (D+1 útil). */
export function prazoConferencia(diaMov: string): string {
  let d = somaDias(diaMov, 1);
  while (!ehDiaUtil(d)) d = somaDias(d, 1);
  return d;
}

/** Segunda a sexta da semana que contém o dia. */
export function diasDaSemana(dia: string): string[] {
  const w = diaSemana(dia); const seg = somaDias(dia, w === 0 ? -6 : 1 - w);
  return [0, 1, 2, 3, 4].map((i) => somaDias(seg, i));
}
export const semanaAnterior = (dia: string) => somaDias(diasDaSemana(dia)[0], -7);
export const proximaSemana = (dia: string) => somaDias(diasDaSemana(dia)[0], 7);

export type MovLinha = { data: string; desc_almox: string; id_produto: string; descricao: string | null; qtd: number; id_lote?: string | null; desc_movimento?: string | null; saldo?: number | null };
export type ItemMov = { sku: string; descricao: string; qtd: number; lotes: string[]; movimentos: number; saldo: number | null };
export type ItemConferido = ItemMov & { status: "OK" | "DIVERGENTE" | "NAO_CONFERIDO"; qtd_contada?: number | null; obs?: string | null };
export type Conferencia = {
  id: string; almox: AlmoxFarol; data_movimento: string; conferido_em: string; conferente_nome: string | null;
  itens_movimentados: number; itens_conferidos: number; divergentes: number; observacao: string | null; itens: ItemConferido[];
};

/** Itens movimentados por almox e dia (SKU distinto, quantidade absoluta somada). */
export function movimentosPorDia(linhas: MovLinha[]): Map<string, ItemMov[]> {
  const acc = new Map<string, Map<string, ItemMov>>();
  for (const l of linhas) {
    const a = almoxDoFarol(l.desc_almox); if (!a) continue;
    const k = `${a}|${diaSP(l.data)}`; const sku = String(l.id_produto ?? "").trim(); if (!sku) continue;
    const m = acc.get(k) ?? new Map<string, ItemMov>();
    const it = m.get(sku) ?? { sku, descricao: l.descricao ?? "", qtd: 0, lotes: [], movimentos: 0, saldo: null };
    it.qtd += Math.abs(Number(l.qtd) || 0); it.movimentos++;
    if (l.saldo != null) it.saldo = Number(l.saldo); // saldo do sistema após o último movimento do dia (livro-caixa)
    if (!it.descricao && l.descricao) it.descricao = l.descricao;
    if (l.id_lote && !it.lotes.includes(l.id_lote)) it.lotes.push(l.id_lote);
    m.set(sku, it); acc.set(k, m);
  }
  const out = new Map<string, ItemMov[]>();
  for (const [k, m] of acc) out.set(k, [...m.values()].sort((x, y) => x.sku.localeCompare(y.sku, undefined, { numeric: true })));
  return out;
}

/** Registro de conciliação do Atlas (indicador de Movimentados). em = quando foi registrado (null = sem horário). */
export type ConcLinha = { almoxarifado: string; data: string; sku: string; divergente: boolean; em: string | null };
export type ConcDia = Map<string, { divergente: boolean; em: string | null }>;
export const chaveSku = (s: string) => String(s ?? "").trim().replace(/^0+/, "");

/** Conciliação por almox e dia: SKU → divergente? (divergência prevalece sobre registro sem divergência). */
export function conciliacaoPorDia(linhas: ConcLinha[]): Map<string, ConcDia> {
  const out = new Map<string, ConcDia>();
  for (const l of linhas) {
    const a = almoxDoFarol(l.almoxarifado); if (!a || !l.data) continue;
    const k = `${a}|${String(l.data).slice(0, 10)}`; const m = out.get(k) ?? new Map();
    const sku = chaveSku(l.sku); const o = m.get(sku);
    m.set(sku, { divergente: (o?.divergente ?? false) || l.divergente, em: [o?.em, l.em].filter(Boolean).sort().at(-1) ?? null });
    out.set(k, m);
  }
  return out;
}

type Base = { prazo: string; itens: number; conciliados: number; divergentes: number; em: string | null };
export type SituacaoDia =
  | { tipo: "SEM_MOV"; conciliados: number }                                   // sem movimento na base (conciliação, se houver, é informativa)
  | ({ tipo: "PENDENTE" | "FALHA" | "CONFERIDO" | "ATRASADO" | "PARCIAL" } & Base);

/** Situação de um almox num dia. Cumprido = todos os itens movimentados conciliados até o prazo (D+1 útil). */
export function situacaoDia(itens: ItemMov[] | undefined, conc: ConcDia | undefined, dia: string, hoje: string): SituacaoDia {
  const n = itens?.length ?? 0;
  if (!n) return { tipo: "SEM_MOV", conciliados: conc?.size ?? 0 };
  const prazo = prazoConferencia(dia);
  const feitos = itens!.map((i) => conc?.get(chaveSku(i.sku))).filter(Boolean) as { divergente: boolean; em: string | null }[];
  const em = feitos.map((f) => f.em).filter(Boolean).sort().at(-1) ?? null;
  const base: Base = { prazo, itens: n, conciliados: feitos.length, divergentes: feitos.filter((f) => f.divergente).length, em };
  if (!feitos.length) return { tipo: hoje > prazo ? "FALHA" : "PENDENTE", ...base };
  if (em && diaSP(em) > prazo) return { tipo: "ATRASADO", ...base };
  if (feitos.length < n) return { tipo: hoje > prazo ? "PARCIAL" : "PENDENTE", ...base };
  return { tipo: "CONFERIDO", ...base };
}

export type Nivel = { vencidos: number; cumpridos: number; falhas: number; atrasados: number; parciais: number; pendentes: number; nivel: number | null };
/** Nível de serviço = dias cumpridos ÷ dias com movimento cujo prazo já venceu (ou que já foram conferidos). */
export function nivelServico(sits: SituacaoDia[]): Nivel {
  const r = { vencidos: 0, cumpridos: 0, falhas: 0, atrasados: 0, parciais: 0, pendentes: 0 };
  for (const s of sits) {
    if (s.tipo === "SEM_MOV") continue;
    if (s.tipo === "PENDENTE") { r.pendentes++; continue; }
    r.vencidos++;
    if (s.tipo === "CONFERIDO") r.cumpridos++; else if (s.tipo === "FALHA") r.falhas++; else if (s.tipo === "ATRASADO") r.atrasados++; else r.parciais++;
  }
  return { ...r, nivel: r.vencidos ? r.cumpridos / r.vencidos : null };
}
