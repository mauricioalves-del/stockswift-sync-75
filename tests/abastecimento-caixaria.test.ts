import { describe, expect, it } from "vitest";
import { montarCaixaria } from "../src/lib/abastecimento-caixaria";
import { PARAM2_PADRAO, type Bruto } from "../src/lib/abastecimento-dados";

const bruto: Bruto = {
  lojas: [{ codigo: "JESUINO", nome: "Loja Jesuino", almoxarifado: "Alm_SP_Loja" }, { codigo: "ELDORADO", nome: "Loja Eldorado", almoxarifado: "Alm_Eldorado" }],
  cd: "CD", params: PARAM2_PADRAO, consenso: [], grupos: [], familias: [{ codigo_produto: "00540001", familia: "Revenda" }], abc: [], periodos: [], consumo: [], estoque: [], notas: [], pedidosAbertos: [],
  produtos: [{ id_produto: "00540001", full_case: 15 }, { id_produto: "00540002", full_case: 10 }],
  exposicoes: [{ loja: "JESUINO", id_produto: "00540001", exposicao: 14 }, { loja: "ELDORADO", id_produto: "00540001", exposicao: 0 }, { loja: "ELDORADO", id_produto: "00540002", exposicao: 6 }],
  portfolioAprovado: { JESUINO: ["00540001"], ELDORADO: ["00540001", "00540002"] },
};

describe("Catálogo traz apenas itens aprovados", () => {
  it("sem aprovação, o catálogo fica vazio mesmo com caixa e exposição cadastradas", () => {
    const semAprovacao: Bruto = { ...bruto, portfolioAprovado: undefined };
    expect(montarCaixaria(semAprovacao).length).toBe(0);
  });
  it("todas as lojas: união dos portfólios aprovados; item fora do portfólio não entra", () => {
    expect(montarCaixaria(bruto).map((l) => l.chave)).toEqual(["540001", "540002"]);
    const comExtra = { ...bruto, produtos: [...bruto.produtos, { id_produto: "00540003", full_case: 8 }], exposicoes: [...bruto.exposicoes, { loja: "JESUINO", id_produto: "00540003", exposicao: 3 }] };
    expect(montarCaixaria(comExtra).map((l) => l.chave)).toEqual(["540001", "540002"]);
  });
  it("seleciona apenas cadastros da loja escolhida", () => {
    expect(montarCaixaria(bruto, { loja: "JESUINO" }).map((l) => l.chave)).toEqual(["540001"]);
    expect(montarCaixaria(bruto, { loja: "ELDORADO" }).map((l) => l.chave)).toEqual(["540001", "540002"]);
  });
  it("preserva exposições individuais, inclusive zero", () => {
    expect(montarCaixaria(bruto, { loja: "JESUINO" })[0].expo.JESUINO.valor).toBe(14);
    expect(montarCaixaria(bruto, { loja: "ELDORADO" })[0].expo.ELDORADO.valor).toBe(0);
  });
  it("usa a categoria registrada por SKU normalizado, nunca a família", () => {
    const linhas = montarCaixaria(bruto, { categorias: [{ codigo_produto: " 540001 ", categoria: "Água" }] });
    expect(linhas[0].categoria).toBe("Água");
    expect(linhas[1].categoria).toBe("");
  });
  it("inclui item do portfólio aprovado sem exposição própria, sem trazer caixa de outra loja", () => {
    const linhas = montarCaixaria({ ...bruto, exposicoes: [], portfolioAprovado: { JESUINO: ["00540002"] } }, { loja: "JESUINO" });
    expect(linhas.map((l) => l.chave)).toEqual(["540002"]);
  });
  it("usa o consenso da loja quando ela ainda não tem portfólio aprovado", () => {
    const b: Bruto = { ...bruto, portfolioAprovado: undefined, exposicoes: [], grupos: [{ codigo_produto: "540002", grupo: "Produto Acabado" }], consenso: [{ loja: "JESUINO", id_produto: "540002", mes: "2026-11", unidades: 10 } as never] };
    expect(montarCaixaria(b, { loja: "JESUINO" }).map((l) => l.chave)).toEqual(["540002"]);
    expect(montarCaixaria(b, { loja: "ELDORADO" }).map((l) => l.chave)).toEqual([]);
    expect(montarCaixaria(b).map((l) => l.chave)).toEqual(["540002"]);
  });
});
