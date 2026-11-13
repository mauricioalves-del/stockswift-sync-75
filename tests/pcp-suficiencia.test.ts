import { expect, test } from "bun:test";
import { estruturaAplicada, suficienciaProducao } from "../src/lib/pcp-suficiencia";

const L = (p: string, pai: string, item: string, qtd: number, tem_filho = false) => ({ id_produto: p, id_subconjunto: pai, id_item: item, item, qtd, tem_filho, item_unidade: "KG" });
const bom = [L("P", "P", "MASSA", 0.01, true), L("P", "P", "CX", 1), L("P", "MASSA", "CACAU", 0.6), L("P", "MASSA", "ACUCAR", 0.4)];

test("Falta de Produto em Processo gera OP de PP com antecedência e checa a matéria-prima", () => {
  const r = suficienciaProducao([{ sku: "P", descricao: "Produto", porSemana: [500, 1000] }], ["2026-11-16", "2026-11-23"], bom as any, { MASSA: 8, CX: 5000, CACAU: 5, ACUCAR: 100 }, { prazoPPDias: 3, hoje: "2026-11-13" });
  const massa = r.pp[0];
  // necessidade 5 + 10 kg; saldo 8 → falta 7 kg na 2ª semana
  expect([massa.total, massa.falta, massa.semanaFalta]).toEqual([15, 7, 1]);
  expect(massa.sugestao).toEqual({ quantidade: 7, semana: "2026-11-23", liberarAte: "2026-11-20", atrasada: false });
  // para 7 kg de massa: 4,2 kg de cacau (saldo 5) e 2,8 kg de açúcar → MP suficiente
  expect(massa.mpFaltantes).toEqual([]);
  expect(r.resumo).toMatchObject({ pp: 1, opsPP: 1, mpFaltando: 0 });
});

test("Estrutura aplicada nas últimas OPs × ficha técnica", () => {
  const c = [1, 2, 3].flatMap((op) => [
    { id_op: `OP${op}`, data_producao: `2026-11-0${op}`, produto: "P", material: "CX", qtd_consumo: 100, qtd_produzida: 100 },
    { id_op: `OP${op}`, data_producao: `2026-11-0${op}`, produto: "P", material: "MASSA", qtd_consumo: 1.3, qtd_produzida: 100 },
    { id_op: `OP${op}`, data_producao: `2026-11-0${op}`, produto: "P", material: "NIBS", qtd_consumo: 0.2, qtd_produzida: 100 },
  ]);
  const r = estruturaAplicada(c, bom as any, ["P"]);
  const m = Object.fromEntries(r[0].linhas.map((l) => [l.id, l.leitura.split(":")[0]]));
  expect(m).toEqual({ MASSA: "Consome acima da ficha", NIBS: "Consumido sem estar na ficha" });
});
