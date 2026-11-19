// MBR — coleta dos dados das Seções 1 e 2 a partir das tabelas atlas_* (funções puras, testáveis com o backup do Atlas).
import { comparativoPorAlmox, evolucaoMensal, evolucaoPonderada, faltaSobra, kpis, tresModelos, FAIXAS, type DadosInv, type ItemInv } from "../atlas-inventario";
import { r2 } from "./formato";

export type MovHist = { almoxarifado: string | null; data_movimento: string | null; divergencia: number | null; valor_divergencia: number | null };
export type MovDiv = { almoxarifado: string | null; data_deteccao: string | null; valor_estimado: number | null };
export type ResumoMov = { mes: string; almoxarifado: string | null; itens_analisados: number; itens_sem_divergencia: number; pct_acuracia: number | null };
export type Almox = { codigo: string; nome_exibicao: string | null; ativo: boolean | null; participa_contagem_diaria: boolean | null };
export type FontesMbr = { inv: DadosInv; movHist: MovHist[]; movDiv: MovDiv[]; resumoMov: ResumoMov[]; almox: Almox[] };

export type ItemConc = { sku: string; descricao: string | null; almoxarifado: string; qtd_sistema: number; qtd_contagem: number; divergencia: number; valor: number; pctAcum: number };
export type PontoMov = { mes: string; itens_analisados: number; itens_sem_divergencia: number; pct: number | null };
export type LinhaAlmoxMov = { almoxarifado: string; itens_analisados: number; itens_sem_divergencia: number; pct: number | null };
export type ItemScorecardAlmox = { almoxarifado: string; nome: string; acuracia: number | null; deltaAcuracia: number | null; iap: number | null; deltaIap?: number | null; mov: number | null; deltaMov: number | null; movAplicavel: boolean };

const mesDe = (d: string | null | undefined) => (d ? String(d).slice(0, 7) : null);
const pct = (sem: number, tot: number) => (tot ? r2((sem / tot) * 100) : null);
/** Valor da divergência pelo custo atual do cadastro; sem custo, o valor gravado no fechamento. */
const valorAtual = (D: DadosInv, i: ItemInv) => { const c = D.custos.get(i.sku); return c != null ? Math.abs(i.divergencia) * c : Math.abs(i.valor); };

/** Lista de concentração de valor (Pareto) do mês: até 50 maiores divergências por valor, com % acumulado. */
export function concentracaoValor(D: DadosInv, mes: string, topN = 20) {
  const div = D.itens.filter((i) => i.mes === mes && i.divergente).map((i) => ({ i, v: valorAtual(D, i) })).sort((a, b) => b.v - a.v);
  const total = div.reduce((s, x) => s + x.v, 0); let acum = 0;
  const itens: ItemConc[] = div.slice(0, 50).map(({ i, v }) => { acum += v; return { sku: i.sku, descricao: i.descricao, almoxarifado: i.almoxarifado, qtd_sistema: i.qtd_sistema, qtd_contagem: i.qtd_contagem, divergencia: i.divergencia, valor: r2(v), pctAcum: total ? r2((acum / total) * 100) : 0 }; });
  const topV = div.slice(0, topN).reduce((s, x) => s + x.v, 0);
  return { itens, totalDivergentes: div.length, valorTotal: r2(total), topN: Math.min(topN, div.length), topNPct: total ? r2((topV / total) * 100) : null };
}

/** Distribuição por magnitude da divergência (quantidade) + top 10 por valor dentro de cada faixa. */
export function magnitudeComItens(D: DadosInv, mes: string) {
  const div = D.itens.filter((i) => i.mes === mes && i.divergente);
  const faixas = FAIXAS.map(([min, max, faixa]) => {
    const g = div.filter((i) => Math.abs(i.divergencia) >= min && Math.abs(i.divergencia) < max).map((i) => ({ sku: i.sku, descricao: i.descricao, valor: r2(valorAtual(D, i)) }));
    return { faixa, quantidade: g.length, valor: r2(g.reduce((s, x) => s + x.valor, 0)), itens: g.sort((a, b) => b.valor - a.valor).slice(0, 10) };
  });
  return { faixas, total: div.length, pctPequenas: div.length ? r2((faixas[0].quantidade / div.length) * 100) : null };
}

/** Prejuízo por almoxarifado na lista de concentração: sobra soma, falta subtrai. */
export function prejuizoPorAlmox(itens: ItemConc[]) {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i.almoxarifado || "—", (m.get(i.almoxarifado || "—") ?? 0) + (i.divergencia > 0 ? 1 : -1) * i.valor);
  return m;
}

