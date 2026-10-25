// Fechamento de Inventário e Pós-Inventário do Atlas (fechamento_router.py), em TypeScript.
// Importa a planilha de conciliação (aba "Saldo de estoque - ace4"), gera itens, divergências (origem
// fechamento_inventario, investigadas pelo mesmo motor da tela de Divergências) e histórico; controla as três
// assinaturas de ciência (com retrato dos itens divergentes no momento da assinatura) e as ações de pós-inventário.
import { supabase } from "@/integrations/supabase/client";
import { comoObjetos, limparTexto, normalizarAlmoxarifado, parseData, parseDecimal, parseSku, type Contexto, type Planilha } from "./atlas-importar";
import { investigarLote, lerTudo } from "./atlas-investigacao";

const sb = supabase as any;
const r2 = (n: number) => Math.round(n * 100) / 100;
async function logAtlas(usuario: string, acao: string, detalhes: Record<string, unknown>, fechamentoId?: number) {
  await sb.from("atlas_log_auditoria").insert({ username: usuario, acao, entidade: fechamentoId != null ? "fechamento" : null, entidade_id: fechamentoId != null ? String(fechamentoId) : null, detalhes, criado_em: new Date().toISOString() });
}

export const ABA_FECHAMENTO = "Saldo de estoque - ace4";
const COL = { grupo: "Grupo", sku: "Produto", descricao: "Descrição", almoxarifado: "Almoxarifado", unidade: "Unid.", qtd_sistema: "Qtd.", qtd_contagem: "Contagem 1", status: "Status", resumo: "Resumo", valor: "Vl", percentual: "%", obs: "Obs", obs_pos: "obs pós inv", obs2: "obs2", data: "Data" };

export const PAPEIS_ASSINATURA: Record<string, string> = {
  Diretor_Operacoes: "Diretor de Operações",
  Coordenador_Financeiro: "Coordenador Financeiro",
  Responsavel_Departamento: "Responsável pelo Departamento",
};

async function inserirRetornandoIds(tabela: string, linhas: Record<string, unknown>[]): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < linhas.length; i += 500) {
    const { data, error } = await sb.from(tabela).insert(linhas.slice(i, i + 500)).select("id");
    if (error) throw new Error(`${tabela}: ${error.message}`);
    ids.push(...(data ?? []).map((x: any) => x.id));
  }
  return ids;
}

// ---------- importação ----------
export type ResultadoFechamento = { fechamentoId: number; almoxarifado: string | null; data: string | null; total: number; divergentes: number; valor: number; acoesCriadas: number; acoesFechadas: number; investigadas: number; erros: string[] };

