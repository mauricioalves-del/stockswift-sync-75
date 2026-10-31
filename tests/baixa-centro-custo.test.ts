import { expect, test } from "bun:test";
import { resolverCentroCusto } from "../src/lib/baixa-centro-custo";

test("Descarte/Descontinuado usa P10008 - PRODUTO mesmo com almox definido", () => {
  expect(resolverCentroCusto("Descarte/Descontinuado", "AREA", "ALMOX")).toBe("P10008 - PRODUTO");
});
test("Sensorial/Inovações usa P10008 - PRODUTO", () => {
  expect(resolverCentroCusto("Sensorial/Inovações", "AREA", "ALMOX")).toBe("P10008 - PRODUTO");
});
test("Cortesia usa a área escolhida em vez do almoxarifado", () => {
  expect(resolverCentroCusto("Cortesia", "AREA", "ALMOX")).toBe("AREA");
});
test("Degustação usa a operação escolhida", () => {
  expect(resolverCentroCusto("Degustação", "OPERACAO", "ALMOX")).toBe("OPERACAO");
});
test("Motivos restantes referenciam diretamente o almoxarifado", () => {
  for (const motivo of ["Avaria", "Descarte/Qualidade", "Sensorial/Qualidade", "Envio/Laboratório", "Inventário", "Perda/Furto", "Uso e Consumo", "Vencimento", "Devolução/Transferência"]) {
    expect(resolverCentroCusto(motivo, "AREA", "ALMOX")).toBe("ALMOX");
  }
});
test("Centro não cadastrado não é inventado nem substitui a área pelo almox", () => {
  expect(resolverCentroCusto("Cortesia", null, "ALMOX")).toBeNull();
  expect(resolverCentroCusto("Avaria", "AREA", " ")).toBeNull();
});