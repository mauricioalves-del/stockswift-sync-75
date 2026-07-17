// Resolução de períodos sazonais aplicáveis a um SKU/grupo/família.
// Índice = multiplicador aplicado ao CMD do dia (1.0 = sem efeito).

export type PeriodoSazonal = {
  id: string;
  nome: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string;    // YYYY-MM-DD
  recorrente_anual: boolean;
  escopo_tipo: "EMPRESA" | "GRUPO" | "FAMILIA" | "SKU";
  escopo_valor: string | null;
  indice_multiplicador: number;
  ativo: boolean;
};

type Contexto = { sku: string; grupo?: string | null; familia?: string | null };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Expande um período (com possível recorrência anual) para intervalos que
// interceptam a janela [janelaInicio, janelaFim] no ano corrente/próximo.
function expandir(p: PeriodoSazonal, janelaInicio: Date, janelaFim: Date): Array<{ ini: string; fim: string }> {
  if (!p.ativo) return [];
  if (!p.recorrente_anual) return [{ ini: p.data_inicio, fim: p.data_fim }];
  const out: Array<{ ini: string; fim: string }> = [];
  const anoIni = janelaInicio.getFullYear();
  const anoFim = janelaFim.getFullYear();
  const [, mesI, diaI] = p.data_inicio.split("-").map(Number);
  const [, mesF, diaF] = p.data_fim.split("-").map(Number);
  for (let ano = anoIni - 1; ano <= anoFim + 1; ano++) {
    const ini = new Date(ano, mesI - 1, diaI);
    let fim = new Date(ano, mesF - 1, diaF);
    if (fim < ini) fim = new Date(ano + 1, mesF - 1, diaF); // vira ano
    out.push({ ini: iso(ini), fim: iso(fim) });
  }
  return out;
}

function aplica(p: PeriodoSazonal, ctx: Contexto): boolean {
  if (p.escopo_tipo === "EMPRESA") return true;
  const v = (p.escopo_valor ?? "").trim();
  if (!v) return false;
  if (p.escopo_tipo === "SKU") return v === ctx.sku;
  if (p.escopo_tipo === "GRUPO") return v === (ctx.grupo ?? "");
  if (p.escopo_tipo === "FAMILIA") return v === (ctx.familia ?? "");
  return false;
}

/**
 * Multiplicador médio da sazonalidade sobre a janela [hoje, hoje + dias - 1].
 * Retorna 1.0 quando nenhum período ativo cobre a janela.
 */
export function indiceMedioNaJanela(
  periodos: PeriodoSazonal[],
  ctx: Contexto,
  dias: number,
  ref: Date = new Date()
): { indice: number; nomes: string[] } {
  if (dias <= 0) return { indice: 1, nomes: [] };
  const inicio = new Date(ref); inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio); fim.setDate(fim.getDate() + dias - 1);
  const aplicaveis = periodos.filter((p) => aplica(p, ctx));
  if (aplicaveis.length === 0) return { indice: 1, nomes: [] };

  const intervalos: Array<{ ini: string; fim: string; indice: number; nome: string }> = [];
  for (const p of aplicaveis) {
    for (const e of expandir(p, inicio, fim)) {
      intervalos.push({ ...e, indice: Number(p.indice_multiplicador) || 1, nome: p.nome });
    }
  }
  if (intervalos.length === 0) return { indice: 1, nomes: [] };

  let soma = 0;
  const nomes = new Set<string>();
  for (let i = 0; i < dias; i++) {
    const dia = new Date(inicio); dia.setDate(dia.getDate() + i);
    const diaIso = iso(dia);
    let mult = 1;
    for (const it of intervalos) {
      if (diaIso >= it.ini && diaIso <= it.fim) {
        mult *= it.indice;
        nomes.add(it.nome);
      }
    }
    soma += mult;
  }
  return { indice: soma / dias, nomes: Array.from(nomes) };
}

/** Índice ativo para o dia de hoje (para Mín/Ideal/Máx). */
export function indiceHoje(periodos: PeriodoSazonal[], ctx: Contexto, ref: Date = new Date()) {
  return indiceMedioNaJanela(periodos, ctx, 1, ref);
}

/** Retorna o método efetivo por SKU baseado no override ou na classe ABC. */
export type Metodo = "POR_DEMANDA" | "MIN_IDEAL_MAX";
export function metodoPorABC(classe: string | null | undefined, override: string | null | undefined): { metodo: Metodo; fonte: "override" | "abc" | "default" } {
  if (override === "POR_DEMANDA" || override === "MIN_IDEAL_MAX") return { metodo: override, fonte: "override" };
  if (classe === "A" || classe === "B") return { metodo: "POR_DEMANDA", fonte: "abc" };
  if (classe === "C") return { metodo: "MIN_IDEAL_MAX", fonte: "abc" };
  return { metodo: "POR_DEMANDA", fonte: "default" };
}