export async function importarFechamento(p: Planilha, arquivo: string, aba: string, ctx: Contexto, progresso?: (t: string) => void): Promise<ResultadoFechamento> {
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const objs = comoObjetos(p.ler(aba));
  const cab = Object.keys(objs[0] ?? {});
  const falta = [COL.sku, COL.almoxarifado, COL.status, COL.data].filter((c) => !cab.includes(c));
  if (falta.length) throw new Error(`Colunas esperadas não encontradas: ${falta.join(", ")}. Cabeçalho: ${cab.join(", ")}`);

  // recorrência: quantas vezes o SKU já divergiu nesse almoxarifado em fechamentos anteriores
  const anteriores = await lerTudo<any>("atlas_itens_fechamento", "sku, almoxarifado", (q) => q.eq("divergente", true));
  const recorr = new Map<string, number>(); for (const a of anteriores) recorr.set(`${a.sku}|${a.almoxarifado}`, (recorr.get(`${a.sku}|${a.almoxarifado}`) ?? 0) + 1);

  type Linha = { sku: string; almox: string; data: string; descricao: string | null; categoria: string; sis: number; cont: number; div: number; valor: number; pct: number | null; divergente: boolean; resumo: string | null; obsPos: string | null; obs2: string | null; obs: string | null; unidade: string | null };
  const linhas: Linha[] = []; const erros: string[] = [];
  objs.forEach((o, k) => {
    const bruto = o[COL.sku]; if (bruto == null || String(bruto).trim() === "") return;
    try {
      const sku = parseSku(bruto)!; const almox = normalizarAlmoxarifado(o[COL.almoxarifado]);
      const data = parseData(o[COL.data]); if (!data) throw new Error("data vazia");
      const sis = parseDecimal(o[COL.qtd_sistema]), cont = parseDecimal(o[COL.qtd_contagem]);
      const divergente = !String(o[COL.status] ?? "").trim().toLowerCase().startsWith("sem");
      const div = divergente ? Math.round((cont - sis) * 10000) / 10000 : 0;
      const vPlan = parseDecimal(o[COL.valor]); const prod = ctx.produtos.get(sku);
      const valor = divergente ? (vPlan ? vPlan : prod?.custo ? r2(Math.abs(div) * prod.custo) : 0) : 0;
      const pPlan = o[COL.percentual];
      const pct = pPlan != null && pPlan !== "" ? Number(pPlan) : sis ? Math.round((Math.min(cont, sis) / sis) * 10000) / 10000 : divergente ? null : 1;
      linhas.push({ sku, almox, data, descricao: limparTexto(o[COL.descricao]), categoria: prod?.categoria || limparTexto(o[COL.grupo]) || "Desconhecido", sis, cont, div, valor, pct, divergente, resumo: limparTexto(o[COL.resumo]), obsPos: limparTexto(o[COL.obs_pos]), obs2: limparTexto(o[COL.obs2]), obs: limparTexto(o[COL.obs]), unidade: limparTexto(o[COL.unidade]) });
    } catch (e: any) { erros.push(`linha ${k + 2}: ${e?.message ?? e}`); }
  });
  if (!linhas.length) throw new Error("Nenhum item válido na planilha.");

  progresso?.("criando o fechamento…");
  const { data: f, error } = await sb.from("atlas_fechamentos_inventario").insert({ arquivo_origem: arquivo, criado_por: ctx.usuario, criado_em: new Date().toISOString(), almoxarifado: linhas[0].almox, data_fechamento: linhas[0].data }).select("id").single();
  if (error) throw new Error("Não consegui criar o fechamento: " + error.message);
  try {
    const obsDe = (l: Linha) => l.obsPos || l.obs || l.resumo;
    const divs = linhas.filter((l) => l.divergente), oks = linhas.filter((l) => !l.divergente);
    progresso?.(`gravando ${divs.length} divergências…`);
    const idsDiv = await inserirRetornandoIds("atlas_divergencias", divs.map((l) => ({ sku: l.sku, almoxarifado: l.almox, categoria_produto: l.categoria, data_deteccao: l.data, saldo_sistema: l.sis, saldo_fisico: l.cont, divergencia_qtd: l.div, valor_estimado: l.valor, status: "Aberta", observacao_origem: obsDe(l), origem: "fechamento_inventario", criado_em: new Date().toISOString(), evidencias: [], casos_similares: [], distribuicao_probabilidades: [] })));
    const idsHist = await inserirRetornandoIds("atlas_movimentacoes_historico", oks.map((l) => ({ sku: l.sku, almoxarifado: l.almox, categoria_produto: l.categoria, data_movimento: l.data, entrada: 0, saida: 0, saldo_sistema: l.sis, saldo_fisico: l.cont, divergencia: 0, valor_divergencia: 0, unidade: l.unidade, observacao_original: obsDe(l), status: "Historico_Resolvido", origem: "fechamento_inventario" })));
    const idDiv = new Map(divs.map((l, i) => [l, idsDiv[i]])), idHist = new Map(oks.map((l, i) => [l, idsHist[i]]));
    progresso?.("gravando os itens…");
    const idsItens = await inserirRetornandoIds("atlas_itens_fechamento", linhas.map((l) => { const rec = recorr.get(`${l.sku}|${l.almox}`) ?? 0; return { fechamento_id: f.id, sku: l.sku, descricao_produto: l.descricao, almoxarifado: l.almox, categoria_produto: l.categoria, qtd_sistema: l.sis, qtd_contagem: l.cont, divergencia_qtd: l.div, valor_estimado: l.valor, percentual_acuracia: l.pct, divergente: l.divergente, resumo_planilha: l.resumo, observacao_pos_inventario: l.obsPos, observacao_extra: l.obs2, recorrencias_anteriores: rec, destaque_recorrente: rec > 0, divergencia_id: idDiv.get(l) ?? null, movimentacao_historico_id: idHist.get(l) ?? null }; }));
    // ações de pós-inventário: abre para divergente com "obs pós inv"; fecha as pendentes de quem agora não divergiu
    const novas = linhas.map((l, i) => ({ l, item: idsItens[i] })).filter(({ l }) => l.divergente && l.obsPos).map(({ l, item }) => ({ item_fechamento_id: item, fechamento_id: f.id, sku: l.sku, descricao_produto: l.descricao, almoxarifado: l.almox, acao_descricao: l.obsPos, status: "Pendente", origem_automatica: true, criado_por: ctx.usuario, criado_em: new Date().toISOString() }));
    if (novas.length) await inserirRetornandoIds("atlas_acoes_pos_inventario", novas);
    const okChave = new Set(oks.map((l) => `${l.sku}|${l.almox}`));
    const pendentes = (await lerTudo<any>("atlas_acoes_pos_inventario", "id, sku, almoxarifado, observacao_conclusao", (q) => q.in("status", ["Pendente", "Em_Andamento"]))).filter((a) => okChave.has(`${a.sku}|${a.almoxarifado}`));
    for (const a of pendentes) await sb.from("atlas_acoes_pos_inventario").update({ status: "Concluida", concluido_em: new Date().toISOString(), observacao_conclusao: `${a.observacao_conclusao ?? ""} [Fechado automaticamente: sem divergência no fechamento de ${linhas[0].data}]`.trim() }).eq("id", a.id);
    const valorTotal = r2(divs.reduce((s, l) => s + Math.abs(l.valor), 0));
    await sb.from("atlas_fechamentos_inventario").update({ total_itens: linhas.length, total_divergentes: divs.length, valor_total_divergente: valorTotal }).eq("id", f.id);
    await logAtlas(ctx.usuario, "importar_fechamento_inventario", { arquivo, total: linhas.length, divergentes: divs.length }, f.id);
    let investigadas = 0;
    for (let i = 0; i < idsDiv.length; i += 300) {
      const lote = idsDiv.slice(i, i + 300);
      const r = await investigarLote((q) => q.in("id", lote), ctx.usuario, (a, t) => progresso?.(`investigando ${i + a}/${idsDiv.length}…`));
      investigadas += r.ok;
    }
    return { fechamentoId: f.id, almoxarifado: linhas[0].almox, data: linhas[0].data, total: linhas.length, divergentes: divs.length, valor: valorTotal, acoesCriadas: novas.length, acoesFechadas: pendentes.length, investigadas, erros };
  } catch (e) {
    await excluirFechamento(f.id, ctx.usuario).catch(() => undefined);   // não deixa meio fechamento
    throw e;
  }
}

