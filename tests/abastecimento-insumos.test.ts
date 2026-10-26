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

test("Busca descrição no estoque nativo quando o catálogo repete apenas o SKU", () => {
  const cat = catalogoComInsumos([{ sku: "00123", descricao: "123" }], [{ codigo_produto: "00123", grupo: "Embalagem" }], [{ id_produto: " 123 ", descricao: " Embalagem nativa " }], [{ id_produto: "123", descricao: "00123" }]);
  expect(cat[0].descricao).toBe("Embalagem nativa");
});

test("Descrição registrada prevalece e descrição vazia não apaga o nome nativo", () => {
  const grupos = [{ codigo_produto: "00123", grupo: "Embalagem" }];
  const estoque = [{ id_produto: "123", descricao: "Nome nativo" }];
  expect(catalogoComInsumos([], grupos, estoque, [{ id_produto: "123", descricao: "Nome registrado" }])[0].descricao).toBe("Nome registrado");
  expect(catalogoComInsumos([], grupos, estoque, [{ id_produto: "123", descricao: "  " }])[0].descricao).toBe("Nome nativo");
});