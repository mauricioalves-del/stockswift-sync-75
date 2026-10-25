import { describe, expect, test } from "bun:test";
import { tendenciaAcuracia } from "../src/lib/atlas-tendencia";

describe("Projeção estatística de acurácia do Atlas", () => {
  test("projeta exatamente os próximos cinco dias por regressão linear", () => {
    const r = tendenciaAcuracia([{ data: "2026-10-01", acuracia: 70 }, { data: "2026-10-02", acuracia: 72 }, { data: "2026-10-03", acuracia: 74 }]);
    expect(r.inclinacao).toBeCloseTo(2, 10);
    expect(r.pontos.filter((p) => p.acuracia === null).map((p) => [p.data, p.projecao])).toEqual([
      ["2026-10-04", 76], ["2026-10-05", 78], ["2026-10-06", 80], ["2026-10-07", 82], ["2026-10-08", 84],
    ]);
    expect(r.projecao5).toBe(84);
  });
  test("inclinação usa dias reais mesmo com lacunas e não inventa observações", () => {
    const r = tendenciaAcuracia([{ data: "2026-10-11", acuracia: 80 }, { data: "2026-10-01", acuracia: 90 }]);
    expect(r.inclinacao).toBeCloseTo(-1, 10);
    expect(r.projecao5).toBe(75);
    expect(r.pontos.slice(0, 2).map((p) => p.acuracia)).toEqual([90, 80]);
  });
  test("usa regressão de todas as observações em vez de ligar apenas extremos", () => {
    const r = tendenciaAcuracia([{ data: "2026-10-01", acuracia: 70 }, { data: "2026-10-02", acuracia: 90 }, { data: "2026-10-03", acuracia: 70 }]);
    expect(r.inclinacao).toBeCloseTo(0, 10);
    expect(r.projecao5).toBeCloseTo(230 / 3, 10);
  });
  test("mantém a projeção no intervalo físico de acurácia", () => {
    expect(tendenciaAcuracia([{ data: "2026-10-01", acuracia: 90 }, { data: "2026-10-02", acuracia: 99 }]).projecao5).toBe(100);
    expect(tendenciaAcuracia([{ data: "2026-10-01", acuracia: 20 }, { data: "2026-10-02", acuracia: 10 }]).projecao5).toBe(0);
  });
  test("sem dois dias válidos não exibe projeção fabricada", () => {
    expect(tendenciaAcuracia([]).projecao5).toBeNull();
    expect(tendenciaAcuracia([{ data: "2026-10-01", acuracia: 90 }, { data: "2026-10-02", acuracia: null }]).inclinacao).toBeNull();
  });
});