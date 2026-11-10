import { expect, test } from "bun:test";
import { matriz, naoPrevistos, pareto, resumo } from "../src/lib/dispersao-painel";

const F = { atencao: 5, critico: 15 };
const L = (op: string, material: string, prev: number, cons: number, custo = 10, mes = "2026-10") =>
  ({ id_op: op, mes, empresa: "SP", material, desc_material: material, produto: "P", desc_produto: "P", qtd_previsto: prev, qtd_consumo: cons, qtd_dif: cons - prev, custo, impacto: (cons - prev) * custo });

test("Resumo separa processo de não previsto e mede aderência", () => {
  const r = resumo([L("1", "A", 100, 102), L("1", "B", 100, 130), L("2", "C", 0, 5), L("2", "D", 10, 9, 0)], F);
  expect(r.aderencia).toBeCloseTo(1 / 3); // A dentro (+2%); B (+30%) e D (−10%) fora
  expect([r.perda, r.naoPrevistoRs, r.naoPrevistoLin, r.semCusto]).toEqual([320, 50, 1, 1]);
  expect(r.pctOpsOk).toBe(0.5);
});

test("Matriz classifica viés × variabilidade", () => {
  const ls = [
    ...["1", "2", "3", "4"].map((o) => L(o, "FT", 100, 120)),                       // +20% sempre: revisar ficha
    L("1", "AP", 100, 140), L("2", "AP", 100, 60), L("3", "AP", 100, 135), L("4", "AP", 100, 66), // compensa
    ...["1", "2", "3"].map((o) => L(o, "OK", 100, 101)),
  ];
  const q = Object.fromEntries(matriz(ls, F).map((x) => [x.material, x.quadrante]));
  expect(q).toEqual({ FT: "revisar_ft", AP: "apontamento", OK: "controle" });
});

test("Pareto e não previstos", () => {
  const ls = [L("1", "A", 10, 20), L("2", "B", 10, 11), L("3", "N", 0, 3)];
  const p = pareto(ls);
  expect(p.itens.map((x) => x.material)).toEqual(["A", "B"]);
  expect(Math.round(p.itens[1].acumPct)).toBe(100);
  expect(naoPrevistos(ls)[0]).toMatchObject({ material: "N", consumo: 3, rs: 30 });
});
