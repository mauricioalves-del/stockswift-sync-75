import { expect, test } from "bun:test";
import { almoxDoFarol, diasDaSemana, movimentosPorDia, nivelServico, prazoConferencia, situacaoDia, type Conferencia } from "../src/lib/farol-movimentados";

test("Identifica os almoxarifados do processo", () => {
  expect(almoxDoFarol("Almox - SP Fabrica")).toBe("FABRICA");
  expect(almoxDoFarol("Alm_SP_Processo")).toBe("PROCESSO");
  expect(almoxDoFarol("Almox - SP Qualidade")).toBe("QUALIDADE");
  expect(almoxDoFarol("Almox - PA Pará")).toBe("PARA");
  expect(almoxDoFarol("Alm_SP_Loja")).toBeNull();
});

test("Prazo D+1 útil e semana de segunda a sexta", () => {
  expect(prazoConferencia("2026-11-05")).toBe("2026-11-06"); // qui → sex
  expect(prazoConferencia("2026-11-06")).toBe("2026-11-09"); // sex → seg
  expect(diasDaSemana("2026-11-08")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
});

test("Situação do dia e nível de serviço", () => {
  const mov = movimentosPorDia([
    { data: "2026-11-02T12:00:00Z", desc_almox: "Almox - SP Fabrica", id_produto: "1", descricao: "A", qtd: -5 },
    { data: "2026-11-02T12:00:00Z", desc_almox: "Almox - SP Fabrica", id_produto: "1", descricao: "A", qtd: 3 },
    { data: "2026-11-02T12:00:00Z", desc_almox: "Almox - SP Fabrica", id_produto: "2", descricao: "B", qtd: 1 },
    { data: "2026-11-03T12:00:00Z", desc_almox: "Almox - SP Fabrica", id_produto: "1", descricao: "A", qtd: 1 },
  ]);
  const itens = mov.get("FABRICA|2026-11-02")!;
  expect(itens.map((i) => [i.sku, i.qtd])).toEqual([["1", 8], ["2", 1]]);
  const conf = (em: string, n: number): Conferencia => ({ id: "c", almox: "FABRICA", data_movimento: "2026-11-02", conferido_em: em, conferente_nome: "X",
    itens_movimentados: 2, itens_conferidos: n, divergentes: 0, observacao: null, itens: [] });
  expect(situacaoDia(itens, conf("2026-11-03T15:00:00Z", 2), "2026-11-02", "2026-11-05").tipo).toBe("CONFERIDO");
  expect(situacaoDia(itens, conf("2026-11-03T15:00:00Z", 1), "2026-11-02", "2026-11-05").tipo).toBe("PARCIAL");
  expect(situacaoDia(itens, conf("2026-11-04T15:00:00Z", 2), "2026-11-02", "2026-11-05").tipo).toBe("ATRASADO");
  expect(situacaoDia(itens, null, "2026-11-02", "2026-11-05").tipo).toBe("FALHA");
  expect(situacaoDia(mov.get("FABRICA|2026-11-03"), null, "2026-11-03", "2026-11-04").tipo).toBe("PENDENTE");
  expect(situacaoDia(undefined, null, "2026-11-04", "2026-11-05").tipo).toBe("SEM_MOV");
  const n = nivelServico([
    situacaoDia(itens, conf("2026-11-03T15:00:00Z", 2), "2026-11-02", "2026-11-05"),
    situacaoDia(itens, null, "2026-11-02", "2026-11-05"),
    situacaoDia(mov.get("FABRICA|2026-11-03"), null, "2026-11-03", "2026-11-04"),
  ]);
  expect([n.vencidos, n.cumpridos, n.falhas, n.pendentes, n.nivel]).toEqual([2, 1, 1, 1, 0.5]);
});
