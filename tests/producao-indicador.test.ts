import { expect, test } from "bun:test";
import { indicadorProducao, opsDeConsumo } from "../src/lib/producao-indicador";

const grupo = (s: string) => (s.startsWith("05") ? "Produto Acabado" : "Produto em Processo");
const L = (op: string, data: string, produto: string, qtd: number, material = "X", cons = 1, prev = 1) => ({ id_op: op, data_producao: data, produto, desc_produto: produto, qtd_produzida: qtd, material, qtd_consumo: cons, qtd_previsto: prev, impacto_rs_congelado: 0 });

test("Uma OP por ordem, PA em un e PP em kg; MoM, diário, top 10 e DOI", () => {
  const c = [L("1", "2026-09-10", "05004010", 100), L("1", "2026-09-10", "05004010", 100, "Y"), L("2", "2026-10-05", "05004010", 150), L("3", "2026-10-06", "0020305006", 12.5), L("4", "2026-10-06", "05004012", 50, "0020305006", 2, 2)];
  const ops = opsDeConsumo(c, grupo);
  expect(ops.length).toBe(4);
  const r = indicadorProducao(ops, c, "2026-10", { estoque: [{ id_produto: "5004010", quantidade: 60 }, { id_produto: "20305006", quantidade: 4 }], vendas: [{ sku: "05004010", data_movimento: "2026-10-01", quantidade: 180 }], hoje: "2026-10-31" });
  expect([r.kpis.paUn, r.kpis.ppKg, r.kpis.ops]).toEqual([200, 12.5, 3]);
  expect(r.kpis.momPA).toBe(1); // 200 vs 100
  expect(r.diario.find((d) => d.dia === 6)).toMatchObject({ paUn: 50, ppKg: 12.5, ops: 2 });
  expect(r.topPA[0]).toMatchObject({ produto: "05004010", qtd: 150 });
  const mocajuba = r.doi.find((d) => d.produto === "05004010")!;
  expect(mocajuba.doi).toBe(30); // 60 un ÷ (180/90 un/dia)
  expect(r.doi.find((d) => d.produto === "0020305006")!.doi).toBe(180); // 4 kg ÷ (2 kg/90 d)
});
