// Mapeamento de Passivos do Atlas (baixas_operacionais_router.py → dashboard/*), em TypeScript.
// Passivos = baixas APROVADAS do Relatório de Baixa (agora lidas direto do Stock Savvy, com o vínculo histórico do Atlas);
// Resultado de Inventário = ajustes oficiais que contam como ajuste de inventário (Entradas − Saídas).
import { ALMOX_SS_PARA_ATLAS, MOTIVO_PARA_HIPOTESE, lerTudo } from "./atlas-investigacao";

export type BaixaP = { id: string; sku: string | null; almoxarifado: string | null; motivo: string; status: string; quantidade: number; valor: number; data: string | null; vinculada: number | null };
export type AjusteP = { id: number; sku: string | null; descricao: string | null; almoxarifado: string | null; data: string | null; ajuste_qtd: number; valor: number; id_lote: string | null; qtd_sistema: number | null; qtd_contagem: number | null };
export type DivP = { id: number; sku: string; almoxarifado: string; data: string | null; origem: string | null; status: string; hipotese: string | null; valor: number };
export type DadosPassivos = { baixas: BaixaP[]; ajustes: AjusteP[]; divs: DivP[]; descricoes: Map<string, string> };
export type Filtro = { ano: number | null; mes: number | null; inicio: string | null; fim: string | null; almox: string | null; motivos: string[] };

export const CATEGORIAS = {
  inventario_mensal: "Mapeada via Inventário Mensal",
  movimentacao_diaria: "Mapeada via Movimentação Diária",
  aguardando_divergencia: "Aprovada, aguardando divergência",
  nao_decidida: "Pendente/Reprovada (não decidida)",
} as const;
type Cat = keyof typeof CATEGORIAS;

const AJUSTE_PROCESSO = new Set(["Transferencia_Pendente", "Consumo_Parcial_OP", "Pendencia_Faturamento", "Erro_Operacional", "Erro_Cadastro", "Falha_Inventario", "Producao_Nao_Encerrada", "Ajuste_Manual_Incorreto", "Movimentacao_Duplicada", "Conversao_Unidade_Incorreta", "Erro_Fiscal", "Divergencia_Ficha_Tecnica", "Pedido_Compra_Pendente", "Sem_Divergencia_Real"]);
const PERDA_REAL = new Set(["Avaria_Perda", "Perda_Nao_Identificada"]);
const TOP_MOTIVOS = 6;
const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- carga ----------
export async function carregarPassivos(): Promise<DadosPassivos> {
  const [vivas, hist, ajustes, divs, prod] = await Promise.all([
    lerTudo<any>("baixa_operacional", "*").catch(() => [] as any[]),
    lerTudo<any>("atlas_baixas_operacionais", "origem_id, sku, almoxarifado, motivo_baixa_bruto, status_fluxo, quantidade, valor_total, data_baixa, divergencia_vinculada_id"),
    lerTudo<any>("atlas_ajustes_inventario_oficial", "id, sku, descricao_produto, almoxarifado, dt_invent, ajuste_qtd, valor_total, id_lote, qtd_sistema, qtd_contagem", (q) => q.eq("conta_como_ajuste_inventario", true)),
    lerTudo<any>("atlas_divergencias", "id, sku, almoxarifado, data_deteccao, origem, status, hipotese_confirmada, valor_estimado"),
    lerTudo<any>("atlas_produtos", "sku, descricao", undefined, "sku"),
  ]);
  const porId = new Map<string, BaixaP>();
  for (const h of hist) if (h.origem_id) porId.set(String(h.origem_id), { id: String(h.origem_id), sku: h.sku, almoxarifado: h.almoxarifado, motivo: h.motivo_baixa_bruto || "Não informado", status: h.status_fluxo, quantidade: Number(h.quantidade) || 0, valor: Number(h.valor_total) || 0, data: h.data_baixa ? String(h.data_baixa).slice(0, 10) : null, vinculada: h.divergencia_vinculada_id });
  // Relatório de Baixa do Stock Savvy (vivo) — mesmo de-para que o Atlas usava na sincronização
  for (const v of vivas) {
    const m = v.motivo_baixa_id ? MOTIVO_PARA_HIPOTESE[String(v.motivo_baixa_id)] : undefined;
    if (!m || !v.codigo_produto || !v.id_local) continue;
    const ant = porId.get(String(v.id));
    const valor = v.valor_total != null ? Number(v.valor_total) : (Number(v.quantidade) || 0) * (Number(v.custo_unitario) || 0);
    porId.set(String(v.id), { id: String(v.id), sku: String(v.codigo_produto), almoxarifado: ALMOX_SS_PARA_ATLAS[v.id_local] ?? `NAO_MAPEADO__${v.id_local}`, motivo: m[1], status: v.status_fluxo, quantidade: Number(v.quantidade) || 0, valor: Math.round(valor * 100) / 100, data: String(v.data_ocorrencia || v.data_solicitacao || "").slice(0, 10) || null, vinculada: ant?.vinculada ?? null });
  }
  return {
    baixas: [...porId.values()],
    ajustes: ajustes.filter((a: any) => a.ajuste_qtd).map((a: any) => ({ id: a.id, sku: a.sku, descricao: a.descricao_produto, almoxarifado: a.almoxarifado, data: a.dt_invent ? String(a.dt_invent).slice(0, 10) : null, ajuste_qtd: Number(a.ajuste_qtd), valor: Number(a.valor_total) || 0, id_lote: a.id_lote, qtd_sistema: a.qtd_sistema, qtd_contagem: a.qtd_contagem })),
    divs: divs.map((d: any) => ({ id: d.id, sku: d.sku, almoxarifado: d.almoxarifado, data: d.data_deteccao ? String(d.data_deteccao).slice(0, 10) : null, origem: d.origem, status: d.status, hipotese: d.hipotese_confirmada, valor: Number(d.valor_estimado) || 0 })),
    descricoes: new Map(prod.map((p: any) => [p.sku, p.descricao])),
  };
}

