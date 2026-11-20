import { expect, test } from "bun:test";
import { avaliarCotacoes, calcularCustoAlvo, cubagemM3, pesoTaxavel, referenciaHistorica } from "../src/lib/calculadora-frete";
test("Cubagem, peso taxável e custo-alvo por componentes", () => {
  const vols = [{ qtd: 10, c: 60, l: 40, a: 40 }]; // 0,96 m³
  expect(cubagemM3(vols)).toBe(0.96);
  expect(pesoTaxavel(400, 0.96, "rodoviario")).toEqual({ cubado: 288, taxavel: 400 });
  expect(pesoTaxavel(150, 0.96, "aereo").taxavel).toBe(160.3);
  const r = calcularCustoAlvo({ pesoReal: 400, volumes: vols, modal: "rodoviario", valorNF: 20000, tarifaKg: 2.5, minimo: 0, adValoremPct: 0.3, grisPct: 0.2, pedagio: 30, coletaEntrega: 50, termica: 120, icmsPct: 0, tolerancia: 10 });
  expect(r.alvo).toBe(1000 + 60 + 40 + 30 + 50 + 120);
  expect([r.teto, r.pctNF]).toEqual([1430, 6.5]);
  const a = avaliarCotacoes([{ id: "1", prestador: "Jamef", modal: "rodoviario", total: 1250, prazo: 6 }, { id: "2", prestador: "LATAM", modal: "aereo", total: 4800, prazo: 1 }], r.alvo, r.teto, r.taxavel, 20000, 7, true);
  expect(a.recomendada?.prestador).toBe("Jamef");
  expect(a.cotacoes[0]).toMatchObject({ desvio: -3.8, dentroTeto: true, pctNF: 6.3 });
  expect(referenciaHistorica([{ data: "", kg: 100, total: 300 }, { data: "", kg: 50, total: 200 }, { data: "", kg: null, total: 40 }])).toMatchObject({ n: 3, nComKg: 2, rkgMediana: 3.5 });
});
