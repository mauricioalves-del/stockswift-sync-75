import { expect, test } from "bun:test";
import { atingimentoMeta } from "../src/lib/mbr/dados3";

test("Atingimento pelo sentido da meta (perda: menor é melhor)", () => {
  // outubro: teto de perda −R$ 2.008, perda real −R$ 1.325,04 → batida (o export mostrava 66%)
  expect(atingimentoMeta(-2008, -1325.04, true)).toBe(151.5);
  expect(atingimentoMeta(-3882, -2883.61, true)).toBe(134.6);
  expect(atingimentoMeta(-1000, -1200, true)).toBe(83.3); // perda acima do teto: não batida
  expect(atingimentoMeta(-500, 0, true)).toBe(200);
  // indicadores de acurácia: maior é melhor
  expect(atingimentoMeta(99, 99.31, false)).toBe(100.3);
  expect(atingimentoMeta(null, 10, false)).toBeNull();
});
