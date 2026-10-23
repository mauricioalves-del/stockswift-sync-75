import { diasEntre, type HistLinha } from "./abastecimento-dash-hist";

const skuKey = (s: string) => s.replace(/^0+/, "");
export type RupturaDia = HistLinha & { entrada: string; resolvidaEm: string | null; dias: number; parcial: boolean };

/** Cada item/local da foto selecionada acompanha somente a ocorrência que contém esse dia. */
export function detalhesRupturaDia(selecionadas: HistLinha[], historico: HistLinha[]): RupturaDia[] {
  return selecionadas.filter((h) => h.em_ruptura).map((h) => {
    const fotos = historico.filter((r) => r.loja === h.loja && skuKey(r.id_produto) === skuKey(h.id_produto)).sort((a, b) => a.data.localeCompare(b.data));
    const idx = fotos.findIndex((r) => r.data === h.data);
    if (idx < 0) return { ...h, entrada: h.data, resolvidaEm: null, dias: 1, parcial: true };
    let ini = idx;
    while (ini > 0 && fotos[ini - 1].em_ruptura) ini--;
    let fim = idx;
    while (fim + 1 < fotos.length && fotos[fim + 1].em_ruptura) fim++;
    const resolvidaEm = fotos[fim + 1]?.data ?? null;
    let parcial = ini === 0;
    for (let i = Math.max(1, ini); i <= Math.min(fim + 1, fotos.length - 1); i++) {
      if (diasEntre(fotos[i - 1].data, fotos[i].data) !== 1) parcial = true;
    }
    return { ...h, entrada: fotos[ini].data, resolvidaEm, dias: resolvidaEm ? diasEntre(fotos[ini].data, resolvidaEm) : diasEntre(fotos[ini].data, fotos[fim].data) + 1, parcial };
  }).sort((a, b) => b.dias - a.dias || (a.descricao ?? a.id_produto).localeCompare(b.descricao ?? b.id_produto, "pt-BR"));
}