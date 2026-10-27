// MBR — carga das fontes das Seções 1, 3 e 4 direto do banco do Stock Savvy (mesmas tabelas/views/RPCs das telas).
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "../fetch-all";
import { carregarPassivos } from "../atlas-passivos";
import { carregarEstruturaBOM, situacaoEstrutura } from "../ft-arvore";
import { FAIXAS_DEFAULT } from "../dispersao";
import type { BaixaCalc } from "../shelf-life";
import {
  aplicarJustificativas, baixasOperacionais, controleFefo, dispersaoFicha, extrairMetas, farolShelf, fimDoMes, investimentoOperacional, lotesFarol, mesesAte, normSku,
  pacotesBaixa, recuperacaoShelf, resolvedorGrupoFefo, resolvedorGrupoObs, riscoObsolescencia, semMovimentacao, testesIndustriais,
  type BaixaRow, type CampanhaMbr, type CtxBaixas, type DadosFechamento, type DadosMetas,
} from "./dados3";

const sb = supabase as any;
export const CHAVE_METAS = "metas_individuais";
export const SKU_TESTE_INDUSTRIAL = "05104122";

/** Executa uma fonte; se falhar, registra o nome e devolve null (o slide mostra o aviso, o resto do MBR segue). */
async function seguro<T>(nome: string, falhas: string[], f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch (e) { console.error(`[MBR] ${nome}:`, e); falhas.push(nome); return null; }
}
const tudo = <T,>(tabela: string, colunas: string, filtro?: (q: any) => any, ordem: string[] = ["id"]) =>
  fetchAll<T>((de, ate) => { let q = sb.from(tabela).select(colunas); for (const o of ordem) q = q.order(o); q = q.range(de, ate); return filtro ? filtro(q) : q; }, 1_000_000);
const rpc = async <T,>(nome: string, args: Record<string, unknown>) => { const { data, error } = await sb.rpc(nome, args); if (error) throw error; return (data ?? []) as T[]; };

