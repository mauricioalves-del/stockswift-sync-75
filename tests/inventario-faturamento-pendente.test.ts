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

describe("prioridades da conciliação", () => {
  const linhas = [
    { sku: "A", descricao: "", sistema: 10, final: 0, dif: -10, falta: 10, preco: 10, qtd: 0, valor: 0 },
    { sku: "B", descricao: "", sistema: 1, final: 0, dif: -1, falta: 1, preco: 5, qtd: 0, valor: 0 },
    { sku: "C", descricao: "", sistema: 1, final: 0, dif: -1, falta: 1, preco: 5, qtd: 0, valor: 0 },
  ];
  it("com o mesmo valor, prefere mais produtos diferentes", () => {
    const r = conciliarValorAberto(linhas, 20); // 10+5+5 em vez de 10+10
    expect(r.total).toBe(20);
    expect(r.linhas.filter((l) => l.qtd > 0).length).toBe(3);
  });
  it("itens já faturados deixam de contar como falta disponível", () => {
    const d = divergentesAcabados([{ codigo_produto: "1", descricao: "", grupo: "Produto Acabado", qtd_sistema: 5, qtd_final: 5, qtd_faturada: 2 }], new Map([["1", 10]]));
    expect(d[0]?.dif).toBe(-2);
    expect(d[0]?.qtd).toBe(2);
  });
});

describe("tolerância acima do valor em aberto", () => {
  const linhas = [
    { sku: "A", descricao: "", sistema: 1, final: 0, dif: -1, falta: 1, preco: 8.5, qtd: 0, valor: 0 },
    { sku: "B", descricao: "", sistema: 1, final: 0, dif: -1, falta: 1, preco: 9.9, qtd: 0, valor: 0 },
  ];
  it("pode passar até R$ 10 para cobrir o valor com mais produtos", () => {
    const r = conciliarValorAberto(linhas, 12, 10);
    expect(r.total).toBe(18.4);
  });
  it("nunca passa mais de R$ 10 do valor em aberto", () => {
    const r = conciliarValorAberto(linhas, 5, 10);
    expect(r.total).toBeLessThanOrEqual(15);
    expect(r.total).toBe(8.5); // mesmo nº de produtos: o mais próximo do valor
  });
});
