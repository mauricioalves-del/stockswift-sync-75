// MBR — Seção 1: Resumo Executivo e Scorecard do Mês (porte de _analise_geral / _montar_scorecard / _recorte_periodo do
// gerador do Atlas), agora alimentados pelos dashboards nativos do Stock Savvy.
import { ALTURA, COR, LARGURA, LIMIAR_ACURACIA, MARGEM, alturaCaixaLeitura, avancoOperacional, fmtMoeda, fmtNum, fmtPct, linhasEstimadas, nomeMes, r2, statusMaiorMelhor, statusMenorMelhor, type Status } from "./formato";
import { cabecalho, caixaLeitura, linhaKpis, listaMarcadores, novoSlide, retangulo, tabela, textoRico, texto, type Celula, type Pptx } from "./kit";
import type { DadosMbr } from "./dados";
import type { DadosBaixas, DadosFarol, DadosFefo, DadosObsolescencia, DadosPacotes } from "./dados3";

const LC = LARGURA - 2 * MARGEM;
export type Consolidado = { d: DadosMbr; baixas: DadosBaixas | null; pacotes: DadosPacotes | null; farol: DadosFarol | null; obsolescencia: DadosObsolescencia | null; fefo: DadosFefo | null };
export type LinhaScorecard = { frente: string; status: Status; leitura: string; passo: string };

const st = (label: string, cor: string): Status => ({ label, cor });
/** Shelf Life = lotes vencidos ou a vencer em até 90 dias no Farol de Shelf (retrato do dia). */
const shelf = (c: Consolidado) => ({ lotes: c.farol?.totalLotes ?? 0, valor: c.farol?.valorTotal ?? 0, vencidos: c.farol?.status.Vencido.qtd ?? 0 });

export function recortePeriodo(c: Consolidado) {
  const comp: { frente: string; delta: number }[] = [];
  const ep = c.d.evolucaoPonderada, em = c.d.evolucaoMovimentados;
  if (ep.length >= 2 && ep.at(-1)!.varIap != null) comp.push({ frente: "Acurácia Ponderada (IAP)", delta: ep.at(-1)!.varIap! });
  if (em.length >= 2 && em.at(-1)!.pct != null && em.at(-2)!.pct != null) comp.push({ frente: "Controle de Movimentados", delta: r2(em.at(-1)!.pct! - em.at(-2)!.pct!) });
  let avanco = comp.length ? comp.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;
  if (avanco && avanco.delta <= 0) avanco = null;
  let involucao = comp.length ? comp.reduce((a, b) => (b.delta < a.delta ? b : a)) : null;
  if (involucao && involucao.delta >= 0) involucao = null;
  if (avanco && involucao && avanco.frente === involucao.frente) involucao = null;
  return { avanco, involucao, variacaoPassivos: c.pacotes?.variacaoPassivos ?? null };
}