/** Metas: último .html de "Minhas metas" enviado na tela do MBR. */
export async function lerMetas(mes: string): Promise<DadosMetas | null> {
  const { data, error } = await sb.from("atlas_dashboards_externos").select("html_content, enviado_em").eq("chave", CHAVE_METAS).order("enviado_em", { ascending: false }).limit(1);
  if (error) throw error;
  const reg = data?.[0];
  if (!reg?.html_content || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(String(reg.html_content).replace(/<svg[\s\S]*?<\/svg>/gi, ""), "text/html");
  return extrairMetas(doc as any, mes, reg.enviado_em ? new Date(reg.enviado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null);
}
export async function salvarMetas(html: string, nomeArquivo: string, usuario: string | null) {
  await sb.from("atlas_dashboards_externos").delete().eq("chave", CHAVE_METAS);
  const { error } = await sb.from("atlas_dashboards_externos").insert({ chave: CHAVE_METAS, nome_exibicao: "Metas individuais", html_content: html, nome_arquivo_original: nomeArquivo, enviado_por: usuario, enviado_em: new Date().toISOString() });
  if (error) throw error;
}
export async function infoMetas(): Promise<{ arquivo: string | null; enviadoEm: string | null } | null> {
  const { data } = await sb.from("atlas_dashboards_externos").select("nome_arquivo_original, enviado_em").eq("chave", CHAVE_METAS).order("enviado_em", { ascending: false }).limit(1);
  return data?.[0] ? { arquivo: data[0].nome_arquivo_original, enviadoEm: data[0].enviado_em } : null;
}

export async function carregarRiscos(mes: string, hoje = new Date(), progresso?: (t: string) => void) {
  const falhas: string[] = [];
  const ano = mes.slice(0, 4), fim = fimDoMes(mes), ini12 = `${mesesAte(mes, 12)[0]}-01`, iniLeitura = ini12 < `${ano}-01-01` ? ini12 : `${ano}-01-01`;
  progresso?.("Lendo cadastros e baixas…");
  const [motivos, classifs, grupos, alertas, baixasBrutas] = await Promise.all([
    seguro("Motivos de baixa", falhas, () => tudo<any>("motivo_baixa", "id, descricao")),
    seguro("Classificação de prejuízo", falhas, () => tudo<any>("motivo_classificacao_prejuizo", "motivo_baixa_id, classificacao", undefined, ["motivo_baixa_id"])),
    seguro("Grupos de produto", falhas, () => tudo<{ codigo_produto: string; grupo: string }>("grupo_produtos", "codigo_produto, grupo", undefined, ["codigo_produto"])),
    seguro("Parâmetros de alerta", falhas, () => tudo<any>("parametros_alerta_baixas", "escopo, chave, limite_valor, ativo", (q) => q.eq("ativo", true), ["escopo"])),
    seguro("Relatório de Baixa", falhas, () => tudo<any>("baixa_operacional", "id, codigo_produto, descricao, id_local, motivo_baixa_id, contexto_baixa, valor_total, quantidade, custo_unitario, lote, data_solicitacao, data_ocorrencia, status_fluxo, categoria", (q) => q.gte("data_solicitacao", `${iniLeitura}T00:00:00Z`))),
  ]);
  const motivoNome = new Map<string, string>((motivos ?? []).map((m: any) => [m.id, m.descricao]));
  const ctx: CtxBaixas = {
    motivoNome, classif: new Map((classifs ?? []).map((c: any) => [c.motivo_baixa_id, c.classificacao])),
    grupoDe: new Map((grupos ?? []).map((g) => [g.codigo_produto, g.grupo])),
    limSku: (alertas ?? []).find((a: any) => a.escopo === "SKU" && !a.chave)?.limite_valor ?? Infinity,
  };
  const baixas = (baixasBrutas ?? []).map((b: any): BaixaRow => ({ ...b, valor_total: Number(b.valor_total) || 0, quantidade: Number(b.quantidade) || 0 }));
  const okBaixas = baixasBrutas != null && motivos != null;

  progresso?.("Calculando passivos, validade e estoque parado…");
  const grupoUpper = new Map((grupos ?? []).map((g) => [String(g.codigo_produto ?? "").trim().toUpperCase(), g.grupo]));
  const inicio90 = new Date(hoje.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [pacotes, lotes, saidas, obsRows] = await Promise.all([
    seguro("Mapeamento de Passivos", falhas, async () => {
      const [D, hip, alm] = await Promise.all([carregarPassivos(), tudo<any>("atlas_hipoteses", "codigo, nome", undefined, ["codigo"]), tudo<any>("atlas_almoxarifados", "codigo, nome_exibicao", undefined, ["codigo"])]);
      return pacotesBaixa(D, mes, { hipotese: new Map(hip.map((h: any) => [h.codigo, h.nome || h.codigo])), almox: new Map(alm.map((a: any) => [a.codigo, a.nome_exibicao || a.codigo])) });
    }),
    seguro("Farol de Shelf-Life", falhas, () => tudo<any>("estoque_sistemico", "id, id_produto, descricao, lote, quantidade, custo_unitario, origem, data_validade", (q) => q.gt("quantidade", 0))),
    seguro("Giro do Controle de Movimentados", falhas, () => tudo<any>("atlas_movimentacoes_historico", "id, sku, saida", (q) => q.eq("origem", "movimentacao").gte("data_movimento", inicio90))),
    seguro("Risco de Obsolescência", falhas, () => tudo<any>("v_risco_obsoletos", "id_produto, descricao, almoxarifado, lote, valor, faixa", (q) => q.neq("faixa", "movimentado"), ["id_produto", "almoxarifado", "lote"])),
  ]);
  const lf = lotes ? lotesFarol(lotes, grupoUpper, hoje) : null;
  const giro = new Map<string, number>();
  for (const m of saidas ?? []) giro.set(normSku(m.sku), (giro.get(normSku(m.sku)) ?? 0) + (Number(m.saida) || 0));

  progresso?.("Lendo recuperação de shelf, dispersão, testes e FEFO…");
  const iniDisp = `${mesesAte(mes, 6)[0]}-01`;
  const [tipos, campanhas, param, impacto, bloqueados, estrutura, testes, fefo, justs] = await Promise.all([
    seguro("Tipos de ação de lote", falhas, () => tudo<any>("tipos_acao_shelf_life", "id, nome, categoria", undefined, ["ordem"])),
    seguro("Ações de lote", falhas, () => tudo<any>("campanhas_lote", "*")),
    seguro("Parâmetros de dispersão", falhas, async () => (await sb.from("parametros_dispersao").select("*").maybeSingle()).data),
    seguro("Dispersão de Lote", falhas, () => tudo<any>("v_impacto_consumo", "id, numero_op, material, desc_material, sku_produto_final, qtd_consumo, qtd_previsto, qtd_dif, impacto_rs, tem_furo, dt_producao", (q) => q.gte("dt_producao", iniDisp).lte("dt_producao", `${fim}T23:59:59`))),
    seguro("Materiais bloqueados", falhas, () => tudo<any>("materiais_bloqueados_ficha_tecnica", "id_item", undefined, ["id_item"])),
    seguro("Ficha Técnica", falhas, () => carregarEstruturaBOM()),
    seguro("Testes Industriais", falhas, () => tudo<any>("v_teste_industrial_consumo", "id, ano_mes, numero_op, material, desc_material, qtd_consumo, custo_unit_medio", (q) => q.eq("sku_produto_final", SKU_TESTE_INDUSTRIAL).eq("ano_mes", mes))),
    seguro("Controle de FEFO", falhas, () => tudo<any>("checagens_fefo", "id, data, id_produto, descricao, destino, doc, lote_movimentado, quebra, status", (q) => q.gte("data", `${mesesAte(mes, 2)[0]}-01`).lte("data", fim))),
    seguro("Justificativas de FEFO", falhas, () => tudo<any>("checagens_fefo_justificativas", "id, data, id_produto, doc, lote_movimentado, destino")),
  ]);

  progresso?.("Lendo o Fechamento Mensal…");
  const intervalo = { data_inicio: `${mes}-01`, data_fim: fim };
  const fechamento = await seguro("Fechamento Mensal", falhas, async (): Promise<DadosFechamento> => {
    const [resumo, topBaixas, topGeral, topLote, pnl] = await Promise.all([
      rpc<any>("fechamento_mensal_resumo", intervalo), rpc<any>("fechamento_top10_baixas", intervalo), rpc<any>("fechamento_top10_geral", intervalo),
      rpc<any>("fechamento_top10_lote", intervalo), rpc<any>("fechamento_pnl_shelf_life", intervalo).catch(() => []),
    ]);
    const n = (x: any) => Number(x ?? 0);
    return {
      inicio: intervalo.data_inicio, fim,
      resumo: resumo.map((r: any) => ({ ...r, ordem: n(r.ordem), acoes_criadas: n(r.acoes_criadas), acoes_concluidas: n(r.acoes_concluidas), acoes_em_aberto: n(r.acoes_em_aberto), valor_ou_quantidade: n(r.valor_ou_quantidade) })),
      topBaixas, topGeral, topLote, pnl: pnl[0] ? { ...pnl[0], perda_real: n(pnl[0].perda_real) } : null,
    };
  });
  const metas = await seguro("Metas Individuais", falhas, () => lerMetas(mes));

  // ---------- cálculos ----------
  const tiposPorId = new Map((tipos ?? []).map((t: any) => [t.id, t]));
  const camp: CampanhaMbr[] = (campanhas ?? []).map((c: any) => { const t: any = c.tipo_acao_id ? tiposPorId.get(c.tipo_acao_id) : undefined; return { ...c, tipo_nome: t?.nome ?? null, categoria: t?.categoria ?? "SAVING" }; });
  const bxCalc: BaixaCalc[] = baixas.map((b) => ({ id: b.id, codigo_produto: String(b.codigo_produto ?? ""), descricao: b.descricao, lote: b.lote, quantidade: b.quantidade, valor_total: b.valor_total, custo_unitario: Number(b.custo_unitario) || 0, data: String(b.data_ocorrencia ?? b.data_solicitacao ?? "").slice(0, 10), motivo_nome: b.motivo_baixa_id ? motivoNome.get(b.motivo_baixa_id) ?? null : null }));
  const faixas = param ? { atencao: Number(param.limite_atencao_pct), critico: Number(param.limite_critico_pct) } : FAIXAS_DEFAULT;
  return {
    falhas,
    baixas: okBaixas ? baixasOperacionais(baixas, ctx, mes) : null,
    investimento: okBaixas ? investimentoOperacional(baixas, ctx, mes) : null,
    pacotes,
    farol: lf ? farolShelf(lf) : null,
    obsolescencia: lf && saidas ? riscoObsolescencia(lf, giro) : null,
    semMov: obsRows && grupos ? semMovimentacao(obsRows, resolvedorGrupoObs(grupos)) : null,
    recuperacao: okBaixas && campanhas && tipos ? recuperacaoShelf(bxCalc, camp, new Set((tipos ?? []).map((t: any) => t.nome)), mes) : null,
    dispersao: impacto && estrutura ? dispersaoFicha(impacto, { faixas, limFreq: Number(param?.limite_freq_ops ?? 5), bloqueados: new Set((bloqueados ?? []).map((b: any) => String(b.id_item).trim().toUpperCase())), estrutura: (p, m) => situacaoEstrutura(estrutura, p, m) }, mes) : null,
    testes: testes ? testesIndustriais(testes, mes) : null,
    fefo: fefo && justs && grupos ? controleFefo(aplicarJustificativas(fefo, justs), resolvedorGrupoFefo(grupos), mes) : null,
    fechamento, metas,
  };
}
export type Riscos = Awaited<ReturnType<typeof carregarRiscos>>;
