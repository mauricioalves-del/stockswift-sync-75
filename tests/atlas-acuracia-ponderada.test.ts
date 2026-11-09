import { describe, expect, it } from "vitest";
import { detalhesFaixa, faixaAcuracia, magnitude, montarInventario } from "@/lib/atlas-inventario";

describe("farol de acurácia (indicador H)", () => {
  it("abaixo de 60% fica vermelho", () => {
    expect(faixaAcuracia(59.99)).toBe("vermelho");
  });
  it("entre 60% e 95% fica amarelo", () => {
    expect(faixaAcuracia(60)).toBe("amarelo");
    expect(faixaAcuracia(90)).toBe("amarelo");
    expect(faixaAcuracia(94.99)).toBe("amarelo");
  });
  it("95% ou mais fica verde", () => {
    expect(faixaAcuracia(95)).toBe("verde");
    expect(faixaAcuracia(100)).toBe("verde");
  });
  it("sem valor não recebe cor", () => {
    expect(faixaAcuracia(null)).toBeNull();
  });
});

describe("detalhes por faixa de tamanho (indicador G)", () => {
  const D = montarInventario(
    [{ id: 1, almoxarifado: "Alm_A", data_fechamento: "2026-10-05" }],
    [
      { id: 10, fechamento_id: 1, sku: "A", descricao_produto: "Produto A", almoxarifado: "Alm_A", qtd_sistema: 10, qtd_contagem: 7, divergencia_qtd: -3, valor_estimado: 30, divergente: true },
      { id: 11, fechamento_id: 1, sku: "B", descricao_produto: "Produto B", almoxarifado: "Alm_A", qtd_sistema: 50, qtd_contagem: 80, divergencia_qtd: 30, valor_estimado: 90, divergente: true },
      { id: 12, fechamento_id: 1, sku: "C", descricao_produto: "Produto C", almoxarifado: "Alm_A", qtd_sistema: 5, qtd_contagem: 5, divergencia_qtd: 0, valor_estimado: 0, divergente: false },
    ],
    [],
  );
  it("lista exatamente os itens que o gráfico conta na faixa", () => {
    const f = { almox: null, mes: null };
    const lista = detalhesFaixa(D, f, "0 a 5 un.");
    expect(lista.map((l) => l.sku)).toEqual(["A"]);
    expect(lista[0]).toMatchObject({ descricao: "Produto A", sistema: 10, contagem: 7, divergencia: -3, valor: 30 });
    expect(lista.length).toBe(magnitude(D, f).faixas[0].itens);
    expect(detalhesFaixa(D, f, "20 a 100 un.").map((l) => l.sku)).toEqual(["B"]);
  });
});
