import { expect, test } from "bun:test";
import { normalizarUnidade, tomUnidade, unidadeDosLotes } from "../src/lib/inventario-unidade";

test("KG e LT ficam em destaque, em qualquer grafia", () => {
  for (const un of ["KG", "kg", " Kg ", "KG.", "LT", "lt", "LT."]) {
    expect(tomUnidade(un)).toBe("alerta");
  }
});

test("Demais unidades ficam no padrão", () => {
  for (const un of ["PC", "UN", "CX", "PAR", "M", "UN ", ""]) {
    expect(tomUnidade(un)).toBe("padrao");
  }
  expect(tomUnidade(null)).toBe("padrao");
  expect(tomUnidade(undefined)).toBe("padrao");
});

test("Normalizar não confunde KGS com KG de outro nome", () => {
  expect(normalizarUnidade("  k g . ")).toBe("KG");
  expect(normalizarUnidade(null)).toBe("");
});

test("Unidade do SKU vem do primeiro lote que tenha unidade", () => {
  expect(unidadeDosLotes([{ unidade: null }, { unidade: " KG " }, { unidade: "PC" }])).toBe("KG");
  expect(unidadeDosLotes([{ unidade: null }, { unidade: "" }])).toBe("");
});
