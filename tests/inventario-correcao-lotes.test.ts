import { describe, expect, it } from "bun:test";
import { lotesParaCorrecao, linhasModelo } from "../src/lib/inventario-correcao-lotes";
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

import { lotesParaCorrecao as lpc } from "@/lib/inventario-correcao-lotes";
import { it as it2, expect as ex2 } from "bun:test";
it2("produto faturado na conciliação fica fora da planilha de ajuste", () => {
  const base = { descricao: "", qtd_contagem: null, qtd_recontagem: null };
  const r = lpc([
    { ...base, codigo_produto: "1", lote: "A", qtd_sistema: 5, qtd_final: 4, qtd_faturada: 1 },
    { ...base, codigo_produto: "1", lote: "B", qtd_sistema: 0, qtd_final: 1, qtd_faturada: 0 },
    { ...base, codigo_produto: "2", lote: "A", qtd_sistema: 3, qtd_final: 2 },
  ]);
  ex2(r.map((l) => l.sku)).toEqual(["2"]);
});
