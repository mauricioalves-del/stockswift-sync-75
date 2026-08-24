// Metodologia de recuperação financeira das Ações de Lote (Shelf Life).
// Funções puras — reutilizadas no formulário de ação e no dashboard executivo.

export type CategoriaFinanceira =
  | "Vendas"
  | "Degustação"
  | "Recuperação de Custo (Produção)"
  | "Descarte";

export const CATEGORIAS_FINANCEIRAS: CategoriaFinanceira[] = [
  "Vendas",
  "Degustação",
  "Recuperação de Custo (Produção)",
  "Descarte",
];

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Deriva a categoria financeira a partir do nome do tipo de ação (§1). */
export function categoriaFinanceira(nomeTipo: string | null | undefined): CategoriaFinanceira {
  const s = norm(nomeTipo);
  if (!s) return "Recuperação de Custo (Produção)";
  if (s.includes("descarte")) return "Descarte";
  if (s.includes("degusta")) return "Degustação";
  if (s.includes("desconto") && s.includes("colaborador")) return "Vendas";
  if (s.includes("refood") || s.includes("anuncio")) return "Vendas";
  return "Recuperação de Custo (Produção)";
}

export function ehCategoriaVendas(nomeTipo: string | null | undefined): boolean {
  return categoriaFinanceira(nomeTipo) === "Vendas";
}

export function ehDescarte(nomeTipo: string | null | undefined): boolean {
  return categoriaFinanceira(nomeTipo) === "Descarte";
}

