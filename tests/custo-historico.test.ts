import { expect, test } from "bun:test";
import { agregarCustoContabil, regiaoDe, skuNorm } from "../src/lib/custo-historico";
test("Custo contábil ponderado por SKU e região", () => {
  expect([skuNorm("05004008"), regiaoDe("Alm_Para"), regiaoDe("Almox_PA_Para"), regiaoDe("Alm_SP_Fabrica")]).toEqual(["5004008", "PA", "PA", "SP"]);
  const r = agregarCustoContabil([
    { id_produto: "05004008", origem: "Alm_SP_Fabrica", quantidade: 10, custo_contabil: 6, custo_padrao: 7.2 },
    { id_produto: "5004008", origem: "Alm_SP_Loja", quantidade: 30, custo_contabil: 7, custo_padrao: 7.2 },
    { id_produto: "05004008", origem: "Alm_Para", quantidade: 5, custo_contabil: 5, custo_padrao: 7.2 },
    { id_produto: "0001", origem: "Alm_SP_Loja", quantidade: 5, custo_contabil: 0, custo_padrao: 3 },
  ]);
  expect(r.find((x) => x.regiao === "SP")).toMatchObject({ sku: "5004008", custo_contabil: 6.75, quantidade: 40 });
  expect(r.find((x) => x.regiao === "PA")).toMatchObject({ custo_contabil: 5 });
  expect(r.length).toBe(2);
});
