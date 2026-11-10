import { describe, expect, it } from "vitest";
import { decisoes, type LinhaDisp } from "@/lib/dispersao-painel";

const f = { atencao: 5, critico: 20 };
const l = (p: Partial<LinhaDisp>): LinhaDisp => ({ id_op: "OP1", mes: "2026-10", empresa: "Fábrica", material: "M1", desc_material: "Mat 1", produto: "P1", desc_produto: "Produto 1", qtd_previsto: 10, qtd_consumo: 10, qtd_dif: 0, custo: 1, impacto: 0, ...p });

describe("decisões recomendadas da dispersão", () => {
  it("lista no detalhe todos os materiais não previstos com os produtos acabados", () => {
    const linhas = [
      l({ material: "NP1", desc_material: "Não previsto 1", qtd_previsto: 0, qtd_consumo: 5, qtd_dif: 5, impacto: 50, desc_produto: "Bombom A" }),
      l({ material: "NP2", desc_material: "Não previsto 2", qtd_previsto: 0, qtd_consumo: 2, qtd_dif: 2, impacto: 20, id_op: "OP2", desc_produto: "Bombom B" }),
    ];
    const d = decisoes(linhas, f).find((x) => x.t.includes("sem estar previsto"));
    expect(d?.linhas.map((x) => x.material)).toEqual(["NP1", "NP2"]);
    expect(d?.linhas[0].produtos).toEqual(["Bombom A"]);
  });

  it("detalha linhas sem custo agregadas por material", () => {
    const linhas = [
      l({ material: "SC", custo: 0, qtd_dif: 3, id_op: "OP1" }),
      l({ material: "SC", custo: 0, qtd_dif: 2, id_op: "OP2" }),
    ];
    const d = decisoes(linhas, f).find((x) => x.t.includes("sem custo"));
    expect(d?.linhas).toHaveLength(1);
    expect(d?.linhas[0].valores.slice(0, 2)).toEqual(["2", "2"]);
  });
});