export function analiseGeral(c: Consolidado) {
  const av: string[] = [], at: string[] = [], dec: string[] = [];
  const { d } = c, ep = d.evolucaoPonderada, comp = d.comparativo, mov = d.movimentados, em = d.evolucaoMovimentados;
  if (ep.length && ep.at(-1)!.iap != null) {
    const atual = ep.at(-1)!.iap!, pri = ep[0];
    if (ep.length >= 2 && pri.iap != null) {
      const delta = r2(atual - pri.iap), comD = ep.slice(1).filter((e) => e.varIap != null), melhora = comD.filter((e) => e.varIap! > 0).length, piora = comD.filter((e) => e.varIap! < 0).length;
      if (delta > 0 && melhora >= piora) av.push(`IAP (Acurácia por Valor) sobe de ${fmtPct(pri.iap)} em ${nomeMes(pri.mes)} para ${fmtPct(atual)} em ${nomeMes(ep.at(-1)!.mes)} — +${fmtPct(delta)} no período${melhora > piora ? `, melhora em ${melhora} de ${comD.length} mês(es) monitorado(s). Curva de aprendizado consistente, não um pico isolado.` : "."}`);
      else at.push(`IAP (Acurácia por Valor) em ${fmtPct(atual)}, variação de ${fmtPct(delta)} desde ${nomeMes(pri.mes)} — sem curva de aprendizado consistente ainda (${piora} de ${comD.length} mês(es) com queda).`);
    } else (statusMaiorMelhor(atual).label === "Em avanço" ? av : at).push(`IAP (Acurácia por Valor) em ${fmtPct(atual)} neste mês (ainda sem histórico anterior suficiente pra falar de tendência).`);
  }
  if (comp.item != null) at.push(`Item a item em ${fmtPct(comp.item)} funciona como termômetro de disciplina de apontamento — não é mais o indicador oficial de acurácia (ver Acurácia Ponderada).`);
  if (comp.gap != null && Math.abs(comp.gap) >= 3) at.push(`A leitura ponderada por valor (IAP) muda em ${fmtPct(Math.abs(comp.gap))} a foto do item-a-item — sinal de que o risco financeiro está concentrado em poucos SKUs, não de que o inventário piorou.`);
  const b = c.baixas, pas = c.pacotes?.passivosMes;
  if (b?.total) at.push(`${fmtMoeda(b.total)} em baixas por pacote no período (${fmtPct(b.pctDestaque)} concentrado em ${b.motivoDestaque ?? "—"}).`);
  else if (pas?.valor && pas.valor > 0) at.push(`${fmtMoeda(pas.valor)} em passivos aprovados mapeados no período (${fmtNum(pas.quantidade)} baixas).`);
  else av.push("Nenhum passivo residual aprovado sem mapeamento no período.");
  const res = c.pacotes?.resultadoMes;
  if (res && (res.entradas_qtd || res.saidas_qtd)) (res.resultado_valor >= 0 ? av : at).push(`Resultado de inventário do mês ${res.resultado_valor >= 0 ? "positivo" : "negativo"} em ${fmtMoeda(res.resultado_valor)}.`);
  const sh = shelf(c);
  if (sh.valor) dec.push(`Priorizar consumo/transferência dos ${fmtMoeda(sh.valor)} em lotes vencidos ou a vencer em até 90 dias (${fmtNum(sh.lotes)} lotes).`);
  else if (c.farol) av.push("Sem valor relevante de estoque em risco de validade neste recorte.");
  if (em.length && em[0].pct != null && mov.pct != null) {
    const pri = em[0], delta = r2(mov.pct - pri.pct!);
    if (em.length >= 2 && delta > 0) av.push(`Controle de Movimentados: acurácia da reconciliação diária subiu de ${fmtPct(pri.pct)} (em ${nomeMes(pri.mes)}, primeiro mês monitorado) para ${fmtPct(mov.pct)} agora (+${fmtPct(delta)}) — ação com impacto direto e mensurável na acurácia.`);
    else at.push(`Controle de Movimentados: acurácia da reconciliação diária em ${fmtPct(mov.pct)} desde a implantação (em ${nomeMes(pri.mes)}) — ainda sem ganho consistente frente ao ponto de partida.`);
  } else if (mov.itens_analisados) av.push(`Controle de Movimentados ativo: ${fmtNum(mov.itens_analisados)} item(ns) reconciliado(s) neste mês.`);
  const f = c.fefo;
  if (f?.total) {
    const s = statusMenorMelhor(f.taxa, 5, 20), t = `FEFO: taxa de quebra em ${fmtPct(f.taxa)} neste mês (${fmtNum(f.quebras)} de ${fmtNum(f.total)} transferências auditadas no Controle de FEFO).`;
    if (s.label === "Em avanço") av.push(t); else at.push(s.label === "Atenção" ? t : `${t} — acima do limiar aceitável.`);
  } else dec.push("Controle de FEFO sem transferência auditada neste mês — confira se a checagem automática está rodando.");
  if (!dec.length) dec.push("Manter a cadência atual de fechamento e monitoramento — sem decisão crítica pendente neste recorte.");
  const mensagem = !at.length
    ? "A operação está sob controle em todas as frentes mapeadas neste mês — inventário auditado, passivos mapeados, sem decisão crítica pendente. O ganho aqui é de visibilidade: o mesmo controle que antes vivia em planilhas isoladas agora é automático, a cada fechamento."
    : `O mapeamento da operação mostra controle real do estoque, não percepção: ${av.length} frente(s) em avanço e ${at.length} de atenção neste mês, com as ações já priorizadas ao lado — inventário, passivos, validade e movimentação lidos juntos, pra agir antes que a atenção vire perda.`;
  return { avancos: av, atencoes: at, decisoes: dec, mensagem, recorte: recortePeriodo(c) };
}

/** Linhas do Scorecard do Mês, na ordem do modelo final. */
export function montarScorecard(c: Consolidado): LinhaScorecard[] {
  const { d } = c, k = d.kpis, comp = d.comparativo, mov = d.movimentados, em = d.evolucaoMovimentados;
  const sGap = avancoOperacional(comp.iap, comp.gap != null && Math.abs(comp.gap) >= 3 ? st("Atenção", COR.ATENCAO) : st("Em avanço", COR.SUCESSO));
  const ponderada = { frente: "Acurácia Ponderada", status: sGap, leitura: `IAP (ponderado por valor) em ${fmtPct(comp.iap)}, ${comp.gap != null ? fmtPct(Math.abs(comp.gap)) : "—"} de distância do item-a-item.`, passo: sGap.label === "Atenção" ? "Priorizar SKUs de maior impacto financeiro na correção." : "Distorção sob controle — manter leitura mensal." };
  const sInv = avancoOperacional(k.acuracia, statusMaiorMelhor(k.acuracia, ...LIMIAR_ACURACIA));
  const inventario = { frente: "Painel de Inventário", status: sInv, leitura: `Acurácia geral ${fmtPct(k.acuracia)} sobre ${fmtNum(k.total)} itens avaliados.`, passo: k.divergentes ? "Investigar SKUs recorrentes." : "Manter cadência de fechamento atual." };
  const b = c.baixas, pas = c.pacotes?.passivosMes;
  const baixas = b
    ? { frente: "Baixas Operacionais (Pacote)", status: b.total ? st("Atenção", COR.ATENCAO) : st("Em avanço", COR.SUCESSO), leitura: `${fmtMoeda(b.total)} no período — ${fmtPct(b.pctDestaque)} concentrado em ${b.motivoDestaque ?? "—"}.`, passo: b.total ? "Investigar causa raiz da concentração antes do próximo fechamento." : "Sem baixa relevante — manter monitoramento." }
    : { frente: "Mapeamento de Passivos", status: pas?.valor ? st("Atenção", COR.ATENCAO) : st("Em avanço", COR.SUCESSO), leitura: `${fmtMoeda(pas?.valor ?? 0)} em passivos aprovados mapeados no período.`, passo: pas?.valor ? "Classificar pendências como ajuste de processo ou perda real." : "Sem pendência — manter monitoramento." };
  const sh = shelf(c);
  const shelfLife = { frente: "Shelf Life", status: sh.lotes ? st("Atenção", COR.ATENCAO) : st("Em avanço", COR.SUCESSO), leitura: `${fmtNum(sh.lotes)} lote(s) em risco de validade, ${fmtMoeda(sh.valor)} em valor exposto.`, passo: sh.lotes ? "Priorizar consumo/transferência dos lotes a vencer em 30 dias." : "Sem lote em risco — manter monitoramento." };
  const o = c.obsolescencia;
  const sObs = o?.quantidadeCriticos ? st("Crítico", COR.ERRO) : o?.quantidadeItens ? st("Atenção", COR.ATENCAO) : st("Em avanço", COR.SUCESSO);
  const obsol = { frente: "Mapeamento de Risco (Obsolescência)", status: sObs, leitura: o?.quantidadeItens ? `${fmtNum(o.quantidadeItens)} item(ns) em risco de obsolescência, ${fmtMoeda(o.valorTotal)} em valor exposto.` : "Nenhum item combina validade próxima com giro insuficiente neste recorte.", passo: o?.quantidadeCriticos ? "Priorizar ação comercial/promocional nos itens críticos (giro zero) antes que vençam." : o?.quantidadeItens ? "Monitorar itens em atenção — giro insuficiente pra escoar no ritmo atual." : "Sem risco de obsolescência — manter monitoramento." };
  const pri = em[0], positiva = em.length >= 2 && pri?.pct != null && mov.pct != null && mov.pct > pri.pct;
  const sMov = avancoOperacional(mov.pct, positiva ? st("Em avanço", COR.SUCESSO) : statusMaiorMelhor(mov.pct));
  const movim = { frente: "Controle de Movimentados", status: sMov, leitura: positiva ? `Acurácia da reconciliação diária em ${fmtPct(mov.pct)} — alta consistente desde ${nomeMes(pri.mes)} (+${fmtPct(mov.pct! - pri.pct!)}).` : `Acurácia da reconciliação diária em ${fmtPct(mov.pct)} sobre ${fmtNum(mov.itens_analisados)} item(ns) analisado(s) no mês.`, passo: mov.itens_com_divergencia ? "Investigar itens com divergência não resolvida." : "Manter cadência de conferência diária." };
  return [ponderada, inventario, baixas, shelfLife, obsol, movim];
}

