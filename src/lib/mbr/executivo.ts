// MBR · visões executivas no padrão Operations Report: scorecard de uma página (meta × realizado × tendência),
// ponte de valor do controle, ruptura × excesso, divergências e IA do Atlas, plano de ação, os dois piores
// almoxarifados de inventário e a evolução operacional desde a implantação de cada controle.
import { supabase } from "@/integrations/supabase/client";
import { mesesAte, fimDoMes, normSku, type DadosDispersao, type DadosFechamento, type DadosRecuperacao, type DadosSemMov } from "./dados3";
import type { DadosRupturas } from "./rupturas";
import type { Consolidado } from "./secao1";
import { COR, LARGURA, MARGEM, fmtMoeda, fmtNum, fmtPct, fmtPP, rotuloMes } from "./formato";
import { cabecalho, caixaLeitura, graficoBarrasH, graficoEmpilhado, graficoMulti, graficoRosca, linhaKpis, novoSlide, retangulo, tabela, texto, type Pptx, type Slide } from "./kit";

const sb = supabase as any;
const LC = LARGURA - 2 * MARGEM;
const corte = (t: string | null | undefined, n: number) => { const s = String(t ?? "—"); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** Painel lateral "Leitura" + caixa azul "Próximo passo" (padrão do report do gestor). */
export function painelLeitura(s: Slide, x: number, y: number, w: number, h: number, titulo: string, itens: [string, string][], proximo: string) {
  retangulo(s, x, y, w, h, { fill: COR.BRANCO, borda: COR.CINZA_CLARO, arredondado: true, raio: 0.08 });
  texto(s, x + 0.18, y + 0.14, w - 0.36, 0.3, titulo, { tamanho: 13, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  let yy = y + 0.52; const hp = 1.0, lim = y + h - hp - 0.1;
  for (const [t, d] of itens) {
    if (yy + 0.6 > lim) break;
    texto(s, x + 0.18, yy, w - 0.36, 0.22, t, { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    texto(s, x + 0.18, yy + 0.24, w - 0.36, 0.5, d, { tamanho: 9.5 }); yy += 0.82;
  }
  retangulo(s, x, y + h - hp, w, hp, { fill: COR.AZUL_INSTITUCIONAL });
  texto(s, x + 0.18, y + h - hp + 0.1, w - 0.36, 0.2, "PRÓXIMO PASSO", { tamanho: 8.5, negrito: true, cor: COR.AZUL_CLARO });
  texto(s, x + 0.18, y + h - hp + 0.32, w - 0.36, 0.62, proximo, { tamanho: 10, cor: COR.BRANCO });
}

// ---------------- Atlas: divergências do mês e assertividade da IA ----------------
export async function carregarAtlasMbr(mes: string) {
  const meses = mesesAte(mes, 6), ini = `${meses[0]}-01`, fim = fimDoMes(mes);
  const res: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from("atlas_divergencias").select("data_deteccao, resolvido_em, hipotese_ia, hipotese_confirmada, valor_estimado, responsavel, tempo_resolucao_minutos").eq("status", "Resolvida").gte("resolvido_em", ini).lte("resolvido_em", `${fim}T23:59:59`).range(f, f + 999);
    if (error) throw error; res.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const [{ count: abertas }, { count: novas }] = await Promise.all([
    sb.from("atlas_divergencias").select("id", { count: "exact", head: true }).neq("status", "Resolvida"),
    sb.from("atlas_divergencias").select("id", { count: "exact", head: true }).gte("data_deteccao", `${mes}-01`).lte("data_deteccao", fim),
  ]);
  const doMes = res.filter((r) => String(r.resolvido_em).slice(0, 7) === mes);
  const acerto = (l: any[]) => { const c = l.filter((r) => r.hipotese_ia && r.hipotese_confirmada); return c.length ? (100 * c.filter((r) => r.hipotese_ia === r.hipotese_confirmada).length) / c.length : null; };
  const dias = doMes.map((r) => (Date.parse(String(r.resolvido_em)) - Date.parse(String(r.data_deteccao))) / 86400000).filter((x) => isFinite(x) && x >= 0);
  const causas = new Map<string, number>(); for (const r of doMes) if (r.hipotese_confirmada) causas.set(r.hipotese_confirmada, (causas.get(r.hipotese_confirmada) ?? 0) + 1);
  return {
    abertas: abertas ?? 0, novas: novas ?? 0, resolvidas: doMes.length, valorResolvido: doMes.reduce((a, r) => a + Math.abs(Number(r.valor_estimado) || 0), 0),
    automaticas: doMes.filter((r) => String(r.responsavel ?? "").toLowerCase().includes("autom")).length,
    acertoMes: acerto(doMes), tempoMedioDias: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null,
    serieAcerto: meses.map((m) => ({ mes: m, acerto: acerto(res.filter((r) => String(r.resolvido_em).slice(0, 7) === m)), n: res.filter((r) => String(r.resolvido_em).slice(0, 7) === m).length })).filter((x) => x.n > 0),
    causas: [...causas].map(([h, n]) => ({ h, n })).sort((a, b) => b.n - a.n),
  };
}
export type DadosAtlasMbr = Awaited<ReturnType<typeof carregarAtlasMbr>>;

export type Extras = { rupturas: DadosRupturas | null; dispersao: DadosDispersao | null; semMov: DadosSemMov | null; recuperacao: DadosRecuperacao | null; fechamento: DadosFechamento | null; atlas: DadosAtlasMbr | null };

// ---------------- 1 · Scorecard executivo ----------------
/** Metas padrão do controle (ajustáveis aqui até virarem cadastro em Configurações). */
export const METAS = { iap: 98, item: 85, mov: 90, baixas: 5000, shelf: 3000, parado90: 20000, furo: 20, ruptura: 3, fefo: 5 };
type St = "Na meta" | "Atenção" | "Crítico" | "Sem dado";
const stMaior = (v: number | null | undefined, meta: number, tol = 5): St => (v == null ? "Sem dado" : v >= meta ? "Na meta" : v >= meta - tol ? "Atenção" : "Crítico");
const stMenor = (v: number | null | undefined, meta: number, fator = 1.5): St => (v == null ? "Sem dado" : v <= meta ? "Na meta" : v <= meta * fator ? "Atenção" : "Crítico");
const COR_ST: Record<St, string> = { "Na meta": COR.SUCESSO, "Atenção": COR.ATENCAO, "Crítico": COR.ERRO, "Sem dado": COR.SEM_DADO };
const sinalPP = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmtPP(v)}`);

export function linhasScorecard(c: Consolidado, x: Extras) {
  const d = c.d, ep = d.evolucaoPonderada, at = ep.at(-1), an = ep.length >= 2 ? ep.at(-2) : undefined;
  const mov = d.evolucaoMovimentados.filter((m) => m.pct != null), movA = mov.at(-1), movB = mov.length >= 2 ? mov.at(-2) : undefined;
  const fefo: any = c.fefo;
  const L: { frente: string; ind: string; meta: string; val: string; varr: string; st: St }[] = [
    { frente: "Inventário", ind: "IAP — acurácia por valor", meta: `≥ ${METAS.iap}%`, val: fmtPct(at?.iap), varr: sinalPP(at?.varIap), st: stMaior(at?.iap, METAS.iap, 3) },
    { frente: "Inventário", ind: "Acurácia item a item", meta: `≥ ${METAS.item}%`, val: fmtPct(at?.item), varr: sinalPP(at?.varItem), st: stMaior(at?.item, METAS.item, 10) },
    { frente: "Movimentados", ind: "Acurácia da conciliação diária", meta: `≥ ${METAS.mov}%`, val: fmtPct(movA?.pct), varr: sinalPP(movA?.pct != null && movB?.pct != null ? movA.pct - movB.pct : null), st: stMaior(movA?.pct, METAS.mov, 5) },
    { frente: "Baixas", ind: "Baixa operacional do mês", meta: `≤ ${fmtMoeda(METAS.baixas)}`, val: fmtMoeda(c.baixas?.total), varr: c.baixas?.totalMesAnterior ? `${c.baixas.total >= c.baixas.totalMesAnterior ? "+" : ""}${fmtNum(((c.baixas.total - c.baixas.totalMesAnterior) / c.baixas.totalMesAnterior) * 100, 0)}%` : "—", st: stMenor(c.baixas?.total, METAS.baixas) },
    { frente: "Shelf life", ind: "Estoque vencido ou ≤ 30 dias", meta: `≤ ${fmtMoeda(METAS.shelf)}`, val: fmtMoeda(c.farol ? (c.farol.status.Vencido?.valor ?? 0) + (c.farol.status.Urgente?.valor ?? 0) : null), varr: "—", st: stMenor(c.farol ? (c.farol.status.Vencido?.valor ?? 0) + (c.farol.status.Urgente?.valor ?? 0) : null, METAS.shelf) },
    { frente: "Sem movimentação", ind: "Valor parado há mais de 90 dias", meta: `≤ ${fmtMoeda(METAS.parado90)}`, val: fmtMoeda(x.semMov?.porFaixa["+90"].valor), varr: "—", st: stMenor(x.semMov?.porFaixa["+90"].valor, METAS.parado90) },
    { frente: "Dispersão", ind: "Furo de ficha (linhas fora da tolerância)", meta: `≤ ${METAS.furo}%`, val: fmtPct(x.dispersao?.furo.pctMes), varr: sinalPP(x.dispersao?.furo.deltaPP), st: stMenor(x.dispersao?.furo.pctMes, METAS.furo) },
    { frente: "Abastecimento", ind: "Taxa de ruptura das lojas", meta: `≤ ${METAS.ruptura}%`, val: fmtPct(x.rupturas?.atual.pct), varr: sinalPP(x.rupturas?.deltaPP), st: stMenor(x.rupturas?.atual.pct, METAS.ruptura, 2) },
    { frente: "FEFO", ind: "Taxa de quebra de FEFO", meta: `≤ ${METAS.fefo}%`, val: fmtPct(fefo?.atual?.taxa ?? fefo?.taxa), varr: sinalPP(fefo?.deltaTaxa), st: stMenor(fefo?.atual?.taxa ?? fefo?.taxa, METAS.fefo) },
  ];
  return L;
}

export function slideScorecardExec(p: Pptx, mesLabel: string, pag: number, c: Consolidado, x: Extras) {
  const s = novoSlide(p), L = linhasScorecard(c, x);
  const ok = L.filter((l) => l.st === "Na meta").length, crit = L.filter((l) => l.st === "Crítico").map((l) => l.frente);
  cabecalho(s, `${ok} de ${L.length} frentes na meta${crit.length ? `; ${crit.slice(0, 2).join(" e ").toLowerCase()} pedem ação` : ""}`, mesLabel, pag, "Scorecard executivo — meta × realizado × variação de cada frente do controle (variações de percentual em pp).");
  tabela(s, MARGEM, 1.65, LC, 4.1, ["Frente", "Indicador", "Meta", "Realizado", "Var. mês", "Status"], L.map((l) => [l.frente, l.ind, l.meta, { t: l.val, negrito: true }, l.varr, { t: l.st, cor: COR_ST[l.st], negrito: true }]), { larguras: [1.9, 4.4, 1.5, 1.6, 1.4, 1.53], tamanho: 10.5 });
  const piores = L.filter((l) => l.st === "Crítico" || l.st === "Atenção");
  caixaLeitura(s, MARGEM, 5.95, LC, 1.0, "Leitura executiva", piores.length ? `Fora da meta: ${piores.map((l) => `${l.frente} (${l.val} vs. meta ${l.meta})`).join("; ")}. As metas padrão estão no gerador e podem virar cadastro em Configurações.` : "Todas as frentes dentro da meta no mês.", { tamanho: 10.5 });
}

// ---------------- 2 · Ponte de valor ----------------
export function slidePonteValor(p: Pptx, mesLabel: string, pag: number, c: Consolidado, x: Extras) {
  const s = novoSlide(p);
  const inv = c.d.kpis.resultado ?? 0, rec = x.recuperacao ? (x.recuperacao.receitaRecuperada ?? 0) + (x.recuperacao.savingRecuperado ?? 0) : 0;
  const div = x.atlas?.valorResolvido ?? 0;
  const etapas: [string, number][] = [["Recuperação de shelf", rec], ["Divergências resolvidas", div], ["Resultado do inventário", inv], ["Baixas operacionais", -(c.baixas?.total ?? 0)], ["Perda por vencimento", -(x.recuperacao?.perdaVencimento ?? 0)], ["Dispersão (perda de processo)", -(x.dispersao?.totalPerdaProcesso ?? 0)]];
  const perdas = -etapas.filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0), ganhos = etapas.filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0), liq = ganhos - perdas;
  cabecalho(s, `Controle recuperou ${fmtMoeda(ganhos)} e registrou ${fmtMoeda(perdas)} de perdas: líquido de ${liq >= 0 ? "+" : ""}${fmtMoeda(liq)}`, mesLabel, pag, "Ponte de valor — perdas e recuperações do mês numa única régua, em R$.");
  // cascata com série-base transparente (todas as barras acima de zero quando os ganhos vêm primeiro)
  const ord = [...etapas.filter(([, v]) => v > 0), ...etapas.filter(([, v]) => v <= 0)];
  let acc = 0; const base: number[] = [], neg: number[] = [], pos: number[] = [], cats: string[] = [];
  for (const [n, v] of ord) { const ini = acc; acc += v; cats.push(n); base.push(Math.max(0, v >= 0 ? ini : acc)); neg.push(v < 0 ? -v : 0); pos.push(v > 0 ? v : 0); }
  cats.push("Resultado líquido"); base.push(Math.min(0, acc) === acc ? 0 : 0); neg.push(acc < 0 ? -acc : 0); pos.push(acc > 0 ? acc : 0);
  graficoEmpilhado(p, s, MARGEM, 1.65, 8.2, 5.25, cats, [{ nome: "base", valores: base, cor: COR.BRANCO }, { nome: "Perda", valores: neg, cor: COR.ERRO }, { nome: "Recuperação", valores: pos, cor: COR.SUCESSO }], { formato: '"R$ "#,##0', rotulos: false, tamEixo: 8 } as any);
  const maior = ord.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0];
  painelLeitura(s, MARGEM + 8.45, 1.65, LC - 8.45, 5.25, "Leitura do resultado", [
    [ganhos >= perdas ? `Recuperação cobre ${fmtNum(perdas ? ganhos / perdas : 0, 1)}× a perda` : `Recuperação cobre ${fmtPct(perdas ? (100 * ganhos) / perdas : 0, 0)} da perda`, `Ações de lote e divergências resolvidas somam ${fmtMoeda(ganhos)}.`],
    maior ? [`Maior perda: ${maior[0]}`, `${fmtMoeda(-maior[1])} no mês.`] : ["Sem perdas no mês", "—"],
  ], maior ? `Atacar ${maior[0].toLowerCase()} e acompanhar o resultado líquido mês a mês.` : "Manter a régua no próximo MBR.");
}

// ---------------- 3 · Ruptura × excesso ----------------
export function slideRupturaExcesso(p: Pptx, mesLabel: string, pag: number, x: Extras) {
  const s = novoSlide(p);
  const r = x.rupturas, o = x.semMov;
  const parados = new Map((o?.skus ?? []).map((k) => [normSku(k.sku), k]));
  const ambos = (r?.itens ?? []).filter((i) => parados.has(normSku(i.sku))).map((i) => ({ ...i, parado: parados.get(normSku(i.sku))! })).sort((a, b) => b.vendaPerdida + b.parado.valor - (a.vendaPerdida + a.parado.valor));
  cabecalho(s, `${fmtMoeda(o?.total)} parados e ${fmtMoeda(r?.vendaPerdida)} em venda perdida: ${ambos.length} SKUs estão nos dois lados`, mesLabel, pag, "Cruza o indicador de rupturas das lojas com os itens sem movimentação: o mesmo SKU parado em um almoxarifado e em falta na loja.");
  if (!r || !o) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Dados indisponíveis", "Rupturas ou itens sem movimentação não puderam ser lidos.", { corRotulo: COR.ATENCAO }); return; }
  linhaKpis(s, 1.62, [
    { valor: fmtMoeda(r.vendaPerdida), rotulo: "Venda perdida nas lojas", cor: COR.ERRO },
    { valor: fmtMoeda(o.total), rotulo: "Capital sem movimentação", cor: COR.ATENCAO },
    { valor: fmtNum(ambos.length), rotulo: "SKUs em ruptura e parados" },
    { valor: fmtMoeda(ambos.reduce((a, i) => a + i.parado.valor, 0)), rotulo: "Parado nesses SKUs (transferível)", cor: COR.AZUL_INSTITUCIONAL },
  ], 0.7);
  if (ambos.length) tabela(s, MARGEM, 2.55, 8.2, Math.min(4.3, 0.38 * (Math.min(ambos.length, 10) + 1)), ["SKU", "Produto", "Dias-loja em ruptura", "Venda perdida", "Parado em", "Valor parado"], ambos.slice(0, 10).map((i) => [i.sku, corte(i.descricao, 30), fmtNum(i.dias), { t: fmtMoeda(i.vendaPerdida), cor: COR.ERRO }, corte(i.parado.almox, 22), { t: fmtMoeda(i.parado.valor), negrito: true }]), { larguras: [1.0, 2.4, 1.2, 1.1, 1.4, 1.1], tamanho: 9 });
  else caixaLeitura(s, MARGEM, 2.55, 8.2, 2, "Sem cruzamento", "Nenhum SKU em ruptura está entre os itens sem movimentação — a ruptura vem de falta no CD, não de estoque mal distribuído.", { tamanho: 11 });
  painelLeitura(s, MARGEM + 8.45, 2.55, LC - 8.45, 4.3, "Onde agir", [
    [ambos.length ? "Estoque existe, está no lugar errado" : "Ruptura sem excesso", ambos.length ? `${ambos.length} SKU(s) com saldo parado e loja em falta.` : "Repor pelo CD/produção."],
    ["Maior venda perdida", r.topItens[0] ? `${corte(r.topItens[0].descricao, 32)} (${fmtMoeda(r.topItens[0].vendaPerdida)}).` : "—"],
  ], ambos.length ? "Transferir o saldo parado para as lojas antes de produzir ou comprar." : "Priorizar a reposição do CD para os itens de maior venda perdida.");
}

// ---------------- 4 · Divergências e IA do Atlas ----------------
export function slideDivergenciasAtlas(p: Pptx, mesLabel: string, pag: number, a: DadosAtlasMbr | null, nomeHip: (h: string) => string = (h) => h.replace(/_/g, " ")) {
  const s = novoSlide(p);
  cabecalho(s, a?.acertoMes != null ? `IA do Atlas acertou a causa em ${fmtPct(a.acertoMes, 0)} das divergências resolvidas no mês` : "Divergências do Atlas e assertividade da IA", mesLabel, pag, "Conferência de movimentados: volume, tempo de resolução, causas confirmadas e acerto do motor de causa.");
  if (!a) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Atlas indisponível", "Não foi possível ler as divergências do Atlas.", { corRotulo: COR.ATENCAO }); return; }
  const ser = a.serieAcerto, d = ser.length >= 2 && ser.at(-1)!.acerto != null && ser.at(-2)!.acerto != null ? ser.at(-1)!.acerto! - ser.at(-2)!.acerto! : null;
  linhaKpis(s, 1.62, [
    { valor: fmtNum(a.abertas), rotulo: "Divergências em aberto" },
    { valor: fmtNum(a.resolvidas), rotulo: "Resolvidas no mês", cor: COR.SUCESSO, contexto: fmtMoeda(a.valorResolvido) },
    { valor: fmtPct(a.acertoMes, 0), rotulo: "Acerto da IA", cor: COR.SUCESSO, contexto: d == null ? null : `${d > 0 ? "+" : ""}${fmtPP(d)} vs. mês anterior` },
    { valor: a.tempoMedioDias == null ? "—" : `${fmtNum(a.tempoMedioDias, 1)} dia(s)`, rotulo: "Tempo médio até resolver" },
    { valor: fmtNum(a.automaticas), rotulo: "Resolvidas automaticamente", cor: COR.VERDE_AMAZONIA },
  ], 0.7);
  const cs = a.causas.slice(0, 6);
  if (cs.length) graficoRosca(p, s, MARGEM, 2.6, 5.6, 4.3, cs.map((c) => nomeHip(c.h)), cs.map((c) => c.n), [COR.AZUL_INSTITUCIONAL, COR.ERRO, COR.ATENCAO, COR.VERDE_AMAZONIA, COR.AZUL_CLARO, COR.SEM_DADO]);
  if (ser.length) graficoMulti(p, s, MARGEM + 5.9, 2.6, LC - 5.9, 4.3, ser.map((m) => rotuloMes(m.mes)), [{ nome: "Acerto da IA (%)", valores: ser.map((m) => (m.acerto == null ? null : Math.round(m.acerto))) as any, cor: COR.VERDE_AMAZONIA }], { formato: "0", rotulos: true });
}

// ---------------- 5 · Plano de ação e follow-up ----------------
export function slidePlanoAcao(p: Pptx, mesLabel: string, pag: number, f: DadosFechamento | null) {
  const s = novoSlide(p);
  const R = f?.resumo ?? [], cri = R.reduce((a, r) => a + r.acoes_criadas, 0), con = R.reduce((a, r) => a + r.acoes_concluidas, 0), abe = R.reduce((a, r) => a + r.acoes_em_aberto, 0);
  cabecalho(s, cri ? `${fmtNum(con)} de ${fmtNum(cri)} ações concluídas no mês; ${fmtNum(abe)} seguem em aberto` : "Plano de ação e follow-up", mesLabel, pag, "Ações por frente do Stock Savvy: criadas, concluídas e em aberto — o que esta reunião precisa destravar.");
  if (!R.length) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem fechamento", "O Fechamento Mensal do Stock Savvy não tem ações registradas neste mês.", { corRotulo: COR.ATENCAO }); return; }
  const ord = [...R].sort((a, b) => b.acoes_em_aberto - a.acoes_em_aberto);
  tabela(s, MARGEM, 1.65, 8.2, Math.min(4.4, 0.4 * (ord.length + 1)), ["Frente", "Criadas", "Concluídas", "Em aberto", "% concluído", "Status"], ord.map((r) => { const pc = r.acoes_criadas ? (100 * r.acoes_concluidas) / r.acoes_criadas : null; return [r.modulo, fmtNum(r.acoes_criadas), fmtNum(r.acoes_concluidas), { t: fmtNum(r.acoes_em_aberto), cor: r.acoes_em_aberto ? COR.ERRO : COR.SUCESSO, negrito: true }, fmtPct(pc, 0), r.status_geral]; }), { larguras: [2.6, 0.9, 1.0, 1.0, 1.1, 1.6], tamanho: 10 });
  const pior = ord[0];
  painelLeitura(s, MARGEM + 8.45, 1.65, LC - 8.45, 5.25, "Follow-up", [
    [`Conclusão geral: ${fmtPct(cri ? (100 * con) / cri : null, 0)}`, `${fmtNum(con)} concluídas de ${fmtNum(cri)} criadas.`],
    [pior?.acoes_em_aberto ? `Maior pendência: ${pior.modulo}` : "Sem pendências", pior?.acoes_em_aberto ? `${fmtNum(pior.acoes_em_aberto)} ação(ões) em aberto.` : "—"],
  ], pior?.acoes_em_aberto ? `Definir dono e nova data para as pendências de ${pior.modulo} nesta reunião.` : "Manter a cadência de fechamento.");
}

// ---------------- 6 · Inventário: os dois piores resultados ----------------
export function slideDoisPiores(p: Pptx, mesLabel: string, pag: number, c: Consolidado) {
  const s = novoSlide(p), P = c.d.piores;
  cabecalho(s, P.length ? `Piores resultados de inventário: ${P.map((x) => `${x.almox} (${fmtPct(x.item)})`).join(" e ")}` : "Os dois piores resultados de inventário", mesLabel, pag, "Acurácia item a item, IAP, IAQ e conciliação diária dos dois almoxarifados com pior resultado no mês, com evolução e maiores faltas.");
  if (!P.length) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem fechamento", "Nenhum fechamento de inventário no mês.", { corRotulo: COR.ATENCAO }); return; }
  const w = (LC - 0.3) / 2;
  P.forEach((a, k) => {
    const x0 = MARGEM + k * (w + 0.3);
    retangulo(s, x0, 1.62, w, 5.3, { fill: COR.BRANCO, borda: COR.CINZA_CLARO, arredondado: true, raio: 0.08 });
    texto(s, x0 + 0.18, 1.72, w - 0.36, 0.3, `${k + 1}º · ${a.almox}`, { tamanho: 14, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    const ks: [string, string, string][] = [["Item a item", fmtPct(a.item), (a.item ?? 0) < 85 ? COR.ERRO : COR.SUCESSO], ["IAP", fmtPct(a.iap), COR.AZUL_INSTITUCIONAL], ["IAQ", fmtPct(a.iaq), COR.AZUL_INSTITUCIONAL], ["Conciliação diária", fmtPct(a.mov), COR.VERDE_AMAZONIA]];
    const kw = (w - 0.36) / 4;
    ks.forEach(([r, v, cor], i) => { texto(s, x0 + 0.18 + i * kw, 2.08, kw, 0.2, r.toUpperCase(), { tamanho: 8, negrito: true, cor: COR.SEM_DADO }); texto(s, x0 + 0.18 + i * kw, 2.28, kw, 0.36, v, { tamanho: 17, negrito: true, cor }); });
    const ev = a.evolucao;
    if (ev.length >= 2) graficoMulti(p, s, x0 + 0.1, 2.75, w - 0.2, 2.0, ev.map((e) => e.rotulo), [{ nome: "Item a item", valores: ev.map((e) => e.item) as any, cor: COR.ERRO }, { nome: "IAP", valores: ev.map((e) => e.iap) as any, cor: COR.AZUL_INSTITUCIONAL }], { formato: "0.0" });
    else caixaLeitura(s, x0 + 0.18, 2.8, w - 0.36, 1.0, "Evolução", "Primeiro fechamento deste almoxarifado — sem histórico para comparar.", { tamanho: 10 });
    const faltas = a.faltaSobra.falta;
    texto(s, x0 + 0.18, 4.85, w - 0.36, 0.22, `MAIORES FALTAS DO MÊS · TOTAL ${fmtMoeda(a.faltaSobra.valorFalta)} (${fmtNum(a.faltaSobra.qtdFalta)} itens)`, { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    if (faltas.length) tabela(s, x0 + 0.18, 5.08, w - 0.36, 1.7, ["SKU", "Produto", "Qtd", "Valor"], faltas.slice(0, 5).map((f) => [String(f.sku ?? "—"), corte(f.descricao, 26), fmtNum(Math.abs(Number(f.divergencia ?? 0))), { t: fmtMoeda(Math.abs(Number(f.valor ?? 0))), cor: COR.ERRO }]), { larguras: [1.0, 2.75, 0.6, 1.1], tamanho: 8.5 });
    else caixaLeitura(s, x0 + 0.18, 5.08, w - 0.36, 0.9, "Faltas", "Sem falta calculável.", { tamanho: 10 });
  });
}

// ---------------- 7 · Evolução operacional desde a implantação de cada controle ----------------
export function slideEvolucaoControles(p: Pptx, mesLabel: string, pag: number, c: Consolidado, x: Extras) {
  const s = novoSlide(p), d = c.d;
  const mov = d.evolucaoMovimentados.filter((m) => m.pct != null), impl = mov[0]?.mes ?? null;
  const ep = d.evolucaoPonderada.filter((e) => e.item != null);
  const media = (l: (number | null | undefined)[]) => { const v = l.filter((n): n is number => n != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const antes = impl ? media(ep.filter((e) => e.mes < impl).map((e) => e.item)) : null, depois = impl ? media(ep.filter((e) => e.mes >= impl).map((e) => e.item)) : null;
  const linhas: [string, string, string, string, string, string][] = [];
  const add = (ctrl: string, ini: string | null, ind: string, a: number | null | undefined, b: number | null | undefined, menorMelhor = false) => {
    if (a == null || b == null) return; const g = b - a; linhas.push([ctrl, ini ? rotuloMes(ini) : "—", ind, fmtPct(a), fmtPct(b), `${g > 0 ? "+" : ""}${fmtPP(g)}${(menorMelhor ? g < 0 : g > 0) ? " ▲" : " ▼"}`]);
  };
  add("Controle de Movimentados", impl, "Acurácia item a item do inventário (média antes × depois)", antes, depois);
  add("Controle de Movimentados", impl, "Acurácia da conciliação diária (1º mês × atual)", mov[0]?.pct, mov.at(-1)?.pct);
  const fs = x.dispersao?.furo.serie ?? []; add("Dispersão de ficha", fs[0]?.mes ?? null, "Furo de ficha — linhas fora da tolerância", fs[0]?.pct, fs.at(-1)?.pct, true);
  const rs = (x.rupturas?.serie ?? []).filter((r) => r.pct != null); add("Abastecimento das lojas", rs[0]?.mes ?? null, "Taxa de ruptura das lojas", rs[0]?.pct, rs.at(-1)?.pct, true);
  const as = (x.atlas?.serieAcerto ?? []).filter((r) => r.acerto != null); add("IA do Atlas", as[0]?.mes ?? null, "Acerto da causa das divergências", as[0]?.acerto, as.at(-1)?.acerto);
  const ganho = antes != null && depois != null ? depois - antes : null;
  cabecalho(s, ganho != null ? `Desde o Controle de Movimentados, a acurácia item a item ganhou ${fmtPP(ganho)} na média` : "Evolução operacional desde a implantação dos controles", mesLabel, pag, "Indicador antes × depois de cada controle implantado — o que mudou na operação com cada rotina nova.");
  const cats = ep.map((e) => e.rotulo);
  graficoMulti(p, s, MARGEM, 1.62, 8.2, 2.75, cats, [{ nome: "Acurácia item a item", valores: ep.map((e) => e.item) as any, cor: COR.ERRO }, { nome: "IAP", valores: ep.map((e) => e.iap) as any, cor: COR.AZUL_INSTITUCIONAL }, { nome: "Conciliação diária", valores: ep.map((e) => mov.find((m) => m.mes === e.mes)?.pct ?? null) as any, cor: COR.VERDE_AMAZONIA }], { formato: "0" });
  if (impl) texto(s, MARGEM, 4.37, 8.2, 0.22, `Controle de Movimentados implantado em ${rotuloMes(impl)} — a linha verde começa aí.`, { tamanho: 9, cor: COR.SEM_DADO });
  if (linhas.length) tabela(s, MARGEM, 4.65, 8.2, Math.min(2.25, 0.36 * (linhas.length + 1)), ["Controle", "Desde", "Indicador", "Antes", "Agora", "Ganho"], linhas.map((l) => [l[0], l[1], l[2], l[3], { t: l[4], negrito: true }, { t: l[5], cor: l[5].endsWith("▲") ? COR.SUCESSO : COR.ERRO, negrito: true }]), { larguras: [1.7, 0.7, 3.2, 0.8, 0.8, 1.0], tamanho: 9 });
  const melhor = [...linhas].sort((a, b) => parseFloat(b[5].replace(",", ".")) - parseFloat(a[5].replace(",", ".")))[0];
  painelLeitura(s, MARGEM + 8.45, 1.62, LC - 8.45, 5.28, "O que os controles entregaram", [
    ganho != null ? [`Item a item: ${fmtPct(antes)} → ${fmtPct(depois)}`, `Média antes × depois do Controle de Movimentados (${ganho > 0 ? "+" : ""}${fmtPP(ganho)}).`] : ["Item a item", "Sem histórico suficiente para comparar."],
    melhor ? [`Destaque: ${melhor[0]}`, `${melhor[2]}: ${melhor[3]} → ${melhor[4]}.`] : ["Sem séries suficientes", "—"],
    ["Leitura contínua", "Cada controle mede sua frente; o ganho de acurácia vem da soma das rotinas."],
  ], "Manter as rotinas diárias e levar os controles que ainda não melhoraram para revisão de processo.");
}
