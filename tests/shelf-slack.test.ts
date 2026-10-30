import { describe, expect, it } from "vitest";
import { almoxDosLotes, diasParaVencer, dividir, tituloTrend, totalCusto, type LoteSlack } from "../src/lib/shelf-slack";

const l = (p: Partial<LoteSlack>): LoteSlack => ({ sku: "1", descricao: "X", lote: "L", almoxarifado: "Alm_Para", data_validade: null, quantidade: 1, custo_contabil: 0, ...p });

describe("shelf-slack", () => {
  it("título no formato combinado", () => {
    expect(tituloTrend(" Vender rápido ", "Alm_Para", new Date(2026, 9, 30))).toBe(":warning: *Risco de Shelf* - Vender rápido - Almox - Alm_Para - 30/10/2026");
  });
  it("dias para vencer", () => {
    expect(diasParaVencer("2026-12-30", new Date(Date.UTC(2026, 9, 30)))).toBe(61);
    expect(diasParaVencer(null)).toBeNull();
  });
  it("soma custo contábil", () => {
    expect(totalCusto([l({ custo_contabil: 7837.5 }), l({ custo_contabil: 7607.6 })])).toBe(15445.1);
  });
  it("almox distintos e divisão em partes", () => {
    expect(almoxDosLotes([l({}), l({ almoxarifado: "Alm_Box" }), l({})])).toBe("Alm_Box, Alm_Para");
    expect(dividir(Array.from({ length: 85 }), 40).map((p) => p.length)).toEqual([40, 40, 5]);
  });
});
