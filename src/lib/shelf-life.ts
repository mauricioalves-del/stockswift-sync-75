// Motor de cálculo do módulo Shelf Life (controle de validade).
// Funções puras — nenhuma dependência de rede — para facilitar ajuste de fórmulas.

export type Faixa = "VENCIDO" | "30" | "60" | "90" | "PENDENTE";

export const FAIXA_LABEL: Record<Faixa, string> = {
  VENCIDO: "Vencido",
  "30": "30 dias",
  "60": "60 dias",
  "90": "90 dias",
  PENDENTE: "Pendente de Validade",
};

export const FAIXA_TONE: Record<Faixa, string> = {
  VENCIDO: "bg-destructive/15 text-destructive",
  "30": "bg-destructive/10 text-destructive",
  "60": "bg-warning/15 text-warning",
  "90": "bg-info/15 text-info",
  PENDENTE: "bg-muted text-muted-foreground",
};

export function diasParaVencer(validade: string | null | undefined, hoje = new Date()): number | null {
  if (!validade) return null;
  const d = new Date(`${validade.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((d.getTime() - base.getTime()) / 86_400_000);
}

/** Retorna a faixa de risco, ou null quando o lote está fora do radar (> 90 dias). */
export function faixaDeRisco(validade: string | null | undefined, hoje = new Date()): Faixa | null {
  if (!validade) return "PENDENTE";
  const dias = diasParaVencer(validade, hoje);
  if (dias === null) return "PENDENTE";
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  if (dias <= 90) return "90";
  return null;
}

export type CategoriaAcao = "RECEITA" | "SAVING" | "PERDA";

export type CampanhaCalc = {
  id: string;
  sku: string;
  descricao?: string | null;
  lote: string;
  status: string;
  data_acao: string;
  quantidade_enderecada: number;
  valor_estimado_recuperado: number;
  valor_estimado_saving: number;
  custo_acao: number;
  tipo_acao_id: string | null;
  tipo_nome?: string | null;
  categoria?: CategoriaAcao | null;
  baixa_operacional_id?: string | null;
};

export type BaixaCalc = {
  id: string;
  codigo_produto: string;
  descricao?: string | null;
  lote: string | null;
  quantidade: number;
  valor_total: number;
  custo_unitario?: number | null;
  data: string; // ISO date
  motivo_nome: string | null;
};

export const chaveLote = (sku: string, lote: string | null | undefined) =>
  `${(sku ?? "").trim().toUpperCase()}||${(lote ?? "").trim().toUpperCase()}`;

export type LinhaPerda = {
  baixa: BaixaCalc;
  /** valor que efetivamente conta como perda (já descontada a cobertura da campanha) */
  perda: number;
  coberta: boolean;
  campanhaId?: string;
};

/**
 * Cruzamento baixas × campanhas (item 3 do escopo).
 * - Baixa por Vencimento sem campanha para o SKU+Lote → 100% perda.
 * - Com campanha CONCLUIDA → só a quantidade não endereçada vira perda residual.
 * - Baixas de outros motivos que correspondem a um tipo de ação (ex.: Degustação)
 *   não entram como perda — o valor já é contabilizado pela campanha.
 */
export function cruzarBaixasComCampanhas(
  baixas: BaixaCalc[],
  campanhas: CampanhaCalc[],
  motivoDeTipoAcao: Set<string>, // nomes de motivo que correspondem a tipos de ação
): LinhaPerda[] {
  const porLote = new Map<string, CampanhaCalc[]>();
  for (const c of campanhas) {
    const k = chaveLote(c.sku, c.lote);
    const arr = porLote.get(k) ?? [];
    arr.push(c);
    porLote.set(k, arr);
  }

  const out: LinhaPerda[] = [];
  for (const b of baixas) {
    const motivo = (b.motivo_nome ?? "").trim();
    const isVencimento = motivo.toLowerCase() === "vencimento";
    const campanhasLote = (porLote.get(chaveLote(b.codigo_produto, b.lote)) ?? []).filter(
      (c) => c.status !== "CANCELADA",
    );

    if (!isVencimento) {
      // Baixa cujo motivo é a própria ação (ex.: Degustação): não é perda, já contabilizada na campanha.
      if (motivoDeTipoAcao.has(motivo) && campanhasLote.length > 0) continue;
      continue; // demais motivos não pertencem ao indicador de perda por validade
    }

    const concluidas = campanhasLote.filter((c) => c.status === "CONCLUIDA");
    if (concluidas.length === 0) {
      out.push({ baixa: b, perda: b.valor_total ?? 0, coberta: false });
      continue;
    }

    const qtdCoberta = concluidas.reduce((s, c) => s + (c.quantidade_enderecada || 0), 0);
    const qtd = b.quantidade || 0;
    const unit = qtd > 0 ? (b.valor_total || 0) / qtd : (b.custo_unitario ?? 0);
    const residual = Math.max(0, qtd - qtdCoberta) * unit;
    out.push({ baixa: b, perda: residual, coberta: true, campanhaId: concluidas[0].id });
  }
  return out;
}

export type Indicadores = {
  perda: number;
  receitaRecuperada: number;
  savingRecuperado: number;
  perdaEvitada: number;
  custoAcoes: number;
  roi: number | null;
  eficiencia: number | null;
};

export function calcularIndicadores(linhas: LinhaPerda[], campanhas: CampanhaCalc[]): Indicadores {
  const perda = linhas.reduce((s, l) => s + l.perda, 0);
  const concluidas = campanhas.filter((c) => c.status === "CONCLUIDA");
  const receitaRecuperada = concluidas
    .filter((c) => c.categoria === "RECEITA")
    .reduce((s, c) => s + (c.valor_estimado_recuperado || 0), 0);
  const savingRecuperado = concluidas
    .filter((c) => c.categoria !== "RECEITA")
    .reduce((s, c) => s + (c.valor_estimado_saving || 0), 0);
  const perdaEvitada = receitaRecuperada + savingRecuperado;
  const custoAcoes = concluidas.reduce((s, c) => s + (c.custo_acao || 0), 0);
  const roi = custoAcoes > 0 ? (perdaEvitada / custoAcoes) * 100 : null;
  const den = perdaEvitada + perda;
  const eficiencia = den > 0 ? (perdaEvitada / den) * 100 : null;
  return { perda, receitaRecuperada, savingRecuperado, perdaEvitada, custoAcoes, roi, eficiencia };
}

export function valorRecuperadoCampanha(c: CampanhaCalc): number {
  return c.categoria === "RECEITA" ? c.valor_estimado_recuperado || 0 : c.valor_estimado_saving || 0;
}

export const STATUS_CAMPANHA: { value: string; label: string }[] = [
  { value: "PLANEJADA", label: "Planejada" },
  { value: "EM_ANDAMENTO", label: "Em Andamento" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "CANCELADA", label: "Cancelada" },
];

export function statusCampanhaLabel(s: string) {
  return STATUS_CAMPANHA.find((x) => x.value === s)?.label ?? s;
}

export function statusCampanhaTone(s: string) {
  switch (s) {
    case "CONCLUIDA": return "bg-success/15 text-success";
    case "EM_ANDAMENTO": return "bg-info/15 text-info";
    case "CANCELADA": return "bg-muted text-muted-foreground";
    default: return "bg-warning/15 text-warning";
  }
}