/** Remove o fechamento e tudo que ele gerou (itens, divergências, histórico, ações e ciências). */
export async function excluirFechamento(id: number, usuario: string) {
  const itens = await lerTudo<any>("atlas_itens_fechamento", "id, divergencia_id, movimentacao_historico_id", (q) => q.eq("fechamento_id", id));
  const divs = itens.map((i) => i.divergencia_id).filter(Boolean), hist = itens.map((i) => i.movimentacao_historico_id).filter(Boolean);
  await sb.from("atlas_acoes_pos_inventario").delete().eq("fechamento_id", id);
  await sb.from("atlas_conciliacoes_ciencia").delete().eq("fechamento_id", id);
  await sb.from("atlas_itens_fechamento").delete().eq("fechamento_id", id);
  for (let i = 0; i < divs.length; i += 300) { await sb.from("atlas_casos_ml_feedback").delete().in("divergencia_id", divs.slice(i, i + 300)); await sb.from("atlas_divergencias").delete().in("id", divs.slice(i, i + 300)); }
  for (let i = 0; i < hist.length; i += 300) await sb.from("atlas_movimentacoes_historico").delete().in("id", hist.slice(i, i + 300));
  const { data: f } = await sb.from("atlas_fechamentos_inventario").select("arquivo_origem").eq("id", id).maybeSingle();
  const { error } = await sb.from("atlas_fechamentos_inventario").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAtlas(usuario, "excluir_fechamento_inventario", { arquivo: f?.arquivo_origem, itens_removidos: itens.length, divergencias_removidas: divs.length }, id);
  return { itens: itens.length, divergencias: divs.length };
}

