import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { lerPlanilhaErp } from "../src/lib/erp-importador";

test("Reconhece as abas do ERP pelo cabeçalho e mapeia as colunas", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[null, "TipoMaterial", "Id_produto", "Descricao", "UM", "Status", "Empresa", "id_seq", "Id_Op", "Dt_Prevista", "Qtd_Prevista", "Qtd_Prod", "Qtd_Saldo", "Dt_Producao", "Dt_Registro", "Custo_Contabil"], [null, "Produto", "05004010", "MAGIO Povos Mocajuba 74% 60g", "PC", "Produzida", "Filial SP - Fabrica", 1, 4837, new Date(2026, 7, 12), 200, 151, 49, new Date(2026, 7, 13), new Date(2026, 7, 13), 2.5]]), "BASE PRODUÇÃO DIA");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Soma de qtd"], ["Comentario", "Descricao", "id_pedido", "cliente", "produto", "qtd"], ["(Patio) Faturamento", "Xiba", 22525, "Consumidor", "05004178", 1]]), "FATURAMENTO PENDENTE");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const r = lerPlanilhaErp(buf);
  const op = r.lidas.find((l) => l.base === "producao_op")!;
  expect(op.linhas[0]).toMatchObject({ id_op: "4837", id_produto: "05004010", qtd_prevista: 200, qtd_prod: 151, dt_producao: "2026-08-13", um: "PC" });
  expect(r.lidas.find((l) => l.base === "faturamento_pendente")!.linhas[0]).toMatchObject({ id_pedido: "22525", produto: "05004178", qtd: 1 });
  expect(r.faltando.sort()).toEqual(["faturamento", "producao_mes", "saldo_estoque"]);
});
