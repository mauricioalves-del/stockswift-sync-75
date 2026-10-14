import { test, expect } from "bun:test";
import { elegivelPortfolio, prepararPortfolio, normalizarClassePortfolio } from "../src/lib/abastecimento-portfolio";

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