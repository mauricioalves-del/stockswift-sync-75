import { expect, test } from "bun:test";
import { catalogoComInsumos, grupoInsumo } from "../src/lib/abastecimento-insumos";

for (const grupo of ["Mercadoria de Revenda", "Embalagem", "Materia Prima"]) {
  test(`Permite adicionar ${grupo} sem exigir inclusão no portfólio`, () => {
    const cat = catalogoComInsumos([], [{ codigo_produto: "00123", grupo }], [{ id_produto: "123", descricao: "Insumo" }]);
    expect(cat).toEqual([{ sku: "00123", descricao: "Insumo", grupo, aprovado: false }]);
  });
}
test("Preserva portfólio aprovado, deduplica SKU e não libera outros grupos", () => {
  const cat = catalogoComInsumos([{ sku: "00123", descricao: "Nome aprovado" }], [{ codigo_produto: "123", grupo: "Embalagem" }, { codigo_produto: "456", grupo: "Material de limpeza" }], []);
  expect(cat).toEqual([{ sku: "00123", descricao: "Nome aprovado", grupo: "Embalagem", aprovado: true }]);
});
test("Normaliza acentos, maiúsculas e espaços dos grupos", () => {
  expect(grupoInsumo(" MATÉRIA PRIMA ")).toBe("Materia Prima");
  expect(grupoInsumo("Produto Acabado")).toBeNull();
});