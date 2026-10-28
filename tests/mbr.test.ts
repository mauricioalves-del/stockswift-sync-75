import { expect, test } from "bun:test";
import JSZip from "jszip";
import { fmtMoeda, fmtNum, fmtPct, pontosTendencia, statusEvolucao, tendenciaLinear } from "../src/lib/mbr/formato";
import { coletarDados, evolucaoMovimentados, prejuizoPorAlmox } from "../src/lib/mbr/dados";
import { linhaScorecardAlmox } from "../src/lib/mbr/secao2";
import { montarMbr } from "../src/lib/mbr/gerar";
import { montarInventario } from "../src/lib/atlas-inventario";
import { baixasOperacionais, controleFefo, aplicarJustificativas, extrairMetas, farolShelf, investimentoOperacional, lotesFarol, numBr, riscoObsolescencia, semMovimentacao, testesIndustriais } from "../src/lib/mbr/dados3";
import { montarScorecard } from "../src/lib/mbr/secao1";

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
  expect(nomeArquivo).toBe("MBR_Controle_202609.pptx");
  expect((pptx as any).slides.length).toBe(31); // sem fontes da Seção 3/4: cada slide sai com o aviso de indisponível
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  expect(buf.length).toBeGreaterThan(10000);
  // PowerPoint pede "Reparar" quando o rótulo de dados usa uma posição que o tipo de gráfico não aceita (ex.: inEnd em linha)
  const zip = await JSZip.loadAsync(buf), aceitas: Record<string, string[]> = { lineChart: ["t", "b", "l", "r", "ctr"], barChart: ["ctr", "inBase", "inEnd", "outEnd"], pieChart: ["bestFit", "ctr", "inEnd", "outEnd"] };
  const graficos = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  expect(graficos.length).toBeGreaterThan(0);
  for (const f of graficos) {
    const xml = await zip.file(f)!.async("string");
    for (const [, tipo, corpo] of xml.matchAll(/<c:(\w+Chart)>([\s\S]*?)<\/c:\1>/g)) {
      const empilhado = /<c:grouping val="\w*[sS]tacked"/.test(corpo);
      for (const [, pos] of corpo.matchAll(/<c:dLblPos val="(\w+)"/g)) {
        const ok = (aceitas[tipo] ?? []).filter((x) => !(empilhado && x === "outEnd"));
        expect(`${f} ${tipo} ${pos}: ${ok.includes(pos)}`).toBe(`${f} ${tipo} ${pos}: true`);
      }
    }
  }
});

const bx = (o: Partial<any>) => ({ id: Math.random().toString(), codigo_produto: "S1", descricao: "Produto", id_local: "Alm_A", motivo_baixa_id: "venc", contexto_baixa: null, valor_total: 10, quantidade: 1, custo_unitario: null, lote: null, data_solicitacao: "2026-09-10T12:00:00+00:00", data_ocorrencia: null, status_fluxo: "APROVADA", categoria: null, ...o });
const ctx = { motivoNome: new Map([["venc", "Vencimento"], ["av", "Avaria"], ["cort", "Cortesia"], ["deg", "Degustação"]]), classif: new Map([["venc", "Operacional"]]), grupoDe: new Map([["S1", "Materia Prima"]]), limSku: 1000 };

test("Baixas Operacionais: só aprovadas do mês, sem motivos de investimento; destaque = maior motivo Operacional", () => {
  const r = baixasOperacionais([bx({ valor_total: 60 }), bx({ motivo_baixa_id: "av", valor_total: 40, id_local: "Alm_B" }), bx({ motivo_baixa_id: "cort", valor_total: 999 }), bx({ status_fluxo: "PENDENTE", valor_total: 500 }), bx({ data_solicitacao: "2026-08-31T23:00:00+00:00", valor_total: 7 })] as any, ctx, "2026-09");
  expect(r.total).toBe(100);
  expect(r.motivoDestaque).toBe("Vencimento");
  expect(r.pctDestaque).toBe(60);
  expect(r.setorTop).toBe("Alm_A");
  expect(r.grupoTop).toBe("Materia Prima");
  expect(r.meses).toEqual(["2026-08", "2026-09"]);
  expect(r.rankingSku[0].classif).toBe("Investigar");
});

