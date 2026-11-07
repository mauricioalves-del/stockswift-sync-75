import { expect, test } from "bun:test";
import { acoesRecomendadas, matrizMps, mrpPorSemana, proximasSemanas } from "../src/lib/pcp-plano";
import type { BomLinha } from "../src/lib/pcp-bom";

const B = (pai: string, item: string, qtd: number, tem_filho = false): BomLinha => ({ id_produto: "R", id_subconjunto: pai, id_item: item, item: `Item ${item}`, qtd, tem_filho, gera_oc: null, item_unidade: "KG" });

test("Semanas e plano mestre", () => {
  expect(proximasSemanas("2026-11-07", 3)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  const sem = proximasSemanas("2026-11-09", 3);
  const m = matrizMps([
    { sku: "A", descricao: "A", quantidade: 100, liberar: "2026-11-06", urgente: true }, // atrasada -> primeira semana
    { sku: "A", descricao: "A", quantidade: 50, liberar: "2026-11-13" },
    { sku: "B", descricao: "B", quantidade: 30, liberar: "2026-12-30" },                 // depois do horizonte
  ], sem);
  expect(m.linhas[0].sku).toBe("A");
  expect(m.totais.reduce((a, b) => a + b, 0)).toBe(150);
  expect(m.depois).toBe(30);
});

test("MRP por semana consome saldo e calcula prazo de compra", () => {
  const bom = [B("P1", "MP1", 0.5), B("P1", "SUB", 1, true), B("SUB", "MP2", 2)];
  const ordens = [
    { sku: "P1", descricao: "P1", quantidade: 100, liberar: "2026-11-11" }, // semana de produção 09/11
    { sku: "P1", descricao: "P1", quantidade: 100, liberar: "2026-11-18" }, // semana de produção 16/11
  ];
  const r = mrpPorSemana(ordens, bom, { MP1: 60, SUB: 50, MP2: 0 }, { MP1: 10, MP2: 2 }, { leadCompraDias: 10, hoje: "2026-11-07" });
  const mp1 = r.itens.find((i) => i.id === "MP1")!;
  expect([mp1.necessidade, mp1.falta, mp1.primeiraFalta]).toEqual([100, 40, "2026-11-16"]);
  expect([mp1.comprarAte, mp1.atrasado]).toEqual(["2026-11-06", true]);
  expect(mp1.valorFalta).toBe(400);
  const mp2 = r.itens.find((i) => i.id === "MP2")!;
  // semana 1: SUB cobre 50 de 100 -> MP2 = 2 x 50; semana 2: SUB zerado -> MP2 = 2 x 100
  expect([mp2.necessidade, mp2.falta, mp2.atrasado]).toEqual([300, 300, true]);
});

test("Ações recomendadas priorizam o que é urgente", () => {
  const a = acoesRecomendadas({
    ordensHoje: [{ sku: "A", descricao: "Barra", quantidade: 200 }],
    carga: [{ semana: "2026-11-09", unidades: 3500, pct: 125 }, { semana: "2026-11-16", unidades: 1000, pct: 36 }],
    capacidade: 2800, compras: [], perdaValidade: [], semRegistro: 0, realizacao: 1.3, semBom: 0,
  });
  expect(a[0].prioridade).toBe("alta");
  expect(a.map((x) => x.area)).toContain("Capacidade");
  expect(a.some((x) => x.area === "Demanda")).toBe(true);
});
