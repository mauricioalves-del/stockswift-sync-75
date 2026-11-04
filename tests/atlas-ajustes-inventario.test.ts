import { expect, test } from "bun:test";
import { contaComoAjusteInventario, escolherAbaAjustes, planejarAjustes, valorContado, type AjusteExistente } from "../src/lib/atlas-ajustes-inventario";

const CAB = ["Id_Produto", "Status", "Id_Invent", "Dt_Invent", "Almox", "Descricao", "Id_Lote", "Qtd", "Cont1", "Ajuste", "Custo", "Vlr_Total", "Grupo", "Obs", "Inventário"];
const linha = (o: Partial<Record<string, unknown>> = {}) => {
  const base: Record<string, unknown> = { Id_Produto: "05004015", Status: "Fechado", Id_Invent: 900, Dt_Invent: new Date(2026, 9, 15), Almox: "Almox Fabrica", Descricao: "Língua de Onça", Id_Lote: "L1", Qtd: 10, Cont1: 8, Ajuste: -2, Custo: 5, Vlr_Total: -10, Grupo: "Produto Acabado", Obs: null, "Inventário": null, ...o };
  return CAB.map((c) => base[c] ?? null);
};

test("Regra de contagem: desde jul/2026 sempre conta; antes só 'Sim'", () => {
  expect(contaComoAjusteInventario("2026-07-01", "Não")).toBe(true);
  expect(contaComoAjusteInventario("2026-10-15", null)).toBe(true);
  expect(contaComoAjusteInventario("2026-06-30", "Sim")).toBe(true);
  expect(contaComoAjusteInventario("2026-06-30", " sim ")).toBe(true);
  expect(contaComoAjusteInventario("2026-06-30", "Não")).toBe(false);
  expect(contaComoAjusteInventario("2025-11-30", 2025)).toBe(false);
});

test("Classifica as linhas, normaliza o almoxarifado e soma só o que conta", () => {
  const p = planejarAjustes([CAB,
    linha(),
    linha({ Id_Produto: "05004016", Dt_Invent: new Date(2026, 4, 10), "Inventário": "Sim", Vlr_Total: -30 }),
    linha({ Id_Produto: "05004017", Dt_Invent: new Date(2026, 4, 10), "Inventário": "Não", Vlr_Total: -99 }),
    linha({ Id_Produto: "05004018", Dt_Invent: new Date(2025, 10, 10), "Inventário": 2025, Vlr_Total: -77 }),
    linha({ Id_Produto: null }),
  ], [], "Inventários - Sistema.xlsx", "teste");
  expect([p.total, p.novas.length, p.contadas, p.ignoradasNao, p.ignoradasLegado]).toEqual([4, 4, 2, 1, 1]);
  expect(valorContado(p.novas)).toBe(-40);
  expect(p.novas[0]).toMatchObject({ sku: "05004015", dt_invent: "2026-10-15", almoxarifado: "Almox_SP_Fabrica", almoxarifado_origem: "Almox Fabrica", ajuste_qtd: -2, conta_como_ajuste_inventario: true });
});

test("Reenvio da planilha acumulada: idênticas são puladas; custo recalculado só atualiza", () => {
  const ex: AjusteExistente = { id: 7, sku: "05004015", status: "Fechado", id_invent: 900, dt_invent: "2026-10-15", almoxarifado_origem: "Almox Fabrica", id_lote: "L1", qtd_sistema: 10, qtd_contagem: 8, ajuste_qtd: -2, custo_unitario: 5, valor_total: -10, lote_id: 3 };
  const p = planejarAjustes([CAB,
    linha(), linha(),                                   // idêntica ao banco (2x)
    linha({ Id_Produto: "05004016" }), linha({ Id_Produto: "05004016" }),   // nova, repetida no arquivo
    linha({ Id_Lote: "L2", Custo: 6, Vlr_Total: -12 }),  // nova (outro lote) — mesmo Id_Invent já existente
  ], [ex], "a.xlsx", "teste");
  expect([p.duplicadasAnteriores, p.duplicadasArquivo, p.novas.length]).toEqual([2, 1, 2]);
  expect(p.idsInventRepetidos).toEqual([900]);

  const c = planejarAjustes([CAB, linha({ Custo: 5.5, Vlr_Total: -11 })], [ex], "b.xlsx", "teste");
  expect([c.novas.length, c.custosCorrigidos, c.valorCorrecaoCusto]).toEqual([0, 1, -1]);
  expect(c.correcoes).toEqual([{ id: 7, lote_id: 3, custo_unitario: 5.5, valor_total: -11 }]);
});

test("Escolhe a aba Estoque, ou a que tem Id_Produto e Ajuste; cabeçalho sem acento também vale", () => {
  const pl = (abas: Record<string, unknown[][]>) => ({ abas: Object.keys(abas), ler: (a: string) => abas[a] });
  expect(escolherAbaAjustes(pl({ Resumo: [["x"]], Estoque: [CAB] }))).toBe("Estoque");
  expect(escolherAbaAjustes(pl({ Resumo: [["x"]], Planilha1: [CAB] }))).toBe("Planilha1");
  expect(() => escolherAbaAjustes(pl({ Resumo: [["x"]] }))).toThrow(/Estoque/);
  const semAcento = CAB.map((c) => (c === "Inventário" ? "Inventario" : c));
  const p = planejarAjustes([semAcento, linha({ Dt_Invent: "15/05/2026", "Inventário": "Sim" })], [], "c.xlsx", "teste");
  expect([p.contadas, p.novas[0].dt_invent]).toEqual([1, "2026-05-15"]);
  expect(() => planejarAjustes([["Id_Produto", "Qtd"]], [], "d.xlsx", "t")).toThrow(/Dt_Invent, Ajuste/);
});