test("Investimento Operacional: ano até o mês, não reprovadas, rosca cai para almoxarifado sem contexto", () => {
  const r = investimentoOperacional([bx({ motivo_baixa_id: "cort", valor_total: 5, id_local: "L1" }), bx({ motivo_baixa_id: "cort", valor_total: 3, id_local: "L2" }), bx({ motivo_baixa_id: "deg", valor_total: 2, status_fluxo: "REPROVADA" }), bx({ motivo_baixa_id: "deg", valor_total: 4, data_solicitacao: "2026-10-02T12:00:00+00:00" })] as any, ctx, "2026-09");
  expect(r.total).toBe(8);
  expect(r.qtd).toBe(2);
  expect(r.rosca.campo).toBe("almox");
  expect(r.porMotivo.find((m) => m.nome === "Degustação")!.qtd).toBe(0);
});

test("Farol e obsolescência: faixas de validade e giro dos últimos 90 dias", () => {
  const hoje = new Date(2026, 9, 7);
  const lotes = lotesFarol([
    { id_produto: "0001", descricao: "A", lote: "1", quantidade: 10, custo_unitario: 2, origem: "Alm_X", data_validade: "2026-10-01" },
    { id_produto: "0002", descricao: "B", lote: "2", quantidade: 5, custo_unitario: 1, origem: "Alm_X", data_validade: "2026-10-20" },
    { id_produto: "0003", descricao: "C", lote: "3", quantidade: 5, custo_unitario: 1, origem: "Alm_Box", data_validade: "2026-11-20" },
    { id_produto: "0004", descricao: "D", lote: "4", quantidade: 5, custo_unitario: 1, origem: "Alm_X", data_validade: "2027-11-20" },
  ], new Map(), hoje);
  const f = farolShelf(lotes);
  expect([f.status.Vencido.qtd, f.status.Urgente.qtd, f.status.Perigo.qtd, f.totalLotes, f.valorTotal]).toEqual([1, 1, 1, 3, 30]);
  const o = riscoObsolescencia(lotes, new Map([["2", 1]]));
  expect([o.quantidadeItens, o.quantidadeCriticos, o.valorTotal]).toEqual([2, 1, 25]); // Box fica de fora
});

test("Sem movimentação, Testes e FEFO seguem as regras das telas", () => {
  const s = semMovimentacao([{ id_produto: "1", descricao: "X", almoxarifado: "A", lote: null, valor: 10, faixa: "+90" }, { id_produto: "2", descricao: "Y", almoxarifado: "A", lote: null, valor: 5, faixa: "30-60" }, { id_produto: "3", descricao: "Z", almoxarifado: "A", lote: null, valor: 5, faixa: "+90" }], (id) => (id === "3" ? "Materia Prima" : "Embalagem"));
  expect([s.porFaixa["+90"].qtd, s.porFaixa["30-60"].valor, s.total]).toEqual([1, 5, 15]);
  const t = testesIndustriais([{ ano_mes: "2026-09", numero_op: "OP 1", material: "m", desc_material: "Mat", qtd_consumo: 2, custo_unit_medio: 3 }, { ano_mes: "2026-09", numero_op: "OP 2", material: "n", desc_material: "Sem", qtd_consumo: 1, custo_unit_medio: 0 }], "2026-09");
  expect([t.itens, t.semCusto, t.gasto, t.ops, t.custoMedio]).toEqual([1, 1, 6, 1, 6]);
  const linhas = aplicarJustificativas([
    { data: "2026-09-01", id_produto: "1", descricao: "A", destino: "Loja", doc: "d", lote_movimentado: "L", quebra: true, status: "QUEBRA" },
    { data: "2026-09-02", id_produto: "2", descricao: "B", destino: "Loja", doc: "d", lote_movimentado: "L", quebra: true, status: "QUEBRA" },
    { data: "2026-09-02", id_produto: "3", descricao: "C", destino: "Loja", doc: "d", lote_movimentado: "L", quebra: false, status: "OK" },
    { data: "2026-09-02", id_produto: "4", descricao: "D", destino: "Loja", doc: "d", lote_movimentado: "L", quebra: false, status: "Destino (não auditado)" },
  ], [{ data: "2026-09-02", id_produto: "2", doc: "d", lote_movimentado: "L", destino: "Loja" }]);
  const f = controleFefo(linhas, () => "G", "2026-09");
  expect([f.total, f.quebras, f.oks]).toEqual([3, 1, 1]);
});

