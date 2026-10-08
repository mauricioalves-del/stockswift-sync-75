// Regra do custo contábil (CMV) — usada pela rota de importação e pela tela de investigação.
//
// Prioridade: Custo Contábil. Se não houver informação (vazio) ou for zero, vale o custo padrão (Custo_Vlr).
// Qual coluna contábil: almoxarifados do Pará usam "Custo_Contabil_Para"; os demais, "Custo_Contabil_SP".

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** True quando o almoxarifado é do Pará (ex.: Alm_Para, Alm_Qualidade_Para, "Almox - PARÁ"). */
export function ehOrigemPara(origem?: string | null): boolean {
  const tokens = semAcento(String(origem ?? "")).split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.includes("para");
}

/** Número vindo da planilha: aceita vazio, "12,5", "1.234,56" e número. Vazio/ inválido => null. */
export function numeroOuNulo(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "") return null;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type CustoResolvido = {
  custo: number;
  custo_padrao: number | null;
  custo_contabil: number | null;
  origem_custo: "CONTABIL" | "PADRAO" | "SEM_CUSTO";
  coluna_contabil: "Custo_Contabil_Para" | "Custo_Contabil_SP";
};

export function resolverCusto(e: { origem?: string | null; custoPadrao?: unknown; contabilSp?: unknown; contabilPara?: unknown }): CustoResolvido {
  const para = ehOrigemPara(e.origem);
  const contabil = numeroOuNulo(para ? e.contabilPara : e.contabilSp);
  const padrao = numeroOuNulo(e.custoPadrao);
  const coluna = para ? "Custo_Contabil_Para" : "Custo_Contabil_SP";
  if (contabil !== null && contabil > 0) {
    return { custo: contabil, custo_padrao: padrao, custo_contabil: contabil, origem_custo: "CONTABIL", coluna_contabil: coluna };
  }
  if (padrao !== null && padrao > 0) {
    return { custo: padrao, custo_padrao: padrao, custo_contabil: null, origem_custo: "PADRAO", coluna_contabil: coluna };
  }
  return { custo: 0, custo_padrao: padrao, custo_contabil: null, origem_custo: "SEM_CUSTO", coluna_contabil: coluna };
}

// ----- Classificação para a tela de investigação -----
export type CasoCusto = "CONTABIL_MUITO_MAIOR" | "CONTABIL_MUITO_MENOR" | "SEM_CONTABIL" | "SEM_CUSTO" | "NORMAL";

export type LinhaCusto = {
  quantidade: number;
  custo_padrao: number | null;
  custo_contabil: number | null;
};

export function classificarCusto(l: LinhaCusto, limite: number): { caso: CasoCusto; razao: number | null; impacto: number } {
  const padrao = l.custo_padrao ?? 0;
  const contabil = l.custo_contabil ?? 0;
  if (contabil <= 0 && padrao <= 0) return { caso: "SEM_CUSTO", razao: null, impacto: 0 };
  if (contabil <= 0) return { caso: "SEM_CONTABIL", razao: null, impacto: 0 };
  if (padrao <= 0) return { caso: "NORMAL", razao: null, impacto: 0 }; // só contábil: não há com o que comparar
  const razao = contabil / padrao;
  const impacto = (Number(l.quantidade) || 0) * (contabil - padrao);
  if (razao >= limite) return { caso: "CONTABIL_MUITO_MAIOR", razao, impacto };
  if (razao <= 1 / limite) return { caso: "CONTABIL_MUITO_MENOR", razao, impacto };
  return { caso: "NORMAL", razao, impacto };
}