// ---------- Controle de Movimentados (reconciliação diária, origem "movimentacao") ----------
function agregarMov(F: FontesMbr, filtro: (mes: string, almox: string | null) => boolean, chave: (mes: string, almox: string | null) => string) {
  const m = new Map<string, { analisados: number; sem: number }>();
  const add = (mes: string | null, almox: string | null, sem: boolean) => { if (!mes || !filtro(mes, almox)) return; const k = chave(mes, almox); const v = m.get(k) ?? { analisados: 0, sem: 0 }; v.analisados++; if (sem) v.sem++; m.set(k, v); };
  for (const h of F.movHist) add(mesDe(h.data_movimento), h.almoxarifado, !h.divergencia);
  for (const d of F.movDiv) add(mesDe(d.data_deteccao), d.almoxarifado, false);
  return m;
}
export function resumoMovimentados(F: FontesMbr, mes: string) {
  const v = agregarMov(F, (m) => m === mes, () => "x").get("x") ?? { analisados: 0, sem: 0 };
  return { itens_analisados: v.analisados, itens_sem_divergencia: v.sem, itens_com_divergencia: v.analisados - v.sem, pct: pct(v.sem, v.analisados) };
}
export function movimentadosPorAlmox(F: FontesMbr, mes: string): LinhaAlmoxMov[] {
  return [...agregarMov(F, (m) => m === mes, (_m, a) => a ?? "—")].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([almoxarifado, v]) => ({ almoxarifado, itens_analisados: v.analisados, itens_sem_divergencia: v.sem, pct: pct(v.sem, v.analisados) }));
}
/** Série mensal: resumo persistido do Atlas, sobrescrito pelos meses que ainda existem na fonte (mesmo upsert do Atlas). */
export function evolucaoMovimentados(F: FontesMbr, almox: string | null, ateMes: string): PontoMov[] {
  const m = new Map<string, PontoMov>();
  for (const r of F.resumoMov) if ((r.almoxarifado ?? null) === almox) m.set(r.mes, { mes: r.mes, itens_analisados: Number(r.itens_analisados) || 0, itens_sem_divergencia: Number(r.itens_sem_divergencia) || 0, pct: r.pct_acuracia == null ? null : Number(r.pct_acuracia) });
  for (const [mes, v] of agregarMov(F, (_m, a) => almox == null || a === almox, (mm) => mm)) m.set(mes, { mes, itens_analisados: v.analisados, itens_sem_divergencia: v.sem, pct: pct(v.sem, v.analisados) });
  return [...m.values()].filter((p) => p.mes <= ateMes).sort((a, b) => a.mes.localeCompare(b.mes));
}

export function scorecardAlmox(F: FontesMbr, mes: string): ItemScorecardAlmox[] {
  const comp = new Map(comparativoPorAlmox(F.inv, mes).map((c) => [c.chave, c]));
  // IAP do fechamento anterior de cada almoxarifado (indicador principal de evolução do scorecard)
  const cacheMes = new Map<string, Map<string, number | null>>();
  const iapEm = (m: string, alm: string) => { if (!cacheMes.has(m)) cacheMes.set(m, new Map(comparativoPorAlmox(F.inv, m).map((c) => [c.chave, c.iap ?? null]))); return cacheMes.get(m)!.get(alm) ?? null; };
  return F.almox.filter((a) => a.ativo !== false).sort((a, b) => a.codigo.localeCompare(b.codigo)).map((a) => {
    const fech = evolucaoMensal(F.inv, a.codigo).filter((p) => p.mes <= mes);
    const ult = fech.at(-1), pen = fech.at(-2);
    const mov = evolucaoMovimentados(F, a.codigo, mes);
    const mu = mov.at(-1), mp = mov.at(-2);
    return {
      almoxarifado: a.codigo, nome: a.nome_exibicao || a.codigo,
      acuracia: ult?.acuracia ?? null, deltaAcuracia: ult?.acuracia != null && pen?.acuracia != null ? r2(ult.acuracia - pen.acuracia) : null,
      iap: comp.get(a.codigo)?.iap ?? null,
      deltaIap: (() => { const atual = ult && ult.mes === mes ? comp.get(a.codigo)?.iap ?? null : null; const ant = pen ? iapEm(pen.mes, a.codigo) : null; return atual != null && ant != null ? r2(atual - ant) : null; })(),
      mov: mu?.pct ?? null, deltaMov: mu?.pct != null && mp?.pct != null ? r2(mu.pct - mp.pct) : null,
      movAplicavel: !!a.participa_contagem_diaria,
    };
  });
}

