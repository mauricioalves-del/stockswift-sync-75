import { expect, test } from "bun:test";
import { mensagemWebhookObs, padraoPosicionamento, prazoPosicionamento, somaDiasUteis, tituloTrendObs, totalValor } from "../src/lib/obsoletos-slack";

const itens = [
  { sku: "0070301006", descricao: "Amêndoa de Cacau Seca Aprovada", lote: "070010108", almoxarifado: "Alm_Para", dias_sem_mov: 77, faixa: "61-90", quantidade: 888, valor: 33300 },
  { sku: "01902131201", descricao: "Sacola SSAL Circular", lote: "R999006857011", almoxarifado: "Alm_Box", dias_sem_mov: null, faixa: "+90", quantidade: 200, valor: 12000 },
];

test("Prazo pela faixa mais crítica, em dias úteis", () => {
  const p = prazoPosicionamento(itens, new Date(2026, 10, 13)); // sexta 13/11
  expect([p.faixa, p.dias, p.data.getDate()]).toEqual(["+90", 3, 18]); // seg 16, ter 17, qua 18
  expect(somaDiasUteis(new Date(2026, 10, 16), 5).getDate()).toBe(23);
});

test("Título, padrão de posicionamento e mensagem única", () => {
  expect(tituloTrendObs("Escoar Pará", "Alm_Box, Alm_Para", new Date(2026, 10, 13), 7)).toBe(":warning: *Risco sem Giro #7* - Escoar Pará - Almox - Alm_Box, Alm_Para - 13/11/2026");
  const pad = padraoPosicionamento(["Comercial", "Produtos"], { dias: 3, data: new Date(2026, 10, 18), faixa: "+90" });
  expect(pad).toContain("COMERCIAL | SKU:"); expect(pad).toContain("PRODUTOS | SKU:"); expect(pad).toContain("18/11/2026");
  expect(padraoPosicionamento(["Comercial"], { dias: 3, data: new Date(), faixa: "+90" })).not.toContain("PRODUTOS |");
  expect(totalValor(itens)).toBe(45300);
  const m = mensagemWebhookObs({ titulo: "T", mencoes: ["<@U1>"], departamentos: ["Comercial"], itens, equipes: ["Comercial", "Produtos"], prazo: { dias: 3, data: new Date(2026, 10, 18), faixa: "+90" } });
  expect(m).toContain("R$ 45.300,00"); expect(m).toContain("Amêndoa de Cacau");
});
