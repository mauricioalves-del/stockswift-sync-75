import { describe, expect, it } from "bun:test";
import { diferencaConciliacao, saldoECustoPorSku, statusConciliacao } from "../src/lib/farol-movimentados";

describe("Conciliação de movimentados no formato da ficha de contagem", () => {
  it("sem contagem fica pendente", () => expect(statusConciliacao(10, null)).toBe("NAO_CONFERIDO"));
  it("contagem igual ao saldo sistêmico é OK", () => expect(statusConciliacao(61, 61)).toBe("OK"));
  it("contagem diferente do saldo sistêmico é divergente", () => expect(statusConciliacao(61, 58)).toBe("DIVERGENTE"));
  it("Dif. = Contagem − Sistema e custo total = Dif. × custo contábil", () =>
    expect(diferencaConciliacao(61, 58, 2.5)).toEqual({ qtd: -3, custo: -7.5 }));
  it("custo contábil prevalece sobre o custo do lote quando maior que zero", () => {
    const m = saldoECustoPorSku([
      { id_produto: "05104059", quantidade: 40, custo_contabil: 3, custo_unitario: 1 },
      { id_produto: "5104059", quantidade: 21, custo_contabil: 0, custo_unitario: 2 },
    ]);
    expect(m.get("5104059")?.saldo).toBe(61);
    expect(m.get("5104059")?.custo).toBeCloseTo((40 * 3 + 21 * 2) / 61, 6);
  });
});