/** Corrige o almoxarifado do fechamento inteiro (itens, divergências e histórico ligados a ele). */
export async function corrigirAlmoxarifado(id: number, novo: string, usuario: string) {
  const { data: f } = await sb.from("atlas_fechamentos_inventario").select("almoxarifado").eq("id", id).single();
  const itens = await lerTudo<any>("atlas_itens_fechamento", "id, divergencia_id, movimentacao_historico_id", (q) => q.eq("fechamento_id", id));
  await sb.from("atlas_fechamentos_inventario").update({ almoxarifado: novo }).eq("id", id);
  await sb.from("atlas_itens_fechamento").update({ almoxarifado: novo }).eq("fechamento_id", id);
  const divs = itens.map((i) => i.divergencia_id).filter(Boolean), hist = itens.map((i) => i.movimentacao_historico_id).filter(Boolean);
  for (let i = 0; i < divs.length; i += 300) await sb.from("atlas_divergencias").update({ almoxarifado: novo }).in("id", divs.slice(i, i + 300));
  for (let i = 0; i < hist.length; i += 300) await sb.from("atlas_movimentacoes_historico").update({ almoxarifado: novo }).in("id", hist.slice(i, i + 300));
  await logAtlas(usuario, "corrigir_almoxarifado_fechamento", { de: f?.almoxarifado, para: novo, itens_afetados: itens.length }, id);
  return itens.length;
}

// ---------- resumo e assinaturas ----------
export type ItemF = { id: number; sku: string; descricao_produto: string | null; almoxarifado: string; categoria_produto: string | null; qtd_sistema: number; qtd_contagem: number; divergencia_qtd: number; valor_estimado: number; percentual_acuracia: number | null; divergente: boolean; resumo_planilha: string | null; observacao_pos_inventario: string | null; recorrencias_anteriores: number; destaque_recorrente: boolean; divergencia_id: number | null };

export function resumoFechamento(itens: ItemF[], custos: Map<string, number>) {
  const total = itens.length, div = itens.filter((i) => i.divergente);
  const qs = itens.reduce((s, i) => s + Math.abs(Number(i.qtd_sistema) || 0), 0), qd = div.reduce((s, i) => s + Math.abs(Number(i.divergencia_qtd) || 0), 0);
  const cc = itens.filter((i) => custos.has(i.sku));
  const port = cc.reduce((s, i) => s + (Number(i.qtd_sistema) || 0) * custos.get(i.sku)!, 0), vd = cc.filter((i) => i.divergente).reduce((s, i) => s + Math.abs(Number(i.divergencia_qtd) || 0) * custos.get(i.sku)!, 0);
  const falta = div.filter((i) => Number(i.divergencia_qtd) < 0), sobra = div.filter((i) => Number(i.divergencia_qtd) > 0);
  const vF = falta.reduce((s, i) => s + Math.abs(Number(i.valor_estimado) || 0), 0), vS = sobra.reduce((s, i) => s + Math.abs(Number(i.valor_estimado) || 0), 0);
  return { total_itens: total, total_divergentes: div.length, item_a_item_pct: total ? r2(((total - div.length) / total) * 100) : null, iaq_pct: qs ? r2((1 - qd / qs) * 100) : null, iap_pct: port ? r2((1 - vd / port) * 100) : null, cobertura_custo_pct: total ? r2((cc.length / total) * 100) : null, valor_falta: r2(vF), valor_sobra: r2(vS), resultado_liquido: r2(vS - vF), itens_com_falta: falta.length, itens_com_sobra: sobra.length };
}

