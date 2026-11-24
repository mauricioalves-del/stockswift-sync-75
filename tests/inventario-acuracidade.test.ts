import { expect, test } from "bun:test";
import { acuracidadePorItem } from "../src/lib/inventario-acuracidade";

test("Pará: 50 acurados entre 58 conferidos resulta em 86,2%, sem incluir o pendente", () => {
  const itens = [
    ...Array.from({ length: 50 }, () => ({ st: "ACURADO" })),
    ...Array.from({ length: 8 }, () => ({ st: "DIVERGENTE" })),
    { st: "PENDENTE" },
  ];
  expect(acuracidadePorItem(itens)).toBe(86.2);
});

test("Cada item pesa igualmente, independentemente de suas quantidades", () => {
  const itens = [
    { st: "ACURADO", sistema: 10000, total: 10000 },
    { st: "DIVERGENTE", sistema: 1, total: 0 },
  ];
  expect(acuracidadePorItem(itens)).toBe(50);
});

test("Sem itens avaliados ou sem saldo visível não inventa acuracidade", () => {
  expect(acuracidadePorItem([])).toBeNull();
  expect(acuracidadePorItem([{ st: "PENDENTE" }, { st: "CONTADO" }])).toBeNull();
});

test("Itens acurados com saldo zero também contam", () => {
  expect(acuracidadePorItem([{ st: "ACURADO" }])).toBe(100);
  expect(acuracidadePorItem([{ st: "DIVERGENTE" }])).toBe(0);
});