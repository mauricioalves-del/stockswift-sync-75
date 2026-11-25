// Planilha de ajuste de estoque a partir das divergências de movimentados selecionadas.
// Falta: baixa pela ordem FEFO (validade mais próxima primeiro); se o lote não cobre, continua no próximo.
// Sobra: entra no lote que vence primeiro. Cont1 = saldo do lote após o ajuste.
export type LoteSaldo = { lote: string; validade: string | null; saldo: number };
export type LinhaAjuste = { sku: string; almox: string; lote: string; validade: string | null; saldo: number; ajuste: number; cont1: number };
export type ResultadoAjuste = { linhas: LinhaAjuste[]; naoCoberto: number };

const r = (n: number) => Math.round(n * 1000) / 1000;
export const ordemFefo = (ls: LoteSaldo[]) => [...ls].sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999") || a.lote.localeCompare(b.lote));

export function ajusteFefo(sku: string, almox: string, divergencia: number, lotes: LoteSaldo[]): ResultadoAjuste {
  const fefo = ordemFefo(lotes.filter((l) => l.saldo > 0));
  const linhas: LinhaAjuste[] = [];
  const d = r(divergencia);
  if (!d || !fefo.length) return { linhas, naoCoberto: Math.abs(d) };
  if (d > 0) {
    const l = fefo[0]!;
    linhas.push({ sku, almox, lote: l.lote, validade: l.validade, saldo: r(l.saldo), ajuste: d, cont1: r(l.saldo + d) });
    return { linhas, naoCoberto: 0 };
  }
  let resta = -d;
  for (const l of fefo) {
    if (resta <= 0) break;
    const b = r(Math.min(l.saldo, resta));
    linhas.push({ sku, almox, lote: l.lote, validade: l.validade, saldo: r(l.saldo), ajuste: -b, cont1: r(l.saldo - b) });
    resta = r(resta - b);
  }
  return { linhas, naoCoberto: resta };
}

/** Código do almoxarifado no Atlas → origem no estoque do sistema (Alm_...). */
export const ATLAS_PARA_ORIGEM: Record<string, string> = {
  Almox_SP_Processo: "Alm_SP_Processo", Almox_SP_Loja: "Alm_SP_Loja", Almox_SP_Fabrica: "Alm_SP_Fabrica", Almox_SP_Ativacao: "Alm_PDV_Ativacao",
  Almox_SP_Qualidade: "Alm_SP_Qualidade", Almox_SP_Degustacao: "Alm_Degustacao", Almox_PA_Para: "Alm_Para", Almox_SP_PatioPaulista: "Alm_Paulista",
  Almox_Box: "Alm_Box", Almox_Box_2: "Alm_Box2",
};
export const origemDoAlmox = (a: string) => ATLAS_PARA_ORIGEM[a] ?? a.replace(/^Almox_/, "Alm_");