// ---------- filtros e categorias ----------
export function noPeriodo(d: string | null, f: Filtro): boolean {
  if (f.ano == null && f.mes == null && !f.inicio && !f.fim) return true;
  if (!d) return false;
  if (f.inicio && d < f.inicio) return false;
  if (f.fim && d > f.fim) return false;
  if (f.ano != null && Number(d.slice(0, 4)) !== f.ano) return false;
  if (f.mes != null && Number(d.slice(5, 7)) !== f.mes) return false;
  return true;
}
const baixasNoFiltro = (D: DadosPassivos, f: Filtro) => D.baixas.filter((b) => (!f.almox || b.almoxarifado === f.almox) && (!f.motivos.length || f.motivos.includes(b.motivo)) && noPeriodo(b.data, f));
const aprovadasNoFiltro = (D: DadosPassivos, f: Filtro) => baixasNoFiltro(D, f).filter((b) => b.status === "APROVADA");
const ajustesNoFiltro = (D: DadosPassivos, f: Filtro) => D.ajustes.filter((a) => (!f.almox || a.almoxarifado === f.almox) && noPeriodo(a.data, f));

/** Categoria de mapeamento da baixa (inclui a regra de 21/08: fechamento mensal do mesmo SKU+almox no mesmo mês conta como inventário). */
export function categorizador(D: DadosPassivos) {
  const divPorId = new Map(D.divs.map((d) => [d.id, d]));
  const fechamentos = new Set(D.divs.filter((d) => d.origem === "fechamento_inventario" && d.data).map((d) => `${d.sku}|${d.almoxarifado}|${d.data!.slice(0, 7)}`));
  return (b: BaixaP): Cat => {
    if (b.vinculada) return divPorId.get(b.vinculada)?.origem === "fechamento_inventario" ? "inventario_mensal" : "movimentacao_diaria";
    if (b.data && b.sku && b.almoxarifado && fechamentos.has(`${b.sku}|${b.almoxarifado}|${b.data.slice(0, 7)}`)) return "inventario_mensal";
    return b.status === "APROVADA" ? "aguardando_divergencia" : "nao_decidida";
  };
}