/** Resumo gerencial da involução: almoxarifados cujo IAP caiu e os 10 itens que mais pesaram (valor e pp do IAP). */
export function causasInvolucao(F: FontesMbr, mes: string, limiar = 0.2) {
  const D = F.inv, custo = (sku: string) => D.custos.get(sku);
  const nome = new Map(F.almox.map((a) => [a.codigo, a.nome_exibicao || a.codigo]));
  const almoxes: { codigo: string; nome: string; iap: number | null; deltaIap: number; mesAnt: string; divValor: number; divValorAnt: number; itensDiv: number; itensDivAnt: number; faltas: number; sobras: number }[] = [];
  const impactos: { almox: string; sku: string; descricao: string; sistema: number; contagem: number; divergencia: number; valor: number; pp: number; novo: boolean; recorrencias: number }[] = [];
  for (const sc of scorecardAlmox(F, mes)) {
    if (sc.deltaIap == null || sc.deltaIap > -limiar) continue;
    const fech = evolucaoMensal(D, sc.almoxarifado).filter((p) => p.mes <= mes); const ant = fech.at(-2)?.mes; if (!ant) continue;
    const doMes = D.itens.filter((i) => i.almoxarifado === sc.almoxarifado && i.mes === mes), doAnt = D.itens.filter((i) => i.almoxarifado === sc.almoxarifado && i.mes === ant);
    const portfolio = doMes.reduce((s, i) => s + (custo(i.sku) != null ? i.qtd_sistema * custo(i.sku)! : 0), 0);
    const val = (i: ItemInv) => (custo(i.sku) != null ? Math.abs(i.divergencia) * custo(i.sku)! : 0);
    const divM = doMes.filter((i) => i.divergente), divA = doAnt.filter((i) => i.divergente), divAntSku = new Set(divA.map((i) => i.sku));
    almoxes.push({ codigo: sc.almoxarifado, nome: sc.nome, iap: sc.iap, deltaIap: sc.deltaIap, mesAnt: ant, divValor: r2(divM.reduce((s, i) => s + val(i), 0)), divValorAnt: r2(divA.reduce((s, i) => s + val(i), 0)), itensDiv: divM.length, itensDivAnt: divA.length,
      faltas: r2(divM.filter((i) => i.divergencia < 0).reduce((s, i) => s + val(i), 0)), sobras: r2(divM.filter((i) => i.divergencia > 0).reduce((s, i) => s + val(i), 0)) });
    for (const i of divM) { const v = val(i); if (!v) continue; impactos.push({ almox: nome.get(sc.almoxarifado) ?? sc.almoxarifado, sku: i.sku, descricao: i.descricao ?? "—", sistema: i.qtd_sistema, contagem: i.qtd_contagem, divergencia: i.divergencia, valor: r2(v), pp: portfolio ? r2((v / portfolio) * 100) : 0, novo: !divAntSku.has(i.sku), recorrencias: i.recorrencias || 0 }); }
  }
  impactos.sort((a, b) => b.valor - a.valor);
  const top10 = impactos.slice(0, 10), total = impactos.reduce((s, x) => s + x.valor, 0);
  return { almoxes: almoxes.sort((a, b) => a.deltaIap - b.deltaIap), top10, totalDiv: r2(total), pctTop10: total ? Math.round((top10.reduce((s, x) => s + x.valor, 0) / total) * 100) : null,
    novos: top10.filter((x) => x.novo).length, faltasTop: r2(top10.filter((x) => x.divergencia < 0).reduce((s, x) => s + x.valor, 0)), sobrasTop: r2(top10.filter((x) => x.divergencia > 0).reduce((s, x) => s + x.valor, 0)) };
}

/** Todos os números das Seções 1 e 2 do MBR para o mês "AAAA-MM". */
export function coletarDados(F: FontesMbr, mes: string) {
  const D = F.inv, f = { almox: null, mes };
  const k = kpis(D, f), t = tresModelos(D, D.itens.filter((i) => i.mes === mes));
  const ate = <T extends { mes: string }>(l: T[]) => l.filter((p) => p.mes <= mes);
  return {
    mes,
    kpis: { acuracia: k.acuracia, total: k.total, divergentes: k.divergentes, resultado: k.resultado },
    evolucaoInventario: ate(evolucaoMensal(D, null)),
    comparativo: { item: t.item, iaq: t.iaq, iap: t.iap, gap: t.item != null && t.iap != null ? r2(t.item - t.iap) : null },
    evolucaoPonderada: ate(evolucaoPonderada(D, null)),
    concentracao: concentracaoValor(D, mes, 20),
    magnitude: magnitudeComItens(D, mes),
    porAlmox: comparativoPorAlmox(D, mes),
    evolucaoLoja: ate(evolucaoPonderada(D, "Almox_SP_Loja")),
    evolucaoPatio: ate(evolucaoPonderada(D, "Almox_SP_PatioPaulista")),
    faltaSobraLoja: faltaSobra(D, { almox: "Almox_SP_Loja", mes }, 5),
    faltaSobraPatio: faltaSobra(D, { almox: "Almox_SP_PatioPaulista", mes }, 5),
    movimentados: resumoMovimentados(F, mes),
    movimentadosPorAlmox: movimentadosPorAlmox(F, mes),
    evolucaoMovimentados: evolucaoMovimentados(F, null, mes),
    scorecardAlmox: scorecardAlmox(F, mes),
    involucao: causasInvolucao(F, mes),
    // os dois piores almoxarifados do mês (acurácia item a item), com evolução e maiores faltas/sobras
    piores: comparativoPorAlmox(D, mes).filter((c) => c.item != null).sort((a, b) => (a.item ?? 0) - (b.item ?? 0)).slice(0, 2).map((c) => ({
      almox: c.chave, item: c.item, iap: c.iap, iaq: c.iaq,
      evolucao: ate(evolucaoPonderada(D, c.chave)).slice(-6),
      faltaSobra: faltaSobra(D, { almox: c.chave, mes }, 5),
      mov: movimentadosPorAlmox(F, mes).find((m) => m.almoxarifado === c.chave)?.pct ?? null,
    })),
  };
}
export type DadosMbr = ReturnType<typeof coletarDados>;
