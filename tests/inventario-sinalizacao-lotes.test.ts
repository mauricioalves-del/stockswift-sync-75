import { expect, test } from "bun:test";
import { sinalLote } from "../src/lib/inventario-sinalizacao-lotes";

test("falta no lote concluído é negativa, mesmo dentro da tolerância do SKU", () => {
  expect(sinalLote(true, 99, 100)).toBe("NEG");
});
test("sobra no lote concluído é positiva", () => {
  expect(sinalLote(true, 101, 100)).toBe("POS");
});
test("quantidade correta no lote concluído é acurada, inclusive zero", () => {
  expect(sinalLote(true, 100, 100)).toBe("OK");
  expect(sinalLote(true, 0, 0)).toBe("OK");
});
test("não sinaliza antes de concluir o produto nem inventa saldo na contagem cega", () => {
  expect(sinalLote(false, 99, 100)).toBeNull();
  expect(sinalLote(true, 99, null)).toBeNull();
  expect(sinalLote(true, null, 100)).toBeNull();
});
test("lotes divergentes não se anulam quando o total do produto confere", () => {
  expect([sinalLote(true, 8, 10), sinalLote(true, 12, 10)]).toEqual(["NEG", "POS"]);
});