// ---------- indicadores ----------
export function resumoExecutivo(D: DadosPassivos, f: Filtro): { passivos: Passivos; inventario: Inventario; divergencias: DivResolvidas; texto: string } {
  const cat = categorizador(D);
  const todas = baixasNoFiltro(D, f); const aprovadas = todas.filter((b) => b.status === "APROVADA");
  const porCat = Object.fromEntries(Object.keys(CATEGORIAS).map((k) => [k, { quantidade: 0, valor: 0 }])) as Record<Cat, { quantidade: number; valor: number }>;
  for (const b of aprovadas) { const c = cat(b); porCat[c].quantidade++; porCat[c].valor += b.valor; }
  for (const v of Object.values(porCat)) v.valor = r2(v.valor);
  const passivos = { valor: r2(aprovadas.reduce((a, b) => a + b.valor, 0)), quantidade: aprovadas.length, total_no_filtro: todas.length, por_categoria: porCat };

  const aj = ajustesNoFiltro(D, f);
  const ent = aj.filter((a) => a.ajuste_qtd > 0), sai = aj.filter((a) => a.ajuste_qtd < 0);
  const entradas = r2(ent.reduce((s, a) => s + Math.abs(a.valor), 0)), saidas = r2(sai.reduce((s, a) => s + Math.abs(a.valor), 0));
  const inventario = { entradas_valor: entradas, saidas_valor: saidas, resultado_valor: r2(entradas - saidas), entradas_qtd: ent.length, saidas_qtd: sai.length };

  const resolvidas = D.divs.filter((d) => d.status === "Resolvida" && (!f.almox || d.almoxarifado === f.almox) && noPeriodo(d.data, f));
  const grupo = (l: DivP[]) => ({ quantidade: l.length, valor: r2(l.reduce((s, d) => s + d.valor, 0)) });
  const ap = resolvidas.filter((d) => d.hipotese && AJUSTE_PROCESSO.has(d.hipotese)), pr = resolvidas.filter((d) => d.hipotese && PERDA_REAL.has(d.hipotese));
  const ids = new Set([...ap, ...pr].map((d) => d.id));
  const divergencias = { ajuste_processo: grupo(ap), perda_real: grupo(pr), nao_classificado: grupo(resolvidas.filter((d) => !ids.has(d.id))) };
  return { passivos, inventario, divergencias, texto: narrar(passivos, inventario, divergencias, f) };
}

type Grupo = { quantidade: number; valor: number };
type Passivos = { valor: number; quantidade: number; total_no_filtro: number; por_categoria: Record<Cat, Grupo> };
type Inventario = { entradas_valor: number; saidas_valor: number; resultado_valor: number; entradas_qtd: number; saidas_qtd: number };
type DivResolvidas = { ajuste_processo: Grupo; perda_real: Grupo; nao_classificado: Grupo };
function narrar(p: Passivos, ri: Inventario, dr: DivResolvidas, f: Filtro): string {
  const filtro: string[] = [];
  if (f.inicio || f.fim) filtro.push(`entre ${f.inicio ?? "..."} e ${f.fim ?? "..."}`);
  else if (f.ano && f.mes) filtro.push(`em ${String(f.mes).padStart(2, "0")}/${f.ano}`);
  else if (f.ano) filtro.push(`no ano ${f.ano}`);
  else if (f.mes) filtro.push(`no mês ${String(f.mes).padStart(2, "0")} (todos os anos)`);
  if (f.almox) filtro.push(`almoxarifado ${f.almox}`);
  if (f.motivos.length) filtro.push(`motivo(s) ${f.motivos.join(", ")}`);
  const c = p.por_categoria;
  const partes = [
    `Recorte considerado: ${filtro.length ? filtro.join(" · ") : "todo o histórico, sem filtro"}.`,
    `Passivos: ${brl(p.valor)} aprovados em ${p.quantidade} baixa(s) operacional(is). Dessas, ${c.inventario_mensal.quantidade} já foram mapeadas via inventário mensal (${brl(c.inventario_mensal.valor)}), ${c.movimentacao_diaria.quantidade} via movimentação diária (${brl(c.movimentacao_diaria.valor)}), e ${c.aguardando_divergencia.quantidade} continuam aprovadas mas aguardando cruzamento com uma divergência (${brl(c.aguardando_divergencia.valor)}).`,
    `Resultado de Inventário Acumulado: Entradas ${brl(ri.entradas_valor)} − Saídas ${brl(ri.saidas_valor)} = ${brl(ri.resultado_valor)} (${ri.entradas_qtd} ajuste(s) de entrada, ${ri.saidas_qtd} de saída, neste recorte).`,
  ];
  if (ri.entradas_qtd + ri.saidas_qtd > 0) {
    const perda = -ri.resultado_valor; const dif = r2(perda - p.valor);
    if (Math.abs(dif) < 1) partes.push("O valor aprovado como baixa bate de perto com a perda física medida pelo inventário neste recorte.");
    else if (dif > 0) partes.push(`Atenção: a perda física medida pelo inventário (${brl(perda)}) é maior que o valor já aprovado como baixa operacional (${brl(p.valor)}) neste recorte — uma diferença de ${brl(dif)} de perda física ainda sem uma baixa operacional aprovada que a explique.`);
    else partes.push(`O valor aprovado como baixa operacional (${brl(p.valor)}) é maior que a perda física líquida medida pelo inventário (${brl(perda)}) neste recorte — diferença de ${brl(Math.abs(dif))}, possivelmente baixas de um período que o inventário físico deste recorte ainda não cobriu.`);
  } else partes.push("Não há ajuste de inventário oficial registrado nesse recorte pra comparar com o valor de baixa aprovado.");
  const tot = dr.ajuste_processo.quantidade + dr.perda_real.quantidade + dr.nao_classificado.quantidade;
  if (tot) partes.push(`Das divergências já resolvidas neste recorte (${tot} no total): ${dr.ajuste_processo.quantidade} (${brl(dr.ajuste_processo.valor)}) foram justificadas como AJUSTE DE PROCESSO — erro de cadastro, contagem, timing de nota fiscal/transferência, produção não encerrada etc. — ou seja, NÃO representam perda real de estoque; ${dr.perda_real.quantidade} (${brl(dr.perda_real.valor)}) foram confirmadas como PERDA REAL (avaria ou perda não identificada)${dr.nao_classificado.quantidade ? `; e ${dr.nao_classificado.quantidade} (${brl(dr.nao_classificado.valor)}) ficaram com hipótese não classificada nesse critério.` : "."}`);
  else partes.push("Nenhuma divergência resolvida encontrada nesse recorte até agora.");
  return partes.join("\n\n");
}