export function statusAssinatura(papeis: (string | null)[]) {
  const assinados = new Set(papeis.filter(Boolean) as string[]);
  const faltantes = Object.entries(PAPEIS_ASSINATURA).filter(([c]) => !assinados.has(c)).map(([, n]) => n);
  return { fechado: faltantes.length === 0, assinados: Object.entries(PAPEIS_ASSINATURA).filter(([c]) => assinados.has(c)).map(([, n]) => n), faltantes };
}

/** Registra a ciência de um papel, com o retrato dos itens divergentes e do resumo de acurácia naquele momento. */
export async function assinarCiencia(fechamentoId: number, papel: string, observacao: string | null, itens: ItemF[], custos: Map<string, number>, assinante: { login: string; nome: string }) {
  if (!PAPEIS_ASSINATURA[papel]) throw new Error("Papel de assinatura inválido.");
  const div = itens.filter((i) => i.divergente);
  const snapshot = div.map((i) => ({ sku: i.sku, descricao: i.descricao_produto, almoxarifado: i.almoxarifado, qtd_sistema: i.qtd_sistema, qtd_contagem: i.qtd_contagem, divergencia_qtd: i.divergencia_qtd, valor_estimado: i.valor_estimado }));
  const valor = r2(div.reduce((s, i) => s + Math.abs(Number(i.valor_estimado) || 0), 0));
  const { data, error } = await sb.from("atlas_conciliacoes_ciencia").insert({ fechamento_id: fechamentoId, gestor_username: assinante.login, gestor_nome: assinante.nome, data_assinatura: new Date().toISOString(), papel_assinatura: papel, observacao, itens_divergentes_snapshot: snapshot, total_itens_divergentes: div.length, valor_total_divergente: valor, resumo_acuracia_snapshot: resumoFechamento(itens, custos) }).select("*").single();
  if (error) throw new Error("Não consegui registrar a assinatura: " + error.message);
  await logAtlas(assinante.nome, "gerar_ciencia_conciliacao", { total_itens_divergentes: div.length, valor_total: valor, papel_assinatura: papel }, fechamentoId);
  return data;
}

// ---------- Pós-Inventário ----------
export const STATUS_ACAO = ["Pendente", "Em_Andamento", "Concluida", "Cancelada"] as const;

/** Conclui ações pendentes cujo SKU não divergiu em um fechamento posterior do mesmo almoxarifado. */
export async function reconciliarAcoes(usuario: string) {
  const [acoes, fech, itensOk] = await Promise.all([
    lerTudo<any>("atlas_acoes_pos_inventario", "id, sku, almoxarifado, fechamento_id, observacao_conclusao", (q) => q.in("status", ["Pendente", "Em_Andamento"])),
    lerTudo<any>("atlas_fechamentos_inventario", "id, data_fechamento"),
    lerTudo<any>("atlas_itens_fechamento", "sku, almoxarifado, fechamento_id", (q) => q.eq("divergente", false)),
  ]);
  const dataF = new Map(fech.map((f: any) => [f.id, String(f.data_fechamento ?? "").slice(0, 10)]));
  const ok = new Map<string, string[]>(); for (const i of itensOk) { const k = `${i.sku}|${i.almoxarifado}`; (ok.get(k) ?? ok.set(k, []).get(k)!).push(dataF.get(i.fechamento_id) ?? ""); }
  let resolvidas = 0;
  for (const a of acoes) {
    const origem = dataF.get(a.fechamento_id) ?? "";
    if ((ok.get(`${a.sku}|${a.almoxarifado}`) ?? []).some((d) => d && (!origem || d > origem))) {
      await sb.from("atlas_acoes_pos_inventario").update({ status: "Concluida", concluido_em: new Date().toISOString(), observacao_conclusao: `${a.observacao_conclusao ?? ""} [Fechado automaticamente: item não divergiu em fechamento posterior]`.trim() }).eq("id", a.id);
      resolvidas++;
    }
  }
  await logAtlas(usuario, "reconciliar_acoes_pos_inventario", { verificadas: acoes.length, resolvidas });
  return { verificadas: acoes.length, resolvidas };
}
