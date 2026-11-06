import { expect, test } from "bun:test";
import { almoxDoFarol, coberturaItens, conciliacaoPorDia, dataPlanilha, diasDaSemana, linhasPlanilhaErp, movimentosPorDia, nivelServico, prazoConferencia, situacaoDia } from "../src/lib/farol-movimentados";

test("Identifica os almoxarifados do processo (ERP e Atlas)", () => {
  expect(almoxDoFarol("Almox - SP Fabrica")).toBe("FABRICA");
  expect(almoxDoFarol("Almox_SP_Processo")).toBe("PROCESSO");
  expect(almoxDoFarol("Almox_SP_Qualidade")).toBe("QUALIDADE");
  expect(almoxDoFarol("Almox_PA_Para")).toBe("PARA");
  expect(almoxDoFarol("Almox - PA Pará")).toBe("PARA");
  expect(almoxDoFarol("Almox_SP_Loja")).toBeNull();
});

test("Prazo D+1 útil e semana de segunda a sexta", () => {
  expect(prazoConferencia("2026-11-05")).toBe("2026-11-06");
  expect(prazoConferencia("2026-11-06")).toBe("2026-11-09");
  expect(diasDaSemana("2026-11-08")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
});

test("Movimentado de várias bases × conciliação do Atlas", () => {
  const mov = movimentosPorDia([
    { data: "2026-11-02T12:00:00Z", desc_almox: "Almox - SP Fabrica", id_produto: "1", descricao: "A", qtd: -5 },
    { data: "2026-11-02", desc_almox: "Almox_SP_Fabrica", id_produto: "1", descricao: "A", qtd: 3, saldo: 40 },
    { data: "2026-11-02", desc_almox: "Almox_SP_Fabrica", id_produto: "2", descricao: "B", qtd: 1 },
    { data: "2026-11-03", desc_almox: "Almox_SP_Fabrica", id_produto: "1", descricao: "A", qtd: 1 },
  ]);
  const itens = mov.get("FABRICA|2026-11-02")!;
  expect(itens.map((i) => [i.sku, i.qtd, i.saldo])).toEqual([["1", 8, 40], ["2", 1, null]]);
  const conc = (linhas: { sku: string; div?: boolean; em?: string | null }[]) => conciliacaoPorDia(linhas.map((l) => ({ almoxarifado: "Almox_SP_Fabrica", data: "2026-11-02", sku: l.sku, divergente: !!l.div, em: l.em ?? null }))).get("FABRICA|2026-11-02");
  const s1 = situacaoDia(itens, conc([{ sku: "1", em: "2026-11-03T15:00:00Z" }, { sku: "002", div: true }]), "2026-11-02", "2026-11-05");
  expect([s1.tipo, "divergentes" in s1 ? s1.divergentes : -1]).toEqual(["CONFERIDO", 1]);
  // Upload feito no prazo cumpre a rotina mesmo sem cobrir todos os SKUs; a cobertura é medida à parte.
  const parcial = situacaoDia(itens, conc([{ sku: "1", em: "2026-11-03T10:00:00Z" }]), "2026-11-02", "2026-11-05");
  expect(parcial.tipo).toBe("CONFERIDO");
  expect(coberturaItens([parcial, s1])).toEqual({ conciliados: 3, itens: 4, pct: 0.75 });
  // Antes do início da cobrança do D+1 (05/11), envio atrasado conta como cumprido; a partir daí, é atraso.
  expect(situacaoDia(itens, conc([{ sku: "1", em: "2026-11-04T15:00:00Z" }, { sku: "2" }]), "2026-11-02", "2026-11-05").tipo).toBe("CONFERIDO");
  const mov5 = movimentosPorDia([{ data: "2026-11-05", desc_almox: "Almox_SP_Fabrica", id_produto: "1", descricao: "A", qtd: 1 }]).get("FABRICA|2026-11-05");
  const conc5 = conciliacaoPorDia([{ almoxarifado: "Almox_SP_Fabrica", data: "2026-11-05", sku: "1", divergente: false, em: "2026-11-09T15:00:00Z" }]).get("FABRICA|2026-11-05");
  expect(situacaoDia(mov5, conc5, "2026-11-05", "2026-11-10").tipo).toBe("ATRASADO");
  expect(situacaoDia(itens, undefined, "2026-11-02", "2026-11-05").tipo).toBe("FALHA");
  expect(situacaoDia(mov.get("FABRICA|2026-11-03"), undefined, "2026-11-03", "2026-11-04").tipo).toBe("PENDENTE");
  const n = nivelServico([s1, situacaoDia(itens, undefined, "2026-11-02", "2026-11-05"), situacaoDia(undefined, undefined, "2026-11-04", "2026-11-05")]);
  expect([n.vencidos, n.cumpridos, n.falhas, n.nivel]).toEqual([2, 1, 1, 0.5]);
});

test("Importador da planilha do ERP (Planilha2)", () => {
  expect(dataPlanilha(46332)).toBe("2026-11-06");
  expect(dataPlanilha("05/11/2026")).toBe("2026-11-05");
  const { linhas, erros } = linhasPlanilhaErp([
    { id_produto: "0050305006", descricao: "Massa", Data: 46332, doc: "5752/1", desc_movimento: "Processo Producao Estorno", desc_almox: "Almox Processo - SP Fabrica", qtd: 5.9976, id_lote: "L1" },
    { id_produto: "05004175", descricao: "Língua", Data: "2026-11-05", doc: "1", desc_movimento: "Baixar Estoque", desc_almox: "Almox - SP Loja", qtd: "3", id_lote: "" },
    { id_produto: "1", Data: "x", desc_almox: "Almox - PARA", qtd: 1 },
  ]);
  expect(linhas.map((l) => [l.almox, l.data, l.qtd])).toEqual([["PROCESSO", "2026-11-06", 5.9976], [null, "2026-11-05", 3]]);
  expect(erros.length).toBe(1);
  expect(almoxDoFarol("Almox - PARA")).toBe("PARA");
});
