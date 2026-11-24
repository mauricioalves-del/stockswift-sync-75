import { expect, test } from "bun:test";
import { destinoRecontagem, participaRecontagem, recontagemValida } from "../src/lib/inventario-recontagem";

const a = { key: "a", conta: true, reconta: false, recontadaPor: "" };
const b = { key: "b", conta: false, reconta: true, recontadaPor: "" };

test("Uma pessoa em uma única dupla pode contar e recontar", () => {
  expect(destinoRecontagem(a)).toBe("a");
  expect(recontagemValida(a, [a])).toBe(true);
  expect(participaRecontagem(a, [a])).toBe(true);
});

test("Outra dupla de recontagem continua opcional", () => {
  const externa = { ...a, recontadaPor: "b" };
  expect(destinoRecontagem(externa)).toBe("b");
  expect(recontagemValida(externa, [externa, b])).toBe(true);
  expect(participaRecontagem(externa, [externa, b])).toBe(false);
  expect(participaRecontagem(b, [externa, b])).toBe(true);
});

test("Destino externo inexistente ou sem função de recontagem é recusado", () => {
  const externa = { ...a, recontadaPor: "b" };
  expect(recontagemValida(externa, [externa])).toBe(false);
  expect(recontagemValida(externa, [externa, { ...b, reconta: false }])).toBe(false);
});