/** Motivos mês a mês (top 6 + Outros) e resumo por motivo — só aprovadas, sem o que já é inventário mensal. */
export function motivos(D: DadosPassivos, f: Filtro) {
  const cat = categorizador(D);
  const ap = aprovadasNoFiltro(D, f).filter((b) => cat(b) !== "inventario_mensal");
  const total = new Map<string, number>(), porMes = new Map<string, Map<string, number>>(), resumo = new Map<string, { quantidade: number; valor: number }>();
  for (const b of ap) {
    const r = resumo.get(b.motivo) ?? { quantidade: 0, valor: 0 }; r.quantidade++; r.valor += b.valor; resumo.set(b.motivo, r);
    if (!b.data) continue;
    total.set(b.motivo, (total.get(b.motivo) ?? 0) + b.valor);
    const m = porMes.get(b.data.slice(0, 7)) ?? new Map(); m.set(b.motivo, (m.get(b.motivo) ?? 0) + b.valor); porMes.set(b.data.slice(0, 7), m);
  }
  const ord = [...total.keys()].sort((a, b) => total.get(b)! - total.get(a)!);
  const top = ord.slice(0, TOP_MOTIVOS); const outros = ord.length > TOP_MOTIVOS;
  const serie = [...porMes.keys()].sort().map((mes) => {
    const m = porMes.get(mes)!; const linha: Record<string, number | string> = { mes };
    for (const mo of top) linha[mo] = r2(m.get(mo) ?? 0);
    if (outros) linha.Outros = r2(ord.slice(TOP_MOTIVOS).reduce((s, mo) => s + (m.get(mo) ?? 0), 0));
    return linha;
  });
  return { serie, chaves: [...top, ...(outros ? ["Outros"] : [])], agrupados: ord.slice(TOP_MOTIVOS), resumo: [...resumo].map(([motivo, v]) => ({ motivo, quantidade: v.quantidade, valor: r2(v.valor) })).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)) };
}

/** Evolução mensal: baixas aprovadas (operacional × inventário), taxa de resolução automática e fluxo de inventário. */
export function evolucao(D: DadosPassivos, f: Filtro) {
  const cat = categorizador(D);
  const pm = new Map<string, { quantidade: number; valor: number; resolvidas: number; inv: number; oper: number }>();
  for (const b of aprovadasNoFiltro(D, f)) {
    if (!b.data) continue;
    const k = b.data.slice(0, 7); const v = pm.get(k) ?? { quantidade: 0, valor: 0, resolvidas: 0, inv: 0, oper: 0 };
    v.quantidade++; v.valor += b.valor; if (b.vinculada) v.resolvidas++;
    if (cat(b) === "inventario_mensal") v.inv += b.valor; else v.oper += b.valor;
    pm.set(k, v);
  }
  const fl = new Map<string, { ent: number; sai: number }>();
  for (const a of ajustesNoFiltro(D, f)) { if (!a.data) continue; const k = a.data.slice(0, 7); const v = fl.get(k) ?? { ent: 0, sai: 0 }; if (a.ajuste_qtd > 0) v.ent += Math.abs(a.valor); else v.sai += Math.abs(a.valor); fl.set(k, v); }
  return [...new Set([...pm.keys(), ...fl.keys()])].sort().map((mes) => {
    const v = pm.get(mes) ?? { quantidade: 0, valor: 0, resolvidas: 0, inv: 0, oper: 0 }; const x = fl.get(mes) ?? { ent: 0, sai: 0 };
    return { mes, rotulo: `${mes.slice(5)}/${mes.slice(2, 4)}`, quantidade: v.quantidade, valor: r2(v.valor), valor_inventario: r2(v.inv), valor_operacional: r2(v.oper), taxa: v.quantidade ? Math.round((v.resolvidas / v.quantidade) * 1000) / 10 : null, entradas: r2(x.ent), saidas: r2(-x.sai), resultado: r2(x.ent - x.sai) };
  });
}

export function porAlmoxarifado(D: DadosPassivos, f: Filtro) {
  const pas = new Map<string, number>(), res = new Map<string, number>();
  for (const b of aprovadasNoFiltro(D, f)) pas.set(b.almoxarifado || "Não informado", (pas.get(b.almoxarifado || "Não informado") ?? 0) + b.valor);
  for (const a of ajustesNoFiltro(D, f)) res.set(a.almoxarifado || "Não informado", (res.get(a.almoxarifado || "Não informado") ?? 0) + a.valor);
  return [...new Set([...pas.keys(), ...res.keys()])].map((almox) => { const p = r2(pas.get(almox) ?? 0), r = r2(res.get(almox) ?? 0); return { almox, passivos: p, resultado: r, inventarioAbs: r2(Math.abs(r)), acumulado: r2(p + Math.abs(r)) }; }).sort((a, b) => b.acumulado - a.acumulado);
}

export function topSkus(D: DadosPassivos, f: Filtro, por: "quantidade" | "valor") {
  const m = new Map<string, { quantidade: number; valor: number }>();
  for (const b of aprovadasNoFiltro(D, f)) { if (!b.sku) continue; const v = m.get(b.sku) ?? { quantidade: 0, valor: 0 }; v.quantidade++; v.valor += b.valor; m.set(b.sku, v); }
  return [...m].map(([sku, v]) => ({ sku, descricao: D.descricoes.get(sku) ?? null, quantidade: v.quantidade, valor: r2(v.valor) })).sort((a, b) => b[por] - a[por]).slice(0, 10);
}

export function topMovimentos(D: DadosPassivos, f: Filtro) {
  const itens = [
    ...aprovadasNoFiltro(D, f).map((b) => ({ tipo: "Passivo" as const, sku: b.sku, descricao: b.sku ? D.descricoes.get(b.sku) ?? null : null, almox: b.almoxarifado, data: b.data, quantidade: b.quantidade, valor: r2(Math.abs(b.valor)), comSinal: r2(-Math.abs(b.valor)), detalhe: b.motivo })),
    ...ajustesNoFiltro(D, f).map((a) => ({ tipo: "Inventário" as const, sku: a.sku, descricao: a.descricao ?? (a.sku ? D.descricoes.get(a.sku) ?? null : null), almox: a.almoxarifado, data: a.data, quantidade: a.ajuste_qtd, valor: r2(Math.abs(a.valor)), comSinal: r2(a.valor), detalhe: a.ajuste_qtd > 0 ? "Entrada (sobra)" : "Saída (falta)" })),
  ];
  return itens.sort((a, b) => b.valor - a.valor).slice(0, 10);
}

export function opcoesFiltro(D: DadosPassivos) {
  const anos = [...new Set(D.baixas.map((b) => b.data?.slice(0, 4)).filter(Boolean) as string[])].map(Number).sort((a, b) => b - a);
  const almox = [...new Set(D.baixas.map((b) => b.almoxarifado).filter(Boolean) as string[])].sort();
  const motivos = [...new Set(D.baixas.map((b) => b.motivo).filter(Boolean))].sort();
  return { anos, almox, motivos };
}

/** Linhas para o Excel (mesmo recorte da tela). */
export function linhasExcel(D: DadosPassivos, f: Filtro) {
  const cat = categorizador(D);
  return {
    Passivos: baixasNoFiltro(D, f).map((b) => ({ Data: b.data, SKU: b.sku, Produto: b.sku ? D.descricoes.get(b.sku) ?? "" : "", Almoxarifado: b.almoxarifado, Motivo: b.motivo, Status: b.status, Quantidade: b.quantidade, "Valor (R$)": b.valor, Mapeamento: CATEGORIAS[cat(b)], "Divergência vinculada": b.vinculada ?? "" })),
    Inventario: ajustesNoFiltro(D, f).map((a) => ({ Data: a.data, SKU: a.sku, Produto: a.descricao ?? "", Almoxarifado: a.almoxarifado, Lote: a.id_lote ?? "", "Qtd sistema": a.qtd_sistema, "Qtd contagem": a.qtd_contagem, Ajuste: a.ajuste_qtd, "Valor (R$)": a.valor, Direção: a.ajuste_qtd > 0 ? "Entrada" : "Saída" })),
  };
}
