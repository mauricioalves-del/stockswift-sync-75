import { expect, test } from "bun:test";
import { mapaNomesSistema, nomeDoSistema, variantesSku } from "../src/lib/abastecimento-nome-sistema";

test("Pedido exibe Caixa de Bombons M (descrição do sistema) mesmo gravado como Caixa de Natal M", () => {
  const sistema = mapaNomesSistema([{ id_produto: "05004148", descricao: "Caixa de Bombons M (14 bombons)" }]);
  expect(nomeDoSistema("5004148", "Caixa de Natal M (14 bombons)", sistema)).toBe("Caixa de Bombons M (14 bombons)");
  expect(nomeDoSistema("05004148", "Caixa de Natal M (14 bombons)", sistema)).toBe("Caixa de Bombons M (14 bombons)");
});
test("Sem descrição no sistema, mantém a gravada no pedido", () => {
  const sistema = mapaNomesSistema([{ id_produto: "999", descricao: " " }, { id_produto: "998", descricao: "998" }]);
  expect(nomeDoSistema("999", "Gravada", sistema)).toBe("Gravada");
  expect(nomeDoSistema("998", "Gravada", sistema)).toBe("Gravada");
});
test("Busca o código com e sem zeros à esquerda", () => {
  expect(variantesSku("5004148")).toEqual(["5004148", "05004148", "0005004148"]);
});
