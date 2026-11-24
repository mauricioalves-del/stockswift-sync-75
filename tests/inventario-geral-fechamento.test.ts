import { expect, test } from "bun:test";
import { linhasDoInventario } from "../src/lib/inventario-geral-fechamento";
test("Uma linha por SKU com a contagem final oficial e o status do fechamento", () => {
  const base = { descricao: "Amêndoa", grupo: "Materia Prima", unidade: "KG", origem_item: "lista", observacao: null, dupla_recontagem: null, identificado_recontagem: null, qtd_recontagem: null, divergente: false };
  const l = linhasDoInventario([
    { ...base, codigo_produto: "0080301006", lote: "A", qtd_sistema: 14, qtd_contagem: 14, qtd_final: 14 },
    { ...base, codigo_produto: "0080301006", lote: "B", qtd_sistema: 40.5, qtd_contagem: 40.5, qtd_final: 40.5 },
    { ...base, codigo_produto: "0150101001", lote: "X", qtd_sistema: 20, qtd_contagem: 12, qtd_final: 15, divergente: true, qtd_recontagem: 15, identificado_recontagem: false, dupla_recontagem: "Dupla 2" },
  ], "Alm_Para", new Date("2026-11-24T12:00:00"));
  expect(l[0]).toContain("Contagem 1");
  expect(l[1].slice(1, 8)).toEqual(["0080301006", "Amêndoa", "Alm_Para", "KG", 54.5, 54.5, "Sem divergência"]);
  expect(l[2].slice(5, 8)).toEqual([20, 15, "Divergência"]);
  expect(String(l[2][8])).toContain("identificado na 2ª contagem: Não");
});
