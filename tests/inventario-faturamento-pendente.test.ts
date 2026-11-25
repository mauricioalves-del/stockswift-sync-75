import { describe, expect, it } from "vitest";
import { conciliarValorAberto, divergentesAcabados } from "@/lib/inventario-faturamento-pendente";

const precos = new Map([["5004148", 50], ["5004009", 30], ["900", 10]]);
const itens = [
  { codigo_produto: "05004148", descricao: "Caixa M", grupo: "Produto Acabado", qtd_sistema: 3, qtd_final: 1 },
  { codigo_produto: "05004148", descricao: "Caixa M", grupo: "Produto Acabado", qtd_sistema: 0, qtd_final: 0 },
  { codigo_produto: "05004009", descricao: "Barra", grupo: "Produto Acabado", qtd_sistema: 5, qtd_final: 2 },
  { codigo_produto: "900", descricao: "Embalagem", grupo: "Embalagem", qtd_sistema: 9, qtd_final: 1 },
  { codigo_produto: "777", descricao: "Lote trocado", grupo: "Produto Acabado", qtd_sistema: 4, qtd_final: 4 },
];

describe("conciliação de valor em aberto", () => {
  it("lista só produto acabado com diferença no total dos lotes", () => {
    expect(divergentesAcabados(itens, precos).map((l) => l.sku)).toEqual(["05004009", "05004148"]);
  });
  it("chega exatamente ao valor em aberto quando possível", () => {
    const r = conciliarValorAberto(divergentesAcabados(itens, precos), 140); // 50*1 + 30*3
    expect(r.total).toBe(140);
    expect(r.restante).toBe(0);
  });
  it("nunca ultrapassa o valor em aberto nem a falta de cada produto", () => {
    const r = conciliarValorAberto(divergentesAcabados(itens, precos), 1000);
    expect(r.total).toBe(190); // 2*50 + 3*30
    expect(r.linhas.find((l) => l.sku === "05004148")?.qtd).toBe(2);
  });
});
