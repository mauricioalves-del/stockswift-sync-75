import { test, expect } from "bun:test";
import { elegivelPortfolio, prepararPortfolio, normalizarClassePortfolio, classesDoPortfolioAprovado } from "../src/lib/abastecimento-portfolio";

test("Reposição usa a Classe validada por SKU, normaliza códigos e não inclui itens inativos", () => {
  const aprovado = [{ sku: "05304043", ativo: true, classe: "MTO" }, { sku: "05104132", ativo: false, classe: "LINHA" }];
  expect(classesDoPortfolioAprovado(aprovado)).toEqual({ "5304043": "MTO" });
  expect(classesDoPortfolioAprovado([])["5304043"]).toBeUndefined();
});

test("Inovação fica fora da meta durante três meses", () => {
  expect(elegivelPortfolio("INOVACAO","2026-10-14","2027-01-13")).toBe(false);
  expect(elegivelPortfolio("INOVACAO","2026-10-14","2027-01-14")).toBe(true);
});
test("MTO e Decomplex são excluídos e Linha é elegível", () => {
  expect(elegivelPortfolio("MTO",null,"2026-10-14")).toBe(false);
  expect(elegivelPortfolio("DECOMPLEX",null,"2026-10-14")).toBe(false);
  expect(elegivelPortfolio("LINHA",null,"2026-10-14")).toBe(true);
});
test("Deconplex é normalizado sem criar outra classe", () => { expect(normalizarClassePortfolio("Deconplex")).toBe("DECOMPLEX"); });
test("Importação rejeita duplicados, inexistentes e Inovação sem início", () => {
  const p=prepararPortfolio([{SKU:"005004001",Cluster:"Linha"},{SKU:"5004001",Cluster:"Inovação"},{SKU:"999999",Cluster:"MTO"}], [{sku:"005004001",descricao:"Produto"}], [], "2026-10-14","2026-10-14");
  expect(p[0].erros).toEqual([]);
  expect(p[0].sku).toBe("005004001");
  expect(p[1].erros).toContain("SKU duplicado");
  expect(p[1].erros).toContain("Informe início da Inovação válido, até a vigência");
  expect(p[2].erros).toContain("SKU não encontrado no cadastro");
});
import { situacaoCompetencia, criarElegibilidade } from "../src/lib/abastecimento-validacao";
test("outubro sem validação herda setembro e fica pendente", () => {
  const v: any = { loja: "JESUINO", status: "VALIDADA", competencia: "2026-09", aprovado_em: "2026-09-02T10:00:00Z" };
  expect(situacaoCompetencia([v], "JESUINO", "2026-10").tipo).toBe("HERDADA");
  expect(situacaoCompetencia([], "JESUINO", "2026-10").tipo).toBe("SEM");
});
test("SKU Linha em setembro e MTO em outubro mantém setembro elegível", () => {
  const el = criarElegibilidade([{ sku: "5004147", classe: "LINHA", vigencia: "2026-09-01", registrado_em: "a", inicio_inovacao: null }, { sku: "5004147", classe: "MTO", vigencia: "2026-10-01", registrado_em: "b", inicio_inovacao: null }]);
  expect(el("05004147", "2026-09-15")).toBe(true);
  expect(el("05004147", "2026-10-15")).toBe(false);
});
