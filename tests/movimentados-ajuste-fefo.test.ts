import { describe, expect, it } from "vitest";
import { ajusteFefo } from "../src/lib/movimentados-ajuste-fefo";
const lotes = [
  { lote: "B", validade: "2027-06-01", saldo: 10 },
  { lote: "A", validade: "2027-01-01", saldo: 3 },
  { lote: "C", validade: "2027-09-01", saldo: 50 },
];
describe("ajuste FEFO de movimentados", () => {
  it("falta baixa primeiro o lote que vence antes e continua no próximo", () => {
    const r = ajusteFefo("1", "X", -5, lotes);
    expect(r.linhas.map((l) => [l.lote, l.ajuste, l.cont1])).toEqual([["A", -3, 0], ["B", -2, 8]]);
    expect(r.naoCoberto).toBe(0);
  });
  it("sobra entra no lote que vence primeiro", () => {
    expect(ajusteFefo("1", "X", 4, lotes).linhas.map((l) => [l.lote, l.cont1])).toEqual([["A", 7]]);
  });
  it("falta maior que o saldo total informa o que não foi coberto", () => {
    expect(ajusteFefo("1", "X", -70, lotes).naoCoberto).toBe(7);
  });
});
