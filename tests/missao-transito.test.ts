import { describe, expect, it } from "vitest";
import { somarTransitoMissao, type NotaTransitoMissao } from "../src/lib/missao-transito";

const lojas = [{ codigo: "PATIO", almoxarifado: "Alm_Paulista" }, { codigo: "ELDORADO", almoxarifado: "Almox ElDorado" }];
const nota: NotaTransitoMissao = { cod_prod: "5104020", almox: "Pátio Paulista", qtd: 30, nr_nf: "2000", lote: "L1", recebimento: "Pendente", nota_cancelada: null };
const somar = (notas: NotaTransitoMissao[], origem: string | null = "Alm_Paulista") => somarTransitoMissao(notas, origem, ["05104020"], lojas, "Alm_SP_Fabrica");

describe("Estoque em trânsito na contagem", () => {
  it("vincula SKU sem zeros à esquerda ao almoxarifado de destino", () => {
    expect(somar([nota]).get("5104020")?.qtd).toBe(30);
    expect(somar([nota], "Almox ElDorado").size).toBe(0);
  });
  it("exclui notas recebidas, regularizadas e canceladas", () => {
    expect(somar([{ ...nota, recebimento: "Recebido" }, { ...nota, recebimento: "Regularizado" }, { ...nota, nota_cancelada: "S" }]).size).toBe(0);
  });
  it("soma lotes e notas pendentes preservando os detalhes para conferência", () => {
    const r = somar([nota, { ...nota, lote: "L2", qtd: 5 }, { ...nota, nr_nf: "2001", qtd: 10 }]).get("5104020");
    expect(r?.qtd).toBe(45);
    expect(r?.notas).toBe(2);
    expect(r?.detalhes).toHaveLength(3);
  });
  it("não mistura SKUs ou missões sem almoxarifado", () => {
    expect(somar([{ ...nota, cod_prod: "999" }]).size).toBe(0);
    expect(somar([nota], null).size).toBe(0);
  });
  it("aceita destino operacional exato sem atribuir Processo ao CD", () => {
    expect(somar([{ ...nota, almox: "Alm_SP_Processo" }], "Alm_SP_Processo").get("5104020")?.qtd).toBe(30);
    expect(somar([{ ...nota, almox: "Fabrica" }], "Alm_SP_Processo").size).toBe(0);
  });
});