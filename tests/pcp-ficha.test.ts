import { expect, test } from "bun:test";
import { coberturaLotes, mapaCalor, nivel, prazoEntrega, resumoConsumo } from "../src/lib/pcp-ficha";

test("Mapa de calor e resumo de consumo", () => {
  const pts = [{ data: "2026-11-06", qtd: 10 }, { data: "2026-11-05", qtd: 2 }, { data: "2026-10-01", qtd: 30 }, { data: "2026-06-01", qtd: 99 }];
  const m = mapaCalor(pts, "2026-11-07", 91);
  expect(m.semanas[0].dias[0].data <= "2026-08-09").toBe(true);
  expect(m.semanas.at(-1)!.dias.find((d) => d.data === "2026-11-06")!.qtd).toBe(10);
  expect([nivel(0, m.limites), nivel(2, m.limites), nivel(30, m.limites)]).toEqual([0, 1, 3]);
  const r = resumoConsumo(pts, "2026-11-07", 91);
  expect([r.total, r.diasComMovimento, r.pico.qtd]).toEqual([42, 3, 30]);
  expect(r.media30).toBeCloseTo(12 / 30);
});

test("Cobertura por lote (FEFO) e risco de vencimento", () => {
  const r = coberturaLotes([{ lote: "B", validade: "2026-12-31", qtd: 50 }, { lote: "A", validade: "2026-11-17", qtd: 30 }], 2, "2026-11-07");
  expect(r.linhas.map((l) => l.lote)).toEqual(["A", "B"]);
  // lote A: 30 un a 2/dia = 15 dias, vence em 10 dias -> 10 un em risco
  expect(r.linhas[0].emRisco).toBe(10);
  expect(r.diasCobertura).toBe(40);
});

test("Prazo de entrega pela capacidade livre", () => {
  const p = prazoEntrega({ semanas: ["2026-11-09", "2026-11-16", "2026-11-23"], cargaOutros: [900, 500, 0], capacidade: 1000, quantidade: 400, diasQualidade: 2, diasProcesso: 3, hoje: "2026-11-07" });
  expect(p.porSemana).toEqual([100, 300]);
  expect([p.semana, p.entrega]).toEqual(["2026-11-16", "2026-11-25"]);
});
