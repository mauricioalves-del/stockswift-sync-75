import { describe, expect, it } from "vitest";
import { lotesParaCorrecao, linhasModelo } from "./inventario-correcao-lotes";
const it_ = (sku: string, lote: string, sis: number, c: number, rec: number | null = null) => ({ codigo_produto: sku, lote, qtd_sistema: sis, qtd_contagem: c, qtd_recontagem: rec, qtd_final: null });
describe("lotes para correção", () => {
  it("ignora SKU com todos os lotes batendo", () => { expect(lotesParaCorrecao([it_("A", "1", 10, 10)])).toEqual([]); });
  it("soma igual mas lotes trocados vira correção de lote", () => {
    const r = lotesParaCorrecao([it_("A", "1", 10, 4), it_("A", "2", 0, 6)]);
    expect(r.map((x) => [x.lote, x.contado, x.tipo])).toEqual([["1", 4, "CORRECAO_LOTE"], ["2", 6, "CORRECAO_LOTE"]]);
  });
  it("usa a recontagem e marca divergente quando a soma difere", () => {
    const r = lotesParaCorrecao([it_("B", "9", 20, 5, 18)]);
    expect(r[0]).toMatchObject({ contado: 18, diferenca: -2, tipo: "DIVERGENTE" });
    expect(linhasModelo(r)).toEqual([["B", "", "9", null, 18]]);
  });
});
