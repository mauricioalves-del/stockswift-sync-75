import { describe, expect, it } from "vitest";
import { montarExcelAuditoria, type PacoteAuditoria } from "../src/lib/inventario-auditoria-excel";

function pacote(): PacoteAuditoria {
  const item = (lote: string, sistema: number, final: number, faturada = 0): PacoteAuditoria["itens"][number] => ({ id: lote, inventario_id: "inv8", codigo_produto: "05000001", descricao: "Bombom", grupo: "Produto acabado", lote, qtd_sistema: sistema, qtd_contagem: 1, qtd_recontagem: final, qtd_final: final, qtd_faturada: faturada, custo_unitario: 2.5, contado_em: null, contado_por: null, created_at: "2026-11-25", created_by: null, divergente: true, dupla_id: null, dupla_recontagem_id: null, identificado_recontagem: null, local_fisico: "Prateleira 2", observacao: "Conferido", origem_item: "sistema", recontado_em: null, recontado_por: null, unidade: "UN" });
  return {
    dados: { custos: new Map(), fechamentos: [{ id: 139, almoxarifado: "Loja", data: "2026-11-25", mes: "2026-11" }], itens: [{ id: 1, fechamento_id: 139, sku: "05000001", descricao: "Bombom", almoxarifado: "Loja", categoria: "Produto acabado", qtd_sistema: 10, qtd_contagem: 10, divergencia: 0, valor: 0, pct: 1, divergente: false, mes: "2026-11", data: "2026-11-25", recorrente: false, recorrencias: 0 }] },
    filtro: { almox: "Loja", mes: "2026-11" },
    inventarios: [{ id: "inv8", numero: 8, titulo: "Loja", almoxarifado: "Loja", status: "finalizado", data_geracao: "2026-11-25", apurado_em: null, created_at: "2026-11-25", criado_por: null, criterio_abc: null, dupla_padrao_id: null, exibir_sistema: true, finalizado_em: null, finalizado_por: null, gerada_em: null, gerada_por: null, observacao: null, tolerancia_pct: 0 }],
    itens: [item("00000000001234567890", 6, 4), item("B", 4, 6)],
    duplas: [], usuarios: [], historico: [], assinaturas: [], fechamentos: [], validades: new Map(), indicadores: {}, geradoEm: "2026-11-25T15:27:00Z",
  };
}
describe("Excel de auditoria do inventário", () => {
  it("preserva SKU e lote como texto, usa Final e distingue correção de lote sem falta real", () => {
    const wb = montarExcelAuditoria(pacote()); const lotes = wb.getWorksheet("Contagens por lote");
    expect(lotes?.getCell("D2").value).toBe("05000001");
    expect(lotes?.getCell("G2").value).toBe("00000000001234567890");
    expect(lotes?.getCell("N2").value).toBe(4);
    expect(lotes?.getCell("Q2").value).toEqual({ formula: 'IF(N2="","",N2-K2)', result: -2 });
    expect(wb.getWorksheet("Ajustes e correções de lote")?.getCell("I2").value).toBe("CORRECAO_LOTE");
    expect(wb.getWorksheet("Divergências oficiais")?.rowCount).toBe(1);
  });
  it("exclui todos os lotes do SKU faturado do ajuste geral e registra faturamento e FEFO separados", () => {
    const p = pacote(); const primeiro = p.itens[0]; if (!primeiro) throw new Error("Fixture sem lote");
    primeiro.qtd_faturada = 2;
    p.validades.set("inv8", new Map([[primeiro.lote, "2026-12-01"], ["B", "2026-11-30"]]));
    const wb = montarExcelAuditoria(p);
    expect(wb.getWorksheet("Ajustes e correções de lote")?.rowCount).toBe(1);
    expect(wb.getWorksheet("Faturamento aplicado")?.getCell("E2").value).toBe(2);
    expect(wb.getWorksheet("FEFO pós-faturamento")?.getCell("E2").value).toBe("B");
    expect(wb.getWorksheet("FEFO pós-faturamento")?.getCell("H2").value).toBe(2);
  });
  it("não inventa ajuste em SKU pendente e respeita o filtro do resultado", () => {
    const p = pacote(); const primeiro = p.itens[0]; if (!primeiro) throw new Error("Fixture sem lote");
    primeiro.qtd_final = null; primeiro.qtd_recontagem = null; primeiro.qtd_contagem = null;
    p.filtro.mes = "2026-10";
    const wb = montarExcelAuditoria(p);
    expect(wb.getWorksheet("Ajustes e correções de lote")?.rowCount).toBe(1);
    expect(wb.getWorksheet("Contagens por lote")?.getCell("N2").value).toBeNull();
    expect(wb.getWorksheet("Contagens por lote")?.getCell("Q2").value).toEqual({ formula: 'IF(N2="","",N2-K2)' });
    expect(wb.getWorksheet("Resultado por produto")?.rowCount).toBe(1);
  });
});