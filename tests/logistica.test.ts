import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { indicadoresLogistica, lerPlanilhaFretes, natureza } from "../src/lib/logistica";
import { erroExclusaoSolicitacao, podeExcluirSolicitacao } from "../src/lib/tms";

test("Lê envios, trechos do PJ e LATAM sem duplicar; natureza do frete", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Data de entrega", "Número do Pedido/cupom/NF", "Valor do Pedido", "Cliente", "Operação", "CC", "Modo de envio", "KM", "Fora SP Capital", "Estado", "Custo do Frete (R$)", " Isopor (R$)", " Gelox (R$)", "Total de Custos (R$)", "Valor Cobrado do Cliente (R$)", "Lucro/Prejuízo (R$)", "Observações"],
    ["8/3/2026", 15011, 415.52, "STEFANO", "Venda", "COMERCIAL", "LALAMOVE", null, "Não", "SP", 10.43, 0, 0, 10.43, 0, -10.43, null],
    ["8/3/2026", "*", "*", "RETIRADA POLPA", "Suprimentos", "OPERAÇÃO", "LALAMOVE", null, "Não", "SP", 38.39, 0, 0, 38.39, 0, -38.39, null],
    ["8/6/2026", "*", "*", "ENVIO ESTRUT ATIVAÇÃO", "Ativação Magalu", "ATIVAÇÃO", "PRESTADOR EXTERNO MIGUEL", null, "Não", "SP", 380.38, 0, 0, 380.38, 0, -380.38, null],
  ]), "CONTROLE DE FRETES MODAIS");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["RELATÓRIO DE QUILOMETRAGEM - AGOSTO / 2026"], ["Data", "Saída", "Destino", "Operação", "CC", "KMs", "Valor (R$)"],
    ["8/3/2026", "Residência (Rua X)", "Latam Cargo", "Latam SP", "OPERAÇÃO", 32.5, 65],
    ["8/7/2026", "Mágio", "Biogás", "Ativação Biogas", "ATIVAÇÃO", 7.9, 31.6],
  ]), "CONTROLE FRESTES NELSON");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Data", "Número do Pedido/cupom/NF", "Valor do Pedido", "Cliente", "Operação", "CC", "Modo de envio", "Origem / Destino", "Fora SP Capital", "Estado", "Kilograma", "Valor kg", "Custo do Frete (R$)", " Isopor (R$)", " Gelox (R$)", "Seguro", "Total de Custos (R$)", "Valor Cobrado do Cliente (R$)", "Lucro/Prejuízo (R$)", "Observações"],
    ["8/17/2026", 1816, 1663.17, "De mendes", "Latam PA", "OPERAÇÃO", "Latam Aereo", "BEL / CGH", "Sim", "PA", 108.5, 3.42, 371.07, 50, 0, 0, 421.07, 0, -421.07, null],
    ["8/17/2026", null, null, "De mendes", "Latam PA", "OPERAÇÃO", "Latam Aereo", "BEL / CGH", "Sim", "PA", 108.5, 3.42, 371.07, 25, 0, 0, 396.07, 0, -396.07, null],
  ]), "CONTROLE FRETE LATAM - ERMERSON");
  const r = lerPlanilhaFretes(XLSX.write(wb, { type: "array", bookType: "xlsx" }), "teste.xlsx");
  expect(r.envios.length).toBe(4); // a linha duplicada da LATAM fica de fora
  expect(r.trechos.length).toBe(2);
  expect(r.envios.map((e) => e.natureza)).toEqual(["venda", "compra", "interno", "interno"]);
  const k = indicadoresLogistica(r.envios, r.trechos, [{ prestador: "Nelson", mes: "2026-08", valor: 4000, rateio: {} }], "2026-08-01", "2026-08-31");
  expect(k.transf).toMatchObject({ qtd: 1, kg: 108.5 });
  expect(k.pj).toMatchObject({ valorKm: 96.6, fixo: 4000, residencia: 65, trechosResidencia: 1 });
  expect(natureza("Cortesia", "COMERCIAL", "CORTESIA")).toBe("venda");
});

test("Só administrador e gerente podem excluir solicitação; mensagem do banco fica amigável", () => {
  expect(["ADMINISTRADOR", "GERENTE"].map(podeExcluirSolicitacao)).toEqual([true, true]);
  expect(["COORDENADOR_CONTROLE", "INVENTARIANTE", "CONSULTA", "VENDEDOR", "OPERADOR_ESTOQUE", "DIRETOR_OPERACOES", "COORDENADOR_FINANCEIRO", "AUDITOR", null, undefined].map(podeExcluirSolicitacao)).toEqual(new Array(10).fill(false));
  expect(erroExclusaoSolicitacao('A solicitação #12 já virou ordem de serviço. Exclua a ordem antes de excluir a solicitação.')).toContain("Follow-up");
  expect(erroExclusaoSolicitacao("duplicate key")).toBe("duplicate key");
  expect(erroExclusaoSolicitacao(null)).toBe("Não foi possível excluir a solicitação.");
});
