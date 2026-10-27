import { expect, test } from "bun:test";
import { fmtMoeda, fmtNum, fmtPct, pontosTendencia, statusEvolucao, tendenciaLinear } from "../src/lib/mbr/formato";
import { coletarDados, evolucaoMovimentados, prejuizoPorAlmox } from "../src/lib/mbr/dados";
import { linhaScorecardAlmox } from "../src/lib/mbr/secao2";
import { montarMbr } from "../src/lib/mbr/gerar";
import { montarInventario } from "../src/lib/atlas-inventario";

test("Formatação idêntica ao Python do Atlas (pt-BR, arredondamento pelo valor binário)", () => {
  expect(fmtNum(0.35, 1)).toBe("0,3");
  expect(fmtNum(82.35, 1)).toBe("82,3");
  expect(fmtNum(0.125, 2)).toBe("0,12");
  expect(fmtNum(1234567.5, 0)).toBe("1.234.568");
  expect(fmtMoeda(-1003.19)).toBe("-R$ 1.003");
  expect(fmtPct(null)).toBe("—");
});

test("Tendência linear e status de evolução", () => {
  expect(tendenciaLinear([76, 79, 91, 99, 99, 100]).rotulo).toBe("▲ Tendência de melhora: +5,4 p.p./mês");
  expect(tendenciaLinear([90, 90.1]).rotulo).toBe("▬ Tendência estável no período");
  expect(pontosTendencia([1, null, 3])).toEqual([1, null, 3]);
  expect(statusEvolucao(-0.6).label).toBe("Involução");
  expect(statusEvolucao(0.2).label).toBe("Estável");
  expect(statusEvolucao(null).label).toBe("Sem histórico");
});

test("Prejuízo por almoxarifado: sobra soma, falta subtrai", () => {
  const m = prejuizoPorAlmox([{ almoxarifado: "A", divergencia: -2, valor: 10 } as any, { almoxarifado: "A", divergencia: 1, valor: 4 } as any]);
  expect(m.get("A")).toBe(-6);
});

test("Movimentados: meses da fonte sobrescrevem o resumo persistido; meses antigos ficam", () => {
  const F: any = { movHist: [{ almoxarifado: "X", data_movimento: "2026-09-02", divergencia: 0, valor_divergencia: 0 }, { almoxarifado: "X", data_movimento: "2026-09-03", divergencia: 2, valor_divergencia: 5 }], movDiv: [],
    resumoMov: [{ mes: "2026-08", almoxarifado: null, itens_analisados: 10, itens_sem_divergencia: 9, pct_acuracia: 90 }, { mes: "2026-09", almoxarifado: null, itens_analisados: 1, itens_sem_divergencia: 0, pct_acuracia: 0 }] };
  expect(evolucaoMovimentados(F, null, "2026-09").map((p) => [p.mes, p.pct])).toEqual([["2026-08", 90], ["2026-09", 50]]);
});

test("Scorecard por almoxarifado usa o pior sinal entre fechamento e movimentados", () => {
  const l = linhaScorecardAlmox({ almoxarifado: "A", nome: "A", acuracia: 90, deltaAcuracia: 3, iap: 99, mov: 80, deltaMov: -2, movAplicavel: true });
  expect(l.status.label).toBe("Involução");
  expect(l.passo).toContain("conciliação diária");
});

test("Gera o .pptx da Seção 2 com dados mínimos", async () => {
  const inv = montarInventario(
    [{ id: 1, almoxarifado: "Almox_SP_Loja", data_fechamento: "2026-08-31" }, { id: 2, almoxarifado: "Almox_SP_Loja", data_fechamento: "2026-09-30" }],
    [{ id: 1, fechamento_id: 1, sku: "1", descricao_produto: "Bombom", almoxarifado: "Almox_SP_Loja", qtd_sistema: 10, qtd_contagem: 8, divergencia_qtd: -2, valor_estimado: 20, divergente: true },
     { id: 2, fechamento_id: 2, sku: "1", descricao_produto: "Bombom", almoxarifado: "Almox_SP_Loja", qtd_sistema: 10, qtd_contagem: 10, divergencia_qtd: 0, valor_estimado: 0, divergente: false }],
    [{ sku: "1", custo_unitario: 10 }]);
  const F = { inv, movHist: [], movDiv: [], resumoMov: [], almox: [{ codigo: "Almox_SP_Loja", nome_exibicao: "Loja", ativo: true, participa_contagem_diaria: false }] };
  const d = coletarDados(F, "2026-09");
  expect(d.kpis.acuracia).toBe(100);
  const { pptx, nomeArquivo } = montarMbr(F, "2026-09");
  expect(nomeArquivo).toBe("MBR_Atlas_202609.pptx");
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  expect(buf.length).toBeGreaterThan(10000);
});