/** Sufixo exibido ao lado do nome do tipo no dropdown. */
export function sufixoTipoAcao(nomeTipo: string | null | undefined): string {
  const cat = categoriaFinanceira(nomeTipo);
  if (cat === "Descarte") return "Perda";
  if (cat === "Vendas") return "Receita";
  return "Saving";
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Motivos de baixa que representam perda efetiva do produto. */
const MOTIVOS_PERDA = ["avaria", "vencimento", "descarte", "perda", "furto", "quebra", "qualidade"];

export function motivoEhPerda(motivoDescricao: string | null | undefined): boolean {
  const s = norm(motivoDescricao);
  if (!s) return true; // sem motivo conhecido, mantém o comportamento conservador (perda)
  return MOTIVOS_PERDA.some((k) => s.includes(k));
}

/**
 * A baixa vinculada é a própria execução da ação (ex.: ação de Degustação
 * baixada com motivo Degustação)? Nesse caso a quantidade não é perda e
 * portanto não deve ser descontada da quantidade recuperada.
 */
export function baixaEhExecucaoDaAcao(
  nomeTipo: string | null | undefined,
  motivoDescricao: string | null | undefined,
  ids?: { motivoIdDoTipo?: string | null; motivoIdDaBaixa?: string | null },
): boolean {
  if (ids?.motivoIdDoTipo && ids?.motivoIdDaBaixa && ids.motivoIdDoTipo === ids.motivoIdDaBaixa) return true;
  const tipo = norm(nomeTipo);
  const motivo = norm(motivoDescricao);
  if (!motivo) return false;
  if (tipo && motivo && (tipo === motivo || tipo.includes(motivo) || motivo.includes(tipo))) return true;
  return !motivoEhPerda(motivo);
}

/** §2 — Quantidade recuperada: endereçada menos a quantidade perdida na baixa vinculada. */
export function quantidadeRecuperada(
  quantidadeEnderecada: number,
  quantidadeBaixaVinculada?: number | null,
  baixaEhExecucao = false,
): number {
  const qe = Number(quantidadeEnderecada) || 0;
  if (quantidadeBaixaVinculada == null || baixaEhExecucao) return Math.max(0, qe);
  return Math.max(0, qe - (Number(quantidadeBaixaVinculada) || 0));
}

/** §3 — Custo da ação = quantidade endereçada × custo unitário (valor total em risco). */
export function custoAcaoCalculado(quantidadeEnderecada: number, custoUnitario: number): number {
  return round2((Number(quantidadeEnderecada) || 0) * (Number(custoUnitario) || 0));
}

export type ParametrosValor = {
  categoria: CategoriaFinanceira;
  quantidadeRecuperada: number;
  custoUnitario: number;
  /** Preço efetivamente praticado (com desconto, ou preço do anúncio) — só para Vendas. */
  precoPraticado?: number | null;
};

/** §1 + §4 — Valor recuperado conforme a categoria financeira. */
export function valorRecuperadoCalculado(p: ParametrosValor): number {
  const q = Math.max(0, Number(p.quantidadeRecuperada) || 0);
  const custo = Number(p.custoUnitario) || 0;
  switch (p.categoria) {
    case "Vendas":
      return round2(q * (Number(p.precoPraticado) || 0));
    case "Degustação":
      return round2(0.5 * q * custo);
    case "Recuperação de Custo (Produção)":
      return round2(q * custo);
    case "Descarte":
    default:
      return 0;
  }
}

/** §5 — Saving recuperado = valor recuperado − custo da ação. */
export function savingRecuperadoCalculado(valorRecuperado: number, custoAcao: number): number {
  return round2((Number(valorRecuperado) || 0) - (Number(custoAcao) || 0));
}

export type CampanhaFin = {
  status: string;
  tipo_nome?: string | null;
  categoria_financeira?: string | null;
  custo_acao?: number | null;
  valor_recuperado?: number | null;
  saving_recuperado?: number | null;
  /** legados */
  valor_estimado_recuperado?: number | null;
  valor_estimado_saving?: number | null;
};

export function categoriaDaCampanha(c: CampanhaFin): CategoriaFinanceira {
  const salva = c.categoria_financeira as CategoriaFinanceira | null | undefined;
  if (salva && CATEGORIAS_FINANCEIRAS.includes(salva)) return salva;
  return categoriaFinanceira(c.tipo_nome);
}

/** Valor recuperado oficial, com fallback para registros legados. */
export function valorRecuperadoFinal(c: CampanhaFin): number {
  const v = Number(c.valor_recuperado) || 0;
  if (v !== 0) return v;
  if (categoriaDaCampanha(c) === "Descarte") return 0;
  return Number(c.valor_estimado_recuperado) || Number(c.valor_estimado_saving) || 0;
}

export function savingRecuperadoFinal(c: CampanhaFin): number {
  const s = Number(c.saving_recuperado) || 0;
  if (s !== 0) return s;
  return savingRecuperadoCalculado(valorRecuperadoFinal(c), Number(c.custo_acao) || 0);
}

export type IndicadoresMetodologia = {
  receitaRecuperada: number;
  perdaEvitada: number;
  /** Perda efetiva das ações: custo das ações de Descarte (nada é recuperado). */
  perdaDescarte: number;
  /** Perda real = descarte das ações + perda externa informada (baixas sem cobertura). */
  perdaReal: number;
  savingRecuperado: number;
  custoTotal: number;
  roiOperacional: number | null;
  porCategoria: { categoria: CategoriaFinanceira; valor: number }[];
};

/** §7 — Indicadores executivos calculados sobre as ações concluídas. */
export function indicadoresMetodologia(
  campanhas: CampanhaFin[],
  perdaExterna = 0,
): IndicadoresMetodologia {
  const concluidas = campanhas.filter((c) => c.status === "CONCLUIDA");
  let receitaRecuperada = 0;
  let perdaEvitada = 0;
  let perdaDescarte = 0;
  let savingRecuperado = 0;
  let custoTotal = 0;
  const porCat = new Map<CategoriaFinanceira, number>();

  for (const c of concluidas) {
    const cat = categoriaDaCampanha(c);
    const valor = valorRecuperadoFinal(c);
    const custo = Number(c.custo_acao) || 0;
    custoTotal += custo;
    savingRecuperado += savingRecuperadoFinal(c);
    if (cat === "Vendas") receitaRecuperada += valor;
    if (cat !== "Descarte") {
      perdaEvitada += valor;
      porCat.set(cat, (porCat.get(cat) ?? 0) + valor);
    } else {
      perdaDescarte += custo;
      porCat.set(cat, porCat.get(cat) ?? 0);
    }
  }

  return {
    receitaRecuperada: round2(receitaRecuperada),
    perdaEvitada: round2(perdaEvitada),
    perdaDescarte: round2(perdaDescarte),
    perdaReal: round2(perdaDescarte + (Number(perdaExterna) || 0)),
    savingRecuperado: round2(savingRecuperado),
    custoTotal: round2(custoTotal),
    roiOperacional: custoTotal > 0 ? (savingRecuperado / custoTotal) * 100 : null,
    porCategoria: CATEGORIAS_FINANCEIRAS.map((categoria) => ({
      categoria,
      valor: round2(porCat.get(categoria) ?? 0),
    })),
  };
}

