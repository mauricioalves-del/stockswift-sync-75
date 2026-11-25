import { describe, expect, it } from "vitest";
import { lotesPosFaturamento } from "../src/lib/inventario-correcao-lotes";
const it8 = (lote: string, sis: number, fin: number, fat: number) => ({ codigo_produto: "05104016", descricao: "Bombom", lote, qtd_sistema: sis, qtd_contagem: fin, qtd_recontagem: null, qtd_final: fin, qtd_faturada: fat });
describe("lotes pós-faturamento", () => {
  it("baixa a venda pelo lote de validade mais próxima", () => {
    const ls = lotesPosFaturamento([it8("A", 30, 24, 2), it8("B", 17, 23, 0)], new Map([["A", "2026-06-01"], ["B", "2026-05-01"]]));
    const b = ls.find((l) => l.lote === "B")!, a = ls.find((l) => l.lote === "A")!;
    expect(b.baixaFefo).toBe(2); expect(b.sistemaPos).toBe(15); expect(b.diferenca).toBe(8);
    expect(a.sistemaPos).toBe(30); expect(a.fisico).toBe(22); expect(a.diferenca).toBe(-8);
  });
  it("ignora produtos não faturados", () => {
    expect(lotesPosFaturamento([it8("A", 5, 4, 0)], new Map())).toHaveLength(0);
  });
});
