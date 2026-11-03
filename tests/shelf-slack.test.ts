import { describe, expect, it } from "vitest";
import { almoxDosLotes, chaveEnvio, diasParaVencer, dividir, indexarEnviosPorLote, separarJaEnviados, tituloTrend, totalCusto, type EnvioSlack, type LoteSlack } from "../src/lib/shelf-slack";

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
  it("título com número do envio", () => {
    expect(tituloTrend("Vender rápido", "Alm_Para", new Date(2026, 9, 30), 12)).toBe(":warning: *Risco de Shelf #12* - Vender rápido - Almox - Alm_Para - 30/10/2026");
  });
  it("rastreia lotes já enviados e separa os novos", () => {
    const env = (id: string, numero: number, created_at: string, lotes: { sku: string; lote: string; almoxarifado: string }[]): EnvioSlack =>
      ({ id, numero, link: `https://slack/${numero}`, created_at, observacao: "obs", lotes });
    const idx = indexarEnviosPorLote([
      env("a", 1, "2026-10-30T10:00:00Z", [{ sku: "1", lote: "L", almoxarifado: "Alm_Para" }]),
      env("b", 2, "2026-11-02T10:00:00Z", [{ sku: "1", lote: "L", almoxarifado: "Alm_Para" }, { sku: "2", lote: "M", almoxarifado: "Alm_Box" }]),
    ]);
    expect(idx.get(chaveEnvio({ sku: "1", lote: "L", almoxarifado: "Alm_Para" }))?.map((e) => e.numero)).toEqual([2, 1]);
    const { novos, enviados } = separarJaEnviados([l({}), l({ sku: "3" }), l({ sku: "2", lote: "M", almoxarifado: "Alm_Box" })], idx);
    expect(novos.map((x) => x.sku)).toEqual(["3"]);
    expect(enviados.map((x) => [x.lote.sku, x.envio.numero])).toEqual([["1", 2], ["2", 2]]);
  });
});
