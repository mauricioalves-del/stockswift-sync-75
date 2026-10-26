import { expect, test } from "bun:test";
import { BAIXAS_EM_ABERTO, somarBaixasEmAberto, chaveSaldoBaixa, saldoLiquidoBaixas } from "../src/lib/abastecimento-baixas";
import { montarItens, PARAM2_PADRAO, type Bruto } from "../src/lib/abastecimento-dados";
const baixa = (status_fluxo: string, quantidade = 2, id_local = "Loja") => ({ codigo_produto: "05004001", id_local, quantidade, status_fluxo });
for (const status of BAIXAS_EM_ABERTO) test(`Baixa ${status} abate o saldo durante aprovação`, () => {
  expect(somarBaixasEmAberto([baixa(status)]).get(chaveSaldoBaixa("5004001", "Loja"))).toBe(2);
});
for (const status of ["APROVADA", "EXECUTADA", "REPROVADA"]) test(`Baixa ${status} não é descontada como aberta`, () => {
  expect(somarBaixasEmAberto([baixa(status)]).size).toBe(0);
});
test("Vínculo por produto e almoxarifado soma lotes e normaliza zeros", () => {
  const m = somarBaixasEmAberto([baixa("PENDENTE"), { ...baixa("ANALISE", 3), codigo_produto: "5004001" }, baixa("PENDENTE", 7, "Outra"), { ...baixa("PENDENTE", 9), codigo_produto: "999" }]);
  expect(m.get(chaveSaldoBaixa("05004001", "Loja"))).toBe(5);
  expect(m.get(chaveSaldoBaixa("05004001", "Outra"))).toBe(7);
  expect(m.get(chaveSaldoBaixa("999", "Loja"))).toBe(9);
});
test("Baixa executada ou sem almoxarifado não gera reserva", () => {
  expect(somarBaixasEmAberto([{ ...baixa("PENDENTE"), data_execucao: "2026-10-26" }, { ...baixa("PENDENTE"), id_local: null }]).size).toBe(0);
  expect(saldoLiquidoBaixas(1, 4)).toBe(0);
});
const bruto = (): Bruto => ({ lojas: [{ codigo: "LOJA", nome: "Loja", almoxarifado: "Loja" }], cd: "CD", params: PARAM2_PADRAO,
  consenso: [{ loja: "LOJA", id_produto: "05004001", mes: "2026-10", unidades: 31 }], grupos: [{ codigo_produto: "05004001", grupo: "Produto Acabado" }], familias: [], abc: [], periodos: [], consumo: [],
  estoque: [{ id_produto: "05004001", origem: "Loja", quantidade: 6 }, { id_produto: "05004001", origem: "CD", quantidade: 20 }], notas: [], pedidosAbertos: [], produtos: [], exposicoes: [], baixas: [baixa("PENDENTE", 6), baixa("AGUARDANDO_ADMIN", 15, "CD")],
});
test("Baixas antecipam ruptura e sugestão, limitando atendimento pelo saldo líquido do CD", () => {
  const b = bruto(); const opts = { base: "consenso" as const, denominador: "calendario" as const, hojeIso: "2026-10-26" };
  const anterior = montarItens(b, opts).itens.LOJA[0];
  const atual = montarItens(b, { ...opts, considerarBaixas: true }).itens.LOJA[0];
  expect(anterior.estoque).toBe(6); expect(anterior.sugestao).toBe(0);
  expect(atual.estoqueBruto).toBe(6); expect(atual.baixasPendentes).toBe(6); expect(atual.estoque).toBe(0);
  expect(atual.status).toBe("ruptura"); expect(atual.sugestao).toBe(10);
  expect(atual.baixasCD).toBe(15); expect(atual.saldoCD).toBe(5); expect(atual.qtdAtendida).toBe(5);
});
test("Trânsito e pedido aberto continuam abatendo a sugestão após as baixas", () => {
  const b = bruto(); b.pedidosAbertos = [{ loja: "LOJA", id_produto: "05004001", qtd: 10, status: "ENVIADO" }];
  const i = montarItens(b, { base: "consenso", denominador: "calendario", hojeIso: "2026-10-26", considerarBaixas: true }).itens.LOJA[0];
  expect(i.estoque).toBe(0); expect(i.projetado).toBe(10); expect(i.sugestao).toBe(0);
});