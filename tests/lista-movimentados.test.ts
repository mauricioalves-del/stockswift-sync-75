import { expect, test } from "bun:test";
import { almoxDaLista, classificar, montarLista, nomeArquivo, planilha, transferencia } from "../supabase/functions/lista-movimentados/logica";

const L = (desc_movimento: string, desc_almox: string, id_produto: string, qtd: number, doc = "1", data = "2026-11-05") =>
  ({ data, desc_almox, id_produto, descricao: `Prod ${id_produto}`, doc, desc_movimento, qtd });

test("Identifica almoxarifados e transferências", () => {
  expect(almoxDaLista("Almox - SP Fabrica")).toBe("GERAL");
  expect(almoxDaLista("Almox Processo - SP Fabrica")).toBe("PROCESSO");
  expect(almoxDaLista("Almox Qualidade")).toBe("QUALIDADE");
  expect(almoxDaLista("Almox - PARA")).toBe("PARA");
  expect(almoxDaLista("Processo")).toBe("PROCESSO");
  expect(almoxDaLista("FabricaSP")).toBe("GERAL");
  expect(almoxDaLista("Almox - SP Loja")).toBeNull();
  expect(transferencia("Fabrica SP --> Processo")).toEqual({ origem: "Fabrica SP", destino: "Processo" });
  expect(transferencia("Loja SP -> Fabrica SP")).toEqual({ origem: "Loja SP", destino: "Fabrica SP" });
  expect(transferencia("Baixar Estoque - PDV Pátio Paulista")).toBeNull();
});

test("Lista do dia por almox, como a planilha", () => {
  const movs = [
    L("Fabrica SP --> Processo", "Almox - SP Fabrica", "0050303003", 4.2, "5721"),
    L("Fabrica SP --> Processo", "Almox Processo - SP Fabrica", "0050303003", 4.2, "5721"), // mesma transferência, outra ponta
    L("Entrada Recebto", "Almox - SP Fabrica", "0140106801", 12, "NF1"),
    L("Baixar Estoque", "Almox - SP Fabrica", "0140106801", 2, "B1"),
    L("Processo Producao ", "Almox Processo - SP Fabrica", "0050305006", 5, "P1"),
    L("Processo Producao ", "Almox Processo - SP Fabrica", "0050305007", 3, "P2"),
    L("Entrada Recebto", "Almox - SP Fabrica", "0999", 1, "NF2", "2026-11-04"), // outro dia
  ];
  const saldos = [
    { id_produto: "0050303003", almox: "Alm_SP_Fabrica", quantidade: 180, unidade: "KG", custo: 10 },
    { id_produto: "0050303003", almox: "Alm_SP_Fabrica", quantidade: 4.056, unidade: "KG", custo: 10 },
    { id_produto: "0050303003", almox: "Alm_SP_Processo", quantidade: 4.2, unidade: "KG", custo: 10 },
    { id_produto: "0050305006", almox: "Alm_SP_Processo", quantidade: 98.9, unidade: "KG", custo: 20 },
  ];
  const grupos = new Map([["50303003", "Produto em Processo"], ["140106801", "Materia Prima"]]);
  expect(classificar(movs, "2026-11-05").length).toBe(6);
  const geral = montarLista("GERAL", "2026-11-05", movs, saldos, grupos);
  expect(geral.map((l) => [l.sku, l.unid, l.sistema, l.entrada, l.saidas])).toEqual([
    ["0140106801", "PC", 0, 12, 2], ["0050303003", "KG", 184.056, 0, 4.2],
  ]);
  const proc = montarLista("PROCESSO", "2026-11-05", movs, saldos, grupos);
  expect(proc.map((l) => [l.sku, l.sistema, l.entrada, l.saidas])).toEqual([["0050305006", 98.9, 5, null], ["0050305007", 0, 3, null], ["0050303003", 4.2, 4.2, null]]);
  // Processo: entrou e saiu a mesma quantidade com saldo zero -> desconsiderado
  const p2 = montarLista("PROCESSO", "2026-11-05", [L("Fabrica SP --> Processo", "x", "77", 2, "T1"), L("Processo --> FabricaSP", "x", "77", 2, "T2")], [], grupos);
  expect(p2.length).toBe(0);
  expect(nomeArquivo("PARA", "2026-11-05")).toBe("Movimentação - Pará 05.11.xlsx");
  const p = planilha(geral);
  expect(p.cabecalho.slice(0, 13)).toEqual(["Grupo", "Data", "Id_Produto", "descricao", "Unid.", "Sistema", "Entrada", "Saídas", "Contagem", "Teste", "Dif", "Obs", "Prejuízo"]);
  expect(p.linhas[0][9]).toEqual({ f: 'IF(I2="","",I2=F2)' });
});
