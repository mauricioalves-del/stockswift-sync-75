import { describe, expect, it } from "vitest";
import { montarCaixaria } from "../src/lib/abastecimento-caixaria";
import { PARAM2_PADRAO, type Bruto } from "../src/lib/abastecimento-dados";

const bruto: Bruto = {
  lojas: [{ codigo: "JESUINO", nome: "Loja Jesuino", almoxarifado: "Alm_SP_Loja" }, { codigo: "ELDORADO", nome: "Loja Eldorado", almoxarifado: "Alm_Eldorado" }],
  cd: "CD", params: PARAM2_PADRAO, consenso: [], grupos: [], familias: [{ codigo_produto: "00540001", familia: "Revenda" }], abc: [], periodos: [], consumo: [], estoque: [], notas: [], pedidosAbertos: [],
  produtos: [{ id_produto: "00540001", full_case: 15 }, { id_produto: "00540002", full_case: 10 }],
  exposicoes: [{ loja: "JESUINO", id_produto: "00540001", exposicao: 14 }, { loja: "ELDORADO", id_produto: "00540001", exposicao: 0 }, { loja: "ELDORADO", id_produto: "00540002", exposicao: 6 }],
};

describe("Cadastro individual de caixaria e exposição", () => {
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
  it("inclui portfólio aprovado sem exposição própria, sem trazer caixa de outra loja", () => {
    const linhas = montarCaixaria({ ...bruto, exposicoes: [], portfolioAprovado: { JESUINO: ["00540002"] } }, { loja: "JESUINO" });
    expect(linhas.map((l) => l.chave)).toEqual(["540002"]);
  });
  it("usa consenso da loja quando não existe portfólio aprovado", () => {
    const linhas = montarCaixaria({ ...bruto, exposicoes: [], grupos: [{ codigo_produto: "540002", grupo: "Produto Acabado" }], consenso: [{ loja: "JESUINO", id_produto: "540002", mes: "2026-11", unidades: 10 }] }, { loja: "JESUINO" });
    expect(linhas.map((l) => l.chave)).toEqual(["540002"]);
    expect(montarCaixaria(bruto).length).toBe(2);
  });
});