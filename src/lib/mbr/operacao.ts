// MBR · slides operacionais aprovados: próximos 30 dias (validade), reincidência de divergências com plano de ação e
// Farol de Movimentados (cumprimento de rotina, disciplina e nível de entrega por setor).
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import type { DadosInv } from "@/lib/atlas-inventario";
import { ALMOX_FAROL, coberturaItens, conciliacaoPorDia, ehDiaUtil, movimentoPelaConciliacao, movimentosPorDia, nivelServico, situacaoDia, type AlmoxFarol, type ConcLinha, type MovLinha, type SituacaoDia } from "@/lib/farol-movimentados";
import { fimDoMes, mesesAte, type DadosFarol } from "./dados3";
import { painelLeitura } from "./executivo";
import { ALTURA, COR, LARGURA, MARGEM, fmtMoeda, fmtNum, fmtPct, rotuloMes } from "./formato";
import { cabecalho, caixaLeitura, graficoBarrasH, linhaKpis, novoSlide, tabela, texto, type Pptx } from "./kit";

const sb = supabase as any;
const LC = LARGURA - 2 * MARGEM;
const corte = (t: string | null | undefined, n: number) => { const s = String(t ?? "—"); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somaDia = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// ---------------- Próximos 30 dias (abaixo do Farol de Shelf) ----------------
const acaoLote = (dias: number | null, almox: string) => (dias != null && dias < 0 ? "Baixar como vencido (avaliar destino)" : /para|pa_/i.test(almox) ? "Transferir para SP ou ação comercial local" : /loja|eldorado|patio|paulista/i.test(almox) ? "Ação comercial na loja (vitrine/degustação)" : "Priorizar consumo (FEFO) ou transferir para loja");
export function slideProximos30(p: Pptx, mesLabel: string, pag: number, f: DadosFarol | null) {
  const s = novoSlide(p), x = f?.proximos30;
  const lider = x?.porAlmox[0];
  cabecalho(s, x ? `Próximos 30 dias: ${fmtMoeda(x.valor)} vencem ou já venceram${lider ? ` — ${lider.nome} concentra ${fmtPct(x.valor ? (100 * lider.valor) / x.valor : null, 0)}` : ""}` : "Próximos 30 dias", mesLabel, pag, "Visão para frente — lotes vencidos ou que vencem em até 30 dias, onde estão e a ação sugerida para cada um (Farol de Shelf).");
  if (!x || !x.lotes) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem lotes em risco", "Nenhum lote vencido ou vencendo nos próximos 30 dias.", { corRotulo: COR.SUCESSO, tamanho: 13 }); return; }
  linhaKpis(s, 1.62, [
    { valor: fmtMoeda(x.valor), rotulo: "Vencido + vence em 30 dias", cor: COR.ERRO },
    { valor: fmtNum(x.lotes), rotulo: "Lotes envolvidos" },
    { valor: fmtNum(x.skus), rotulo: "SKUs envolvidos" },
    { valor: lider ? lider.nome : "—", rotulo: lider ? `Maior concentração · ${fmtMoeda(lider.valor)}` : "Maior concentração", cor: COR.ATENCAO },
  ], 0.7);
  graficoBarrasH(p, s, MARGEM, 2.55, 4.4, 4.35, x.porAlmox.slice(0, 8).map((a) => a.nome), "Valor (R$)", x.porAlmox.slice(0, 8).map((a) => a.valor), { cor: COR.ERRO, formato: '[>=1000]#,##0,"k";#,##0' });
  tabela(s, MARGEM + 4.6, 2.55, LC - 4.6, Math.min(4.35, 0.33 * (Math.min(x.itens.length, 12) + 1)), ["Produto", "Lote", "Almox.", "Vence em", "Valor", "Ação sugerida"], x.itens.map((i) => [corte(i.descricao, 26), corte(i.lote, 12), corte(i.almox, 16), { t: i.dias == null ? "—" : i.dias < 0 ? "vencido" : `${i.dias} d`, cor: i.dias != null && i.dias < 15 ? COR.ERRO : COR.ATENCAO, negrito: true }, { t: fmtMoeda(i.valor), negrito: true }, acaoLote(i.dias, i.almox)]), { larguras: [2.1, 1.0, 1.25, 0.75, 0.9, 1.73], tamanho: 8.5 });
}

// ---------------- Reincidência de divergências + plano de ação (abaixo dos dois piores) ----------------
export type Reincidente = { almox: string; sku: string; descricao: string; meses: number; janela: number; seguidos: number; padrao: "Falta recorrente" | "Sobra recorrente" | "Oscila (falta e sobra)"; perda: number; ultimo: number; acao: string; meta: string };
export function reincidencia(D: DadosInv | null | undefined, mes: string, janela = 6) {
  if (!D) return null;
  const meses = mesesAte(mes, janela), set = new Set(meses);
  const fechados = new Map<string, Set<string>>(); // almox -> meses com fechamento
  for (const f of D.fechamentos) if (set.has(f.mes)) fechados.set(f.almoxarifado, (fechados.get(f.almoxarifado) ?? new Set()).add(f.mes));
  const m = new Map<string, { almox: string; sku: string; descricao: string; porMes: Map<string, number>; perda: number }>();
  for (const i of D.itens) {
    if (!i.mes || !set.has(i.mes) || !i.divergente) continue;
    const k = `${i.almoxarifado}|${i.sku}`, e = m.get(k) ?? { almox: i.almoxarifado, sku: i.sku, descricao: i.descricao ?? i.sku, porMes: new Map(), perda: 0 };
    const c = D.custos.get(i.sku), v = c != null ? Math.abs(i.divergencia) * c : Math.abs(i.valor);
    e.porMes.set(i.mes, (e.porMes.get(i.mes) ?? 0) + i.divergencia); if (i.divergencia < 0) e.perda += v; m.set(k, e);
  }
  const out: Reincidente[] = [];
  for (const e of m.values()) {
    const mf = [...(fechados.get(e.almox) ?? [])].sort(); if (mf.length < 3) continue;
    const meses_ = e.porMes.size; if (meses_ < 3) continue;
    let seg = 0; for (let i = mf.length - 1; i >= 0 && e.porMes.has(mf[i]); i--) seg++;
    const sinais = [...e.porMes.values()], neg = sinais.filter((v) => v < 0).length, pos = sinais.filter((v) => v > 0).length;
    const padrao = neg && !pos ? "Falta recorrente" : pos && !neg ? "Sobra recorrente" : "Oscila (falta e sobra)";
    const acao = padrao === "Falta recorrente" ? "Auditar baixas, OP e transferências; contagem cega semanal" : padrao === "Sobra recorrente" ? "Conferir entradas/notas não lançadas e unidade de medida" : "Revisar endereço e embalagem; contagem com 2 conferentes";
    out.push({ almox: e.almox, sku: e.sku, descricao: e.descricao, meses: meses_, janela: mf.length, seguidos: seg, padrao, perda: Math.round(e.perda * 100) / 100, ultimo: e.porMes.get(mf[mf.length - 1]) ?? 0, acao, meta: "Zero divergência em 2 fechamentos seguidos" });
  }
  out.sort((a, b) => b.perda - a.perda || b.meses - a.meses);
  const perdaPeriodo = D.itens.filter((i) => i.mes && set.has(i.mes) && i.divergencia < 0).reduce((t, i) => { const c = D.custos.get(i.sku); return t + (c != null ? Math.abs(i.divergencia) * c : Math.abs(i.valor)); }, 0);
  const porAlmox = [...out.reduce((mm, r) => { const e = mm.get(r.almox) ?? { almox: r.almox, skus: 0, perda: 0 }; e.skus++; e.perda += r.perda; return mm.set(r.almox, e); }, new Map<string, { almox: string; skus: number; perda: number }>()).values()].sort((a, b) => b.perda - a.perda);
  const porPadrao = ["Falta recorrente", "Sobra recorrente", "Oscila (falta e sobra)"].map((pd) => ({ padrao: pd, skus: out.filter((r) => r.padrao === pd).length, perda: out.filter((r) => r.padrao === pd).reduce((t, r) => t + r.perda, 0) }));
  return { itens: out, perda: out.reduce((t, r) => t + r.perda, 0), perdaPeriodo, porAlmox, porPadrao, meses };
}
export type DadosReincidencia = NonNullable<ReturnType<typeof reincidencia>>;

export function slideReincidencia(p: Pptx, mesLabel: string, pag: number, r: DadosReincidencia | null) {
  const s = novoSlide(p);
  const pct = r && r.perdaPeriodo ? (100 * r.perda) / r.perdaPeriodo : null;
  cabecalho(s, r?.itens.length ? `${r.itens.length} SKUs divergiram em 3+ fechamentos dos últimos 6 meses: ${fmtMoeda(r.perda)} (${fmtPct(pct, 0)} da perda do período)` : "Reincidência de divergências", mesLabel, pag, `Reincidência — SKU que volta a divergir no mesmo almoxarifado (${r ? `${rotuloMes(r.meses[0])} a ${rotuloMes(r.meses.at(-1)!)}` : "últimos 6 meses"}): problema de processo, não pontual.`);
  if (!r || !r.itens.length) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem reincidência", "Nenhum SKU divergiu em 3 ou mais fechamentos no período.", { corRotulo: COR.SUCESSO, tamanho: 13 }); return; }
  linhaKpis(s, 1.62, [
    { valor: fmtNum(r.itens.length), rotulo: "SKUs reincidentes", cor: COR.ERRO },
    { valor: fmtMoeda(r.perda), rotulo: "Perda acumulada (faltas)", cor: COR.ERRO },
    { valor: fmtPct(pct, 0), rotulo: "Da perda de inventário do período" },
    { valor: fmtNum(r.itens.filter((i) => i.seguidos >= 3).length), rotulo: "Divergindo 3+ meses seguidos", cor: COR.ATENCAO },
    { valor: (r.porAlmox[0]?.almox ?? "—").replace(/^Almox_/, ""), rotulo: r.porAlmox[0] ? `Maior reincidência · ${r.porAlmox[0].skus} SKU(s)` : "Maior reincidência" },
  ], 0.7);
  const top = r.itens.slice(0, 8);
  graficoBarrasH(p, s, MARGEM, 2.55, 5.4, 4.35, top.map((i) => `${corte(i.descricao, 20)} · ${i.almox.replace(/^Almox_/, "")}`), "Fechamentos com divergência", top.map((i) => i.meses), { cor: COR.AZUL_INSTITUCIONAL, formato: "0" });
  tabela(s, MARGEM + 5.6, 2.55, LC - 5.6, 0.33 * (Math.min(r.porAlmox.length, 5) + 1), ["Almoxarifado", "SKUs", "Perda acumulada"], r.porAlmox.slice(0, 5).map((a) => [a.almox, fmtNum(a.skus), { t: fmtMoeda(a.perda), cor: COR.ERRO, negrito: true }]), { larguras: [3.2, 1.0, 2.53], tamanho: 10 });
  tabela(s, MARGEM + 5.6, 4.75, LC - 5.6, 1.3, ["Padrão", "SKUs", "Perda", "Causa provável"], r.porPadrao.map((x) => [{ t: x.padrao, negrito: true }, fmtNum(x.skus), fmtMoeda(x.perda), x.padrao === "Falta recorrente" ? "saída sem baixa/apontamento" : x.padrao === "Sobra recorrente" ? "entrada não lançada / unidade" : "endereço, embalagem ou contagem"]), { larguras: [2.0, 0.7, 1.3, 2.73], tamanho: 9.5 });
}

export function slidePlanoReincidencia(p: Pptx, mesLabel: string, pag: number, r: DadosReincidencia | null, mes: string) {
  const s = novoSlide(p);
  const prazo = dm(fimDoMes(mesesAte(somaDia(`${mes}-15`, 45).slice(0, 7), 1)[0]));
  const top = (r?.itens ?? []).slice(0, 10);
  cabecalho(s, top.length ? `Plano para reverter a reincidência: ${top.length} SKUs prioritários, ${fmtMoeda(top.reduce((t, i) => t + i.perda, 0))} em perda acumulada` : "Plano de ação — reincidência", mesLabel, pag, "Ação por padrão de divergência, dono (almoxarifado), prazo no próximo fechamento e critério de saída: zero divergência em 2 fechamentos seguidos.");
  if (!top.length) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem plano necessário", "Nenhum SKU reincidente no período.", { corRotulo: COR.SUCESSO, tamanho: 13 }); return; }
  tabela(s, MARGEM, 1.62, 9.0, 0.36 * (top.length + 1), ["SKU", "Produto", "Almox. (dono)", "Meses", "Padrão", "Perda acum.", "Ação", "Prazo"], top.map((i) => [i.sku, corte(i.descricao, 24), corte(i.almox.replace(/^Almox_/, ""), 14), `${i.meses}/${i.janela}${i.seguidos >= 3 ? " ▲" : ""}`, { t: i.padrao, cor: i.padrao === "Falta recorrente" ? COR.ERRO : i.padrao === "Sobra recorrente" ? COR.INFO : COR.ATENCAO, negrito: true }, { t: fmtMoeda(i.perda), negrito: true }, i.acao, prazo]), { larguras: [0.85, 1.6, 1.0, 0.6, 1.1, 0.85, 2.4, 0.6], tamanho: 8 });
  painelLeitura(s, MARGEM + 9.2, 1.62, LC - 9.2, 5.3, "Como reverter", [
    ["1 · Falta recorrente", "Auditar saídas sem registro (baixas, OP, transferências) e contar às cegas toda semana."],
    ["2 · Sobra recorrente", "Conferir entradas e notas não lançadas e a unidade do cadastro."],
    ["3 · Oscila", "Revisar endereço e embalagem; contagem com 2 conferentes."],
  ], `Cada SKU vira ação no Stock Savvy com dono e prazo em ${prazo}; sai do plano após 2 fechamentos seguidos sem divergência.`);
  texto(s, MARGEM, ALTURA - 0.42, 9.0, 0.3, "▲ = divergindo em 3 ou mais fechamentos seguidos. Ordem: maior perda acumulada.", { tamanho: 8.5, cor: COR.SEM_DADO });
}

// ---------------- Farol de Movimentados (abaixo do Controle de Movimentados) ----------------
export async function carregarFarolMov(mes: string) {
  const ini = `${mes}-01`, fim = fimDoMes(mes), ATLAS = ALMOX_FAROL.map((a) => a.atlas as string);
  const ler = <T,>(tab: string, cols: string, campo: string, almox?: string) => fetchAll<T>((f, t) => { let x = sb.from(tab).select(cols).gte(campo, ini).lte(campo, `${fim}T23:59:59`); if (almox) x = x.in(almox, ATLAS); return x.order(campo).range(f, t); }).catch(() => [] as T[]);
  const [erp, erpPl, brutas, porLote, hist, divs, lotes] = await Promise.all([
    ler<any>("movimentacoes_diarias", "data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento", "data"),
    fetchAll<any>((f, t) => sb.from("movimentacoes_erp").select("data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento").gte("data", ini).lte("data", fim).not("almox", "is", null).order("data").range(f, t)).catch(() => []),
    ler<any>("atlas_movimentacoes_brutas", "data, almoxarifado, sku, descricao, operacao, qtd_ent, qtd_sai, saldo", "data", "almoxarifado"),
    ler<any>("atlas_movimentacoes_lote_diaria", "data, almoxarifado_raw, sku, descricao_produto, quantidade, lote_movimentado", "data"),
    ler<any>("atlas_movimentacoes_historico", "data_movimento, almoxarifado, sku, origem, lote_importacao_id, entrada, saida, saldo_sistema", "data_movimento", "almoxarifado"),
    ler<any>("atlas_divergencias", "data_deteccao, almoxarifado, sku, origem, criado_em", "data_deteccao", "almoxarifado"),
    sb.from("atlas_lotes_importacao").select("id, criado_em").gte("criado_em", ini).then((r: any) => (r.data ?? []) as { id: number; criado_em: string }[]),
  ]);
  const loteEm = new Map<number, string>(lotes.map((l: { id: number; criado_em: string }) => [l.id, l.criado_em]));
  const isoSP = (x: string | null | undefined) => (x ? `${String(x).replace(" ", "T").slice(0, 19)}-03:00` : null);
  const mov: MovLinha[] = [...erp, ...erpPl,
    ...brutas.filter((b: any) => !String(b.operacao ?? "").toLowerCase().includes("inventario")).map((b: any) => ({ data: b.data, desc_almox: b.almoxarifado, id_produto: b.sku, descricao: b.descricao, qtd: (Number(b.qtd_ent) || 0) + (Number(b.qtd_sai) || 0), desc_movimento: b.operacao, saldo: b.saldo })),
    ...porLote.map((l: any) => ({ data: l.data, desc_almox: l.almoxarifado_raw, id_produto: l.sku, descricao: l.descricao_produto, qtd: Number(l.quantidade) || 0, id_lote: l.lote_movimentado }))];
  const conc: ConcLinha[] = [
    ...hist.filter((h: any) => h.origem !== "fechamento_inventario").map((h: any) => ({ almoxarifado: h.almoxarifado, data: h.data_movimento, sku: h.sku, divergente: false, em: isoSP(loteEm.get(h.lote_importacao_id)) })),
    ...divs.filter((d: any) => d.origem !== "fechamento_inventario").map((d: any) => ({ almoxarifado: d.almoxarifado, data: d.data_deteccao, sku: d.sku, divergente: true, em: isoSP(d.criado_em) }))];
  mov.push(...movimentoPelaConciliacao(mov, conc));
  return resumoFarolMov(mes, movimentosPorDia(mov), conciliacaoPorDia(conc));
}

/** Resumo do mês por setor e por semana a partir das situações diárias do farol. */
export function resumoFarolMov(mes: string, porDia: Map<string, any>, concPor: Map<string, any>, hoje = new Date().toISOString().slice(0, 10)) {
  const dias: string[] = []; for (let d = `${mes}-01`; d <= fimDoMes(mes); d = somaDia(d, 1)) if (ehDiaUtil(d)) dias.push(d);
  const sit = (a: AlmoxFarol, d: string): SituacaoDia => situacaoDia(porDia.get(`${a}|${d}`), concPor.get(`${a}|${d}`), d, hoje);
  const semanas = [...new Set(dias.map((d) => somaDia(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7))))];
  const setores = ALMOX_FAROL.map((a) => {
    const sits = dias.map((d) => sit(a.id, d)), n = nivelServico(sits), cob = coberturaItens(sits);
    const diasMov = sits.filter((x) => x.tipo !== "SEM_MOV").length, diverg = sits.reduce((t, x) => t + (x.tipo === "SEM_MOV" ? 0 : x.divergentes), 0);
    const porSemana = semanas.map((w) => nivelServico(dias.filter((d) => d >= w && d < somaDia(w, 7)).map((d) => sit(a.id, d))).nivel);
    return { id: a.id, nome: a.nome, diasMov, ...n, cobertura: cob.pct, itens: cob.itens, conciliados: cob.conciliados, divergencias: diverg, porSemana, disciplina: n.vencidos ? (n.cumpridos + n.atrasados) / n.vencidos : null };
  });
  const tot = nivelServico(ALMOX_FAROL.flatMap((a) => dias.map((d) => sit(a.id, d)))), cobT = coberturaItens(ALMOX_FAROL.flatMap((a) => dias.map((d) => sit(a.id, d))));
  return { mes, semanas, setores, nivel: tot.nivel, falhas: tot.falhas, atrasados: tot.atrasados, vencidos: tot.vencidos, cumpridos: tot.cumpridos, cobertura: cobT.pct, disciplina: tot.vencidos ? (tot.cumpridos + tot.atrasados) / tot.vencidos : null };
}
export type DadosFarolMov = ReturnType<typeof resumoFarolMov>;

export function slideFarolMov(p: Pptx, mesLabel: string, pag: number, f: DadosFarolMov | null, meta = 0.95) {
  const s = novoSlide(p);
  const na = f?.setores.filter((x) => x.nivel != null && x.nivel >= meta) ?? [], pior = [...(f?.setores ?? [])].filter((x) => x.nivel != null).sort((a, b) => a.nivel! - b.nivel!)[0];
  cabecalho(s, f?.nivel != null ? `Farol de Movimentados: ${fmtPct(f.nivel * 100, 0)} de nível de serviço no mês (meta ${fmtPct(meta * 100, 0)}); ${na.length} de ${f.setores.length} setores na meta` : "Farol de Movimentados", mesLabel, pag, "Rotina diária: todo item movimentado conciliado até o dia útil seguinte (D+1) — cumprimento por setor, disciplina e nível de entrega.");
  if (!f || !f.vencidos) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem dias apurados", "Nenhum dia útil com movimento e prazo vencido no mês.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  linhaKpis(s, 1.62, [
    { valor: fmtPct((f.nivel ?? 0) * 100, 0), rotulo: "Nível de serviço (no prazo D+1)", cor: (f.nivel ?? 0) >= meta ? COR.SUCESSO : COR.ERRO, contexto: `${f.cumpridos} de ${f.vencidos} dias-setor` },
    { valor: fmtPct((f.disciplina ?? 0) * 100, 0), rotulo: "Disciplina (conferido, mesmo atrasado)", cor: COR.AZUL_INSTITUCIONAL },
    { valor: fmtNum(f.falhas), rotulo: "Dias sem conferência", cor: f.falhas ? COR.ERRO : COR.SUCESSO },
    { valor: fmtNum(f.atrasados), rotulo: "Conferências após o D+1", cor: f.atrasados ? COR.ATENCAO : COR.SUCESSO },
    { valor: fmtPct((f.cobertura ?? 0) * 100, 0), rotulo: "Nível de entrega (itens conciliados)" },
  ], 0.7);
  const st = (n: number | null) => (n == null ? { t: "—", cor: COR.SEM_DADO } : n >= meta ? { t: "Na meta", cor: COR.SUCESSO } : n >= 0.8 ? { t: "Atenção", cor: COR.ATENCAO } : { t: "Crítico", cor: COR.ERRO });
  tabela(s, MARGEM, 2.55, 8.2, 0.42 * (f.setores.length + 1), ["Setor", "Dias c/ mov.", "No prazo", "Atrasados", "Sem conferência", "Nível de serviço", "Entrega (itens)", "Status"], f.setores.map((x) => [{ t: x.nome, negrito: true }, fmtNum(x.diasMov), { t: fmtNum(x.cumpridos), cor: COR.SUCESSO }, { t: fmtNum(x.atrasados), cor: x.atrasados ? COR.ATENCAO : COR.CINZA_TEXTO }, { t: fmtNum(x.falhas), cor: x.falhas ? COR.ERRO : COR.CINZA_TEXTO, negrito: !!x.falhas }, { t: x.nivel == null ? "—" : fmtPct(x.nivel * 100, 0), negrito: true }, x.cobertura == null ? "—" : `${fmtPct(x.cobertura * 100, 0)} (${fmtNum(x.conciliados)}/${fmtNum(x.itens)})`, { ...st(x.nivel), negrito: true }]), { larguras: [1.2, 0.9, 0.85, 0.9, 1.05, 1.1, 1.3, 0.9], tamanho: 9.5 });
  const y2 = 2.55 + 0.42 * (f.setores.length + 1) + 0.25;
  texto(s, MARGEM, y2, 8.2, 0.24, "NÍVEL DE SERVIÇO POR SEMANA (CUMPRIMENTO DA ROTINA)", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  tabela(s, MARGEM, y2 + 0.28, 8.2, 0.36 * (f.setores.length + 1), ["Setor", ...f.semanas.map((w) => `Sem. ${dm(w)}`)], f.setores.map((x) => [{ t: x.nome, negrito: true }, ...x.porSemana.map((n) => ({ t: n == null ? "—" : fmtPct(n * 100, 0), cor: n == null ? COR.SEM_DADO : n >= meta ? COR.SUCESSO : n >= 0.8 ? COR.ATENCAO : COR.ERRO, negrito: true }))]), { larguras: [1.4, ...f.semanas.map(() => (8.2 - 1.4) / f.semanas.length)], tamanho: 9.5 });
  painelLeitura(s, MARGEM + 8.45, 2.55, LC - 8.45, 4.35, "Leitura do mês", [
    [na.length ? `Na meta: ${na.map((x) => x.nome).join(", ")}` : "Nenhum setor na meta", `Meta de ${fmtPct(meta * 100, 0)} dos dias com movimento conciliados até D+1.`],
    pior ? [`Ponto de atenção: ${pior.nome}`, `${fmtPct((pior.nivel ?? 0) * 100, 0)} de nível de serviço · ${pior.falhas} dia(s) sem conferência · ${pior.atrasados} atrasado(s).`] : ["—", "—"],
  ], pior && (pior.nivel ?? 1) < meta ? `${pior.nome}: conferência D+1 diária com a Lista de Movimentados das 18h e cobrança no Farol até voltar a ${fmtPct(meta * 100, 0)}.` : "Manter a cobrança diária pelo Farol de Movimentados.");
}