export function slideResumoExecutivo(p: Pptx, mesLabel: string, pag: number, c: Consolidado) {
  const s = novoSlide(p);
  cabecalho(s, "Resumo Executivo", mesLabel, pag, "Controle operacional do estoque em números — o que mudou, o que exige decisão");
  const { d } = c, comp = d.comparativo, mov = d.movimentados, ep = d.evolucaoPonderada;
  const sMov = statusMaiorMelhor(mov.pct), sIap = statusMaiorMelhor(comp.iap), vIap = ep.at(-1)?.varIap ?? null;
  const ctxIap = vIap != null ? `${vIap > 0 ? "▲" : vIap < 0 ? "▼" : "▬"} ${fmtPct(Math.abs(vIap))} vs. mês anterior` : sIap.label;
  const corCtxIap = vIap != null ? (vIap > 0 ? COR.SUCESSO : vIap < 0 ? COR.ERRO : COR.CINZA_TEXTO) : sIap.cor;
  const b = c.baixas, pas = c.pacotes?.passivosMes, sh = shelf(c);
  linhaKpis(s, 1.55, [
    { valor: fmtPct(comp.iap), rotulo: "IAP — Acurácia por Valor", cor: sIap.cor, contexto: ctxIap, corContexto: corCtxIap },
    b ? { valor: fmtMoeda(b.total), rotulo: "Baixas por Pacote", cor: COR.ERRO, contexto: `${fmtPct(b.pctDestaque)} em ${b.motivoDestaque ?? "—"}` } : { valor: fmtMoeda(pas?.valor ?? 0), rotulo: "Passivos Mapeados", contexto: `${fmtNum(pas?.quantidade ?? 0)} baixas aprovadas` },
    { valor: fmtMoeda(sh.valor), rotulo: "Valor em Risco de Validade", cor: COR.ATENCAO, contexto: `${fmtNum(sh.lotes)} lotes · ${fmtNum(sh.vencidos)} já vencidos` },
    { valor: fmtPct(mov.pct), rotulo: "Controle de Movimentados", contexto: sMov.label, corContexto: sMov.cor },
  ], 0.68);
  const a = analiseGeral(c), r = a.recorte;
  const partes: { t: string; cor?: string; negrito?: boolean }[] = [];
  if (r.avanco) partes.push({ t: "▲ Maior avanço do mês: " }, { t: `${r.avanco.frente} (+${fmtPct(r.avanco.delta)})`, cor: COR.SUCESSO, negrito: true });
  if (r.involucao) partes.push(...(partes.length ? [{ t: "     " }] : []), { t: "▼ Maior involução do mês: " }, { t: `${r.involucao.frente} (${fmtPct(r.involucao.delta)})`, cor: COR.ERRO, negrito: true });
  if (r.variacaoPassivos) partes.push(...(partes.length ? [{ t: "     " }] : []), { t: "Passivos aprovados: " }, { t: `${r.variacaoPassivos > 0 ? "+" : ""}${fmtMoeda(r.variacaoPassivos)} vs. mês anterior`, cor: r.variacaoPassivos > 0 ? COR.ERRO : COR.SUCESSO, negrito: true });
  let yC = 3.1;
  if (partes.length) { retangulo(s, MARGEM, 2.95, LC, 0.42, { fill: COR.OFF_WHITE, raio: 0.08 }); textoRico(s, MARGEM + 0.18, 2.95, LC - 0.36, 0.42, partes, 11.5); yC = 2.95 + 0.42 + 0.18; }
  const lc = (LC - 2 * 0.25) / 3, ltc = lc - 0.22, fim = ALTURA - 0.55;
  const hMsg = Math.max(1.05, alturaCaixaLeitura(a.mensagem, LC, 12)), orc = fim - yC - 0.36 - 0.15 - hMsg;
  const listas = [a.avancos, a.atencoes, a.decisoes];
  const altura = (tam: number, esp: number) => Math.max(...listas.map((l) => l.reduce((t, it) => t + esp * linhasEstimadas(it, ltc, tam) + 0.1, 0)));
  let tam = 11.5, esp = 0.24;
  for (const t of [11.5, 10.5, 9.5]) { tam = t; esp = 0.24 * (t / 11.5); if (altura(tam, esp) <= orc) break; }
  const hL = Math.min(altura(tam, esp), orc);
  ([["AVANÇOS", a.avancos, COR.SUCESSO], ["ATENÇÕES", a.atencoes, COR.ATENCAO], ["DECISÕES", a.decisoes, COR.AZUL_INSTITUCIONAL]] as const).forEach(([tit, itens, cor], i) => {
    const x = MARGEM + i * (lc + 0.25);
    texto(s, x, yC, lc, 0.28, tit, { tamanho: 13, negrito: true, cor });
    listaMarcadores(s, x, yC + 0.36, lc, hL, [...itens], cor, tam, esp);
  });
  const yM = yC + 0.36 + hL + 0.15;
  caixaLeitura(s, MARGEM, yM, LC, Math.max(hMsg, fim - yM), "Mensagem Central", a.mensagem, { tamanho: 12 });
}

export function slideScorecard(p: Pptx, mesLabel: string, pag: number, c: Consolidado) {
  const s = novoSlide(p);
  cabecalho(s, "Scorecard do Mês", mesLabel, pag, "Leitura executiva e próximo passo por frente da operação");
  tabela(s, MARGEM, 1.65, LC, 4.9, ["Frente", "Status", "Leitura Executiva", "Próximo Passo"],
    montarScorecard(c).map((l): Celula[] => [{ t: l.frente, cor: COR.AZUL_INSTITUCIONAL, negrito: true }, { t: l.status.label, cor: l.status.cor, negrito: true }, l.leitura, l.passo]), { larguras: [2, 1.1, 3.4, 3], tamanho: 13 });
}
export const ITENS_SECAO1 = ["Resumo Executivo", "Scorecard do Mês"];