test("Metas: leitura do export \"Minhas metas\" (pesos, mês, alerta de acumulado somado)", async () => {
  expect(numBr("-1.038,09")).toBe(-1038.09);
  expect(numBr("0.0")).toBe(0);
  expect(numBr("—")).toBe(null);
  // documento mínimo no formato do export (sem DOM real no teste: estrutura simulada)
  const el = (tag: string, kids: any[] = [], text = "", attrs: Record<string, string> = {}): any => {
    const e: any = { tagName: tag, children: kids.filter((k) => typeof k !== "string"), getAttribute: (n: string) => attrs[n] ?? null, nextElementSibling: null };
    e.childNodes = kids.length ? kids.map((k) => (typeof k === "string" ? { nodeType: 3, textContent: k } : k)) : text ? [{ nodeType: 3, textContent: text }] : [];
    Object.defineProperty(e, "nodeType", { value: 1 });
    Object.defineProperty(e, "textContent", { get: () => e.childNodes.map((c: any) => c.textContent).join("") });
    e.querySelector = (s: string) => e.querySelectorAll(s)[0] ?? null;
    e.querySelectorAll = (s: string) => { const tags = s.split(",").map((x) => x.trim().toUpperCase()); const out: any[] = []; const walk = (n: any) => { for (const c of n.children) { if (tags.includes(c.tagName)) out.push(c); walk(c); } }; walk(e); return out; };
    return e;
  };
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const linha = (rot: string, vals: string[]) => el("TR", [el("TD", [], rot), ...vals.map((v) => el("TD", [el("INPUT", [], "", { value: v })]))]);
  const tabelaMeta = el("DIV", [el("TABLE", [linha("Mês", meses), linha("Meta", Array(12).fill("99")), linha("Realizado", ["90", "95", "99", "", "", "", "", "", "", "", "", ""]), linha("% atingimento", Array(12).fill("100"))])]);
  const meta = el("DIV", [el("DIV", [el("INPUT", [], "", { value: "50" })]), el("DIV", [el("DIV", [el("DIV", [], "Acurácia IAQ")]), el("DIV", [el("SPAN", [], "maior"), el("SPAN", [], "%")])]), ...["99", "—", "—", "297", "284", "95%"].map((t) => el("DIV", [], t))]);
  meta.nextElementSibling = tabelaMeta;
  const resumo = el("DIV", [el("DIV", [el("DIV", [], "Fulano"), el("DIV", [], "você")]), el("DIV", [el("SPAN", [], "1 meta(s) — soma dos pesos "), el("STRONG", [], "50.0%")])]);
  const grids = [el("DIV"), resumo, meta];
  const r = extrairMetas({ querySelectorAll: () => grids } as any, "2026-03")!;
  expect(r.colaborador).toBe("Fulano");
  expect([r.somaPesos, r.pesosOk]).toEqual([50, false]);
  expect([r.metas[0].unidade, r.metas[0].realizadoMes, r.metas[0].acumuladoSomado, r.metas[0].mediaAteMes]).toEqual(["%", 99, true, 94.7]);
});

test("Scorecard do mês: ordem do modelo final e status por frente", () => {
  const d: any = { kpis: { acuracia: 81.8, total: 811, divergentes: 10, resultado: 0 }, comparativo: { item: 81.8, iaq: 99, iap: 99.6, gap: -17.8 }, evolucaoPonderada: [], movimentados: { pct: 87, itens_analisados: 100, itens_com_divergencia: 13 }, evolucaoMovimentados: [{ mes: "2026-05", pct: 66 }, { mes: "2026-09", pct: 87 }] };
  const l = montarScorecard({ d, baixas: null, pacotes: null, farol: null, obsolescencia: null, fefo: null });
  expect(l.map((x) => x.frente)).toEqual(["Acurácia Ponderada", "Painel de Inventário", "Mapeamento de Passivos", "Shelf Life", "Mapeamento de Risco (Obsolescência)", "Controle de Movimentados"]);
  expect([l[0].status.label, l[1].status.label, l[5].status.label]).toEqual(["Em avanço", "Crítico", "Em avanço"]);
});
