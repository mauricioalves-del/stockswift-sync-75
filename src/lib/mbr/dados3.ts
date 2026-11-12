// MBR — Seções 1, 3 e 4: KPIs calculados direto das tabelas do Stock Savvy, com a MESMA lógica das telas de cada
// dashboard (antes o MBR do Atlas lia o .html exportado de cada tela). Funções puras — a carga fica em fontes3.ts.
import { AJUSTE_PROCESSO, evolucao, porAlmoxarifado, resumoExecutivo, topSkus, type DadosPassivos, type Filtro } from "../atlas-passivos";
import { calcularIndicadores, cruzarBaixasComCampanhas, faixaDeRisco, valorRecuperadoCampanha, type BaixaCalc, type CampanhaCalc } from "../shelf-life";
import { indicadoresMetodologia } from "../shelf-life-financeiro";
import { classificar, percentualDispersao, type Faixas } from "../dispersao";
import { mesAnterior, r2 } from "./formato";

// ---------- datas ----------
export const fimDoMes = (mes: string) => { const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };
/** Os `n` meses terminando em `mes` (inclusive), em ordem. */
export function mesesAte(mes: string, n: number) { const out = [mes]; while (out.length < n) out.unshift(mesAnterior(out[0])); return out; }
/** Data local (AAAA-MM-DD) de um timestamp — igual ao filtro "De/Até" das telas que usam horário local. */
export function diaLocal(ts: string | null | undefined) {
  if (!ts) return "";
  const s = String(ts);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const soma = <T,>(l: T[], f: (x: T) => number) => l.reduce((s, x) => s + (f(x) || 0), 0);
const desc = <T,>(f: (x: T) => number) => (a: T, b: T) => f(b) - f(a);
const upper = (s: unknown) => String(s ?? "").trim().toUpperCase();

// ---------- Baixas (relatório de baixa do Stock Savvy) ----------
export type BaixaRow = {
  id: string; codigo_produto: string; descricao: string | null; id_local: string | null; motivo_baixa_id: string | null;
  contexto_baixa: string | null; valor_total: number; quantidade: number; custo_unitario: number | null; lote: string | null;
  data_solicitacao: string; data_ocorrencia: string | null; status_fluxo: string; categoria: string | null;
};
export type CtxBaixas = { motivoNome: Map<string, string>; classif: Map<string, string>; grupoDe: Map<string, string>; limSku: number };
/** Motivos tratados como investimento operacional — fora do prejuízo do Dashboard de Baixas. */
export const MOTIVOS_INVESTIMENTO = ["Cortesia", "Degustação", "Sensorial/Inovações", "Uso e Consumo"];
const nomeMotivo = (c: CtxBaixas, b: BaixaRow) => (b.motivo_baixa_id ? c.motivoNome.get(b.motivo_baixa_id) ?? null : null);
const vlr = (b: { valor_total: number }) => Number(b.valor_total) || 0;

/** Dashboard Baixas Operacionais (baixas.dashboard): aprovadas no mês, sem os motivos de investimento. */
export function baixasOperacionais(rows: BaixaRow[], c: CtxBaixas, mes: string) {
  const excl = new Set(MOTIVOS_INVESTIMENTO);
  const aprov = rows.filter((b) => b.status_fluxo === "APROVADA" && !excl.has(nomeMotivo(c, b) ?? ""));
  const doMes = aprov.filter((b) => String(b.data_solicitacao).slice(0, 7) === mes);
  const total = r2(soma(doMes, vlr));
  const porMotivo = new Map<string, number>(), porSetor = new Map<string, number>(), porGrupo = new Map<string, number>();
  const porSku = new Map<string, { codigo: string; descricao: string; total: number; motivos: Map<string, number> }>();
  for (const b of doMes) {
    const v = vlr(b);
    if (b.motivo_baixa_id) porMotivo.set(b.motivo_baixa_id, (porMotivo.get(b.motivo_baixa_id) ?? 0) + v);
    const setor = b.id_local || "—"; porSetor.set(setor, (porSetor.get(setor) ?? 0) + v);
    const g = c.grupoDe.get(b.codigo_produto) || b.categoria || "Sem grupo"; porGrupo.set(g, (porGrupo.get(g) ?? 0) + v);
    const s = porSku.get(b.codigo_produto) ?? { codigo: b.codigo_produto, descricao: b.descricao ?? "", total: 0, motivos: new Map() };
    s.total += v; if (b.motivo_baixa_id) s.motivos.set(b.motivo_baixa_id, (s.motivos.get(b.motivo_baixa_id) ?? 0) + v);
    porSku.set(b.codigo_produto, s);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const destaque = [...porMotivo].filter(([id]) => c.classif.get(id) === "Operacional").sort((a, b) => b[1] - a[1])[0];
  const totMot = soma([...porMotivo.values()], (x) => x) || 1;
  const rankingSku = [...porSku.values()].map((s) => {
    const mt = top(s.motivos), cls = mt ? c.classif.get(mt) : undefined;
    return { sku: s.codigo, descricao: s.descricao, total: r2(s.total), classif: s.total > c.limSku || cls === "Operacional" ? "Investigar" : "Controlado" };
  }).sort(desc((x) => x.total)).slice(0, 10);
  const tabelaMotivo = [...porMotivo].map(([id, v]) => ({ motivo: c.motivoNome.get(id) ?? "—", total: r2(v), pct: (v / totMot) * 100, classif: c.classif.get(id) ?? null })).sort(desc((x) => x.total));
  // Tendência mensal por motivo (12 meses até o mês do relatório, a partir do 1º mês com baixa)
  const janela = mesesAte(mes, 12), naJanela = aprov.filter((b) => janela.includes(String(b.data_solicitacao).slice(0, 7)));
  const primeiro = janela.find((m) => naJanela.some((b) => String(b.data_solicitacao).startsWith(m)));
  const meses = primeiro ? janela.slice(janela.indexOf(primeiro)) : [];
  const porMesMot = new Map<string, Map<string, number>>(), totMotivo = new Map<string, number>();
  for (const b of naJanela) {
    const nome = nomeMotivo(c, b) ?? "Sem motivo", k = String(b.data_solicitacao).slice(0, 7), v = vlr(b);
    const m = porMesMot.get(k) ?? new Map(); m.set(nome, (m.get(nome) ?? 0) + v); porMesMot.set(k, m);
    totMotivo.set(nome, (totMotivo.get(nome) ?? 0) + v);
  }
  const series = [...totMotivo].sort((a, b) => b[1] - a[1]).map(([nome]) => ({ nome, valores: meses.map((m) => r2(porMesMot.get(m)?.get(nome) ?? 0)) }));
  // acumulado do ano (janeiro até o mês do relatório) e mês anterior
  const ano = mes.slice(0, 4);
  const doAno = aprov.filter((b) => { const m = String(b.data_solicitacao).slice(0, 7); return m.startsWith(ano) && m <= mes; });
  const mesAnt = mesesAte(mes, 2)[0];
  const totalMesAnterior = r2(soma(aprov.filter((b) => String(b.data_solicitacao).slice(0, 7) === mesAnt), vlr));
  return {
    total, quantidade: doMes.length, acumuladoAno: r2(soma(doAno, vlr)), quantidadeAno: doAno.length, totalMesAnterior,
    motivoDestaque: destaque ? c.motivoNome.get(destaque[0]) ?? "—" : null,
    pctDestaque: destaque && total > 0 ? (destaque[1] / total) * 100 : null,
    setorTop: top(porSetor), grupoTop: top(porGrupo), rankingSku, tabelaMotivo, meses, series,
  };
}
export type DadosBaixas = ReturnType<typeof baixasOperacionais>;

/** Investimento Operacional (baixas.investimento-operacional): Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo,
 *  todas as baixas não reprovadas de janeiro até o fim do mês do relatório. */
export function investimentoOperacional(rows: BaixaRow[], c: CtxBaixas, mes: string) {
  const ini = `${mes.slice(0, 4)}-01-01`, fim = fimDoMes(mes);
  const linhas = rows.filter((b) => b.status_fluxo !== "REPROVADA").map((b) => ({ ...b, motivo: nomeMotivo(c, b) ?? "" }))
    .filter((b) => MOTIVOS_INVESTIMENTO.includes(b.motivo)).filter((b) => { const d = diaLocal(b.data_solicitacao); return d >= ini && d <= fim; });
  const porMotivo = MOTIVOS_INVESTIMENTO.map((nome) => { const l = linhas.filter((b) => b.motivo === nome); return { nome, valor: r2(soma(l, vlr)), qtd: l.length }; });
  const mesesTodos = [...new Set(linhas.map((b) => String(b.data_solicitacao).slice(0, 7)))].sort(), meses = mesesTodos.slice(-6);
  const serie = MOTIVOS_INVESTIMENTO.map((nome) => ({ nome, valores: meses.map((m) => r2(soma(linhas.filter((b) => b.motivo === nome && String(b.data_solicitacao).startsWith(m)), vlr))) }));
  const agrupar = (motivo: string) => {
    const por = (campo: (b: (typeof linhas)[number]) => string | null) => {
      const g = new Map<string, number>();
      for (const b of linhas.filter((x) => x.motivo === motivo)) { const k = campo(b) || "Não informado"; g.set(k, (g.get(k) ?? 0) + vlr(b)); }
      return [...g].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort(desc((x) => x.valor));
    };
    const ctx = por((b) => b.contexto_baixa);
    if (ctx.length > 1) return { campo: "contexto" as const, grupos: ctx };
    const alm = por((b) => b.id_local);
    return alm.length > 1 ? { campo: "almox" as const, grupos: alm } : { campo: "contexto" as const, grupos: ctx };
  };
  const tops = Object.fromEntries(MOTIVOS_INVESTIMENTO.map((nome) => {
    const m = new Map<string, { sku: string; descricao: string; valor: number }>();
    for (const b of linhas.filter((x) => x.motivo === nome)) { const e = m.get(b.codigo_produto) ?? { sku: b.codigo_produto, descricao: b.descricao ?? "", valor: 0 }; e.valor += vlr(b); m.set(b.codigo_produto, e); }
    return [nome, [...m.values()].sort(desc((x) => x.valor)).slice(0, 3)];
  })) as Record<string, { sku: string; descricao: string; valor: number }[]>;
  return { inicio: ini, fim, total: r2(soma(linhas, vlr)), qtd: linhas.length, porMotivo, meses, serie, rosca: agrupar("Cortesia"), funil: agrupar("Degustação"), tops };
}
export type DadosInvestimento = ReturnType<typeof investimentoOperacional>;

// ---------- Controle de Pacotes de Baixa (Mapeamento de Passivos, atlas-passivos) ----------
export type Rotulos = { hipotese: Map<string, string>; almox: Map<string, string> };
/** Janela acumulada desde julho (padronização da baixa fiscal) até o fim do mês, + evolução MoM desde janeiro. */
export function pacotesBaixa(D: DadosPassivos, mes: string, rot: Rotulos) {
  const ano = mes.slice(0, 4), fim = fimDoMes(mes);
  const fAcum: Filtro = { ano: null, mes: null, inicio: `${ano}-07-01`, fim, almox: null, motivos: [] };
  const fMes: Filtro = { ano: Number(ano), mes: Number(mes.slice(5, 7)), inicio: null, fim: null, almox: null, motivos: [] };
  const acum = resumoExecutivo(D, fAcum), doMes = resumoExecutivo(D, fMes);
  const todas = evolucao(D, { ano: null, mes: null, inicio: null, fim: null, almox: null, motivos: [] }).filter((p) => p.mes <= mes);
  const evol = todas.filter((p) => p.mes >= `${ano}-01`);
  const fech = [...evol].reverse().find((p) => p.entradas || p.saidas) ?? evol.at(-1) ?? null;
  const resultadoAcum = acum.inventario.resultado_valor;
  const diferenca = r2(Math.abs(resultadoAcum) - acum.passivos.valor);
  const justificativas = D.divs.filter((d) => d.status === "Resolvida" && d.hipotese && AJUSTE_PROCESSO.has(d.hipotese) && d.data && d.data >= fAcum.inicio! && d.data <= fim)
    .sort(desc((d) => d.valor)).slice(0, 10)
    .map((d) => ({ sku: d.sku, almox: rot.almox.get(d.almoxarifado) ?? d.almoxarifado ?? "—", justificativa: (d.hipotese && rot.hipotese.get(d.hipotese)) ?? d.hipotese ?? "—", valor: r2(d.valor) }));
  return {
    inicio: fAcum.inicio!, fim,
    passivosAcum: acum.passivos, inventarioAcum: acum.inventario, ajusteProcesso: acum.divergencias.ajuste_processo, diferenca,
    passivosMes: doMes.passivos, resultadoMes: doMes.inventario,
    evolucao: evol, mesFechamento: fech?.mes ?? null, resultadoFechamento: fech?.resultado ?? 0, passivoFechamento: fech?.valor ?? 0,
    /** variação dos passivos aprovados vs. o mês anterior (série completa, como no Atlas) */
    variacaoPassivos: todas.length >= 2 ? r2(todas.at(-1)!.valor - todas.at(-2)!.valor) : null,
    porAlmox: porAlmoxarifado(D, fAcum).slice(0, 6), topBaixas: topSkus(D, fAcum, "valor").slice(0, 6), justificativas,
  };
}
export type DadosPacotes = ReturnType<typeof pacotesBaixa>;

// ---------- Farol de Shelf-Life (shelf-life.farol: estoque_sistemico com saldo, retrato do dia) ----------
export type LoteRow = { id_produto: string; descricao: string | null; lote: string | null; quantidade: number; custo_unitario: number; origem: string | null; data_validade: string | null };
export const STATUS_FAROL = ["Vencido", "Urgente", "Perigo", "Atenção"] as const;
export type StatusFarol = (typeof STATUS_FAROL)[number];
const STATUS_DA_FAIXA: Record<string, StatusFarol> = { VENCIDO: "Vencido", "30": "Urgente", "60": "Perigo", "90": "Atenção" };
export type LoteFarol = { sku: string; descricao: string; lote: string; almox: string; grupo: string | null; quantidade: number; valor: number; status: StatusFarol };

export function lotesFarol(rows: LoteRow[], grupoDe: Map<string, string>, hoje = new Date()): LoteFarol[] {
  const out: LoteFarol[] = [];
  for (const r of rows) {
    const qtd = Number(r.quantidade) || 0;
    if (qtd <= 0) continue;
    const st = STATUS_DA_FAIXA[faixaDeRisco(r.data_validade, hoje) ?? ""];
    if (!st) continue; // sem validade ou fora do radar (> 90 dias)
    out.push({ sku: String(r.id_produto ?? ""), descricao: String(r.descricao ?? ""), lote: String(r.lote ?? ""), almox: String(r.origem ?? ""), grupo: grupoDe.get(upper(r.id_produto)) ?? null, quantidade: qtd, valor: qtd * (Number(r.custo_unitario) || 0), status: st });
  }
  return out;
}
export function farolShelf(lotes: LoteFarol[]) {
  const por = (chave: (l: LoteFarol) => string) => {
    const m = new Map<string, Record<StatusFarol, number> & { nome: string; total: number }>();
    for (const l of lotes) { const k = chave(l); const e = m.get(k) ?? { nome: k, Vencido: 0, Urgente: 0, Perigo: 0, "Atenção": 0, total: 0 }; e[l.status] += l.valor; e.total += l.valor; m.set(k, e); }
    return [...m.values()].sort(desc((x) => x.total));
  };
  const status = Object.fromEntries(STATUS_FAROL.map((s) => {
    const l = lotes.filter((x) => x.status === s), m = new Map<string, { descricao: string; custo: number }>();
    for (const x of l) { const e = m.get(x.sku) ?? { descricao: x.descricao || x.sku, custo: 0 }; e.custo += x.valor; m.set(x.sku, e); }
    return [s, { qtd: l.length, valor: r2(soma(l, (x) => x.valor)), top: [...m.values()].sort(desc((x) => x.custo)).slice(0, 5) }];
  })) as Record<StatusFarol, { qtd: number; valor: number; top: { descricao: string; custo: number }[] }>;
  return { status, totalLotes: lotes.length, valorTotal: r2(soma(lotes, (x) => x.valor)), porAlmox: por((l) => l.almox || "—"), porGrupo: por((l) => l.grupo || "Sem grupo") };
}
export type DadosFarol = ReturnType<typeof farolShelf>;

/** Mapeamento de Risco por Obsolescência (regra do Atlas): lote em risco de validade cruzado com o giro (saídas do
 *  Controle de Movimentados) dos últimos 90 dias. Crítico = nenhuma saída; Atenção = saída menor que o saldo. */
const GRUPOS_FORA_SHELF = ["embalagem", "embalagens", "ativo imobilizado", "ativos imobilizados"];
export const normSku = (s: unknown) => upper(s).replace(/^0+(?=\d)/, "");
export function riscoObsolescencia(lotes: LoteFarol[], saidas90d: Map<string, number>) {
  const itens = lotes.filter((l) => !/box/i.test(l.almox) && !(l.grupo && GRUPOS_FORA_SHELF.includes(l.grupo.trim().toLowerCase())))
    .map((l) => { const giro = saidas90d.get(normSku(l.sku)) ?? 0; return { ...l, giro, classificacao: giro <= 0 ? "Crítico" : giro < l.quantidade ? "Atenção" : null }; })
    .filter((l) => l.classificacao);
  return { quantidadeItens: itens.length, valorTotal: r2(soma(itens, (x) => x.valor)), quantidadeCriticos: itens.filter((x) => x.classificacao === "Crítico").length };
}
export type DadosObsolescencia = ReturnType<typeof riscoObsolescencia>;

// ---------- Materiais sem movimentação (suprimentos.risco-obsoletos: v_risco_obsoletos) ----------
export type ObsRow = { id_produto: string; descricao: string | null; almoxarifado: string | null; lote: string | null; valor: number | null; faixa: string | null };
export const FAIXAS_PARADO = ["30-60", "61-90", "+90"] as const;
/** Grupos considerados por padrão na tela de Risco Obsoletos. */
export const GRUPOS_PADRAO_OBS = ["Produto Acabado", "Produto em Processo", "Embalagem", "Mercadoria de Revenda", "SubConjunto"];
/** Grupo do produto como na tela: código exato ou, para códigos numéricos, sem os zeros à esquerda. */
export function resolvedorGrupoObs(grupos: { codigo_produto: string; grupo: string }[]) {
  const exato = new Map<string, string>(), numerico = new Map<string, string>();
  for (const r of grupos) {
    const cod = String(r.codigo_produto ?? "").trim(); if (!cod) continue;
    exato.set(cod, r.grupo);
    const n = cod.replace(/^0+(?=\d)/, ""); if (/^\d+$/.test(n) && !numerico.has(n)) numerico.set(n, r.grupo);
  }
  return (id: string) => { const cod = String(id ?? "").trim(); return exato.get(cod) ?? (/^\d+$/.test(cod) ? numerico.get(cod.replace(/^0+(?=\d)/, "")) : undefined); };
}
export function semMovimentacao(rows: ObsRow[], grupoDe: (id: string) => string | undefined, grupos = GRUPOS_PADRAO_OBS) {
  const l = rows.filter((r) => (FAIXAS_PARADO as readonly string[]).includes(r.faixa ?? "")).map((r) => ({ ...r, grupo: grupoDe(r.id_produto) ?? null, v: Number(r.valor) || 0 }))
    .filter((r) => r.grupo && grupos.includes(r.grupo));
  const porFaixa = Object.fromEntries(FAIXAS_PARADO.map((f) => {
    const x = l.filter((r) => r.faixa === f);
    return [f, { qtd: x.length, valor: r2(soma(x, (r) => r.v)), itens: [...x].sort(desc((r) => r.v)).slice(0, 5).map((r) => ({ descricao: r.descricao || r.id_produto, valor: r.v })) }];
  })) as Record<(typeof FAIXAS_PARADO)[number], { qtd: number; valor: number; itens: { descricao: string; valor: number }[] }>;
  const por = (chave: (r: (typeof l)[number]) => string) => {
    const m = new Map<string, { nome: string; total: number } & Record<string, number | string>>();
    for (const r of l) { const k = chave(r); const e = m.get(k) ?? { nome: k, total: 0, "30-60": 0, "61-90": 0, "+90": 0 }; (e as any)[r.faixa!] += r.v; e.total += r.v; m.set(k, e); }
    return [...m.values()].sort(desc((x) => x.total)) as ({ nome: string; total: number } & Record<(typeof FAIXAS_PARADO)[number], number>)[];
  };
  // visibilidade item a item: maiores valores parados (todas as faixas)
  const itens = [...l].sort(desc((r) => r.v)).slice(0, 14).map((r) => ({ sku: r.id_produto, descricao: r.descricao || r.id_produto, almox: r.almoxarifado || "—", grupo: r.grupo ?? "—", faixa: r.faixa!, lote: r.lote ?? null, valor: r.v }));
  const porSku = new Map<string, { sku: string; descricao: string; valor: number; almox: Set<string> }>();
  for (const r of l) { const k = normSku(r.id_produto); const e = porSku.get(k) ?? { sku: r.id_produto, descricao: r.descricao || r.id_produto, valor: 0, almox: new Set<string>() }; e.valor += r.v; if (r.almoxarifado) e.almox.add(r.almoxarifado); porSku.set(k, e); }
  return { porFaixa, total: r2(soma(l, (r) => r.v)), qtd: l.length, porAlmox: por((r) => r.almoxarifado || "—"), porGrupo: por((r) => r.grupo!), itens,
    skus: [...porSku.values()].map((e) => ({ sku: e.sku, descricao: e.descricao, valor: r2(e.valor), almox: [...e.almox].join(", ") })) };
}
export type DadosSemMov = ReturnType<typeof semMovimentacao>;

// ---------- Recuperação de Shelf (shelf-life.dashboard: perda por vencimento × ações de lote) ----------
export type CampanhaMbr = CampanhaCalc & { categoria_financeira?: string | null; valor_recuperado?: number | null; saving_recuperado?: number | null };
/** Janeiro até o fim do mês do relatório (mesmo filtro De/Até da tela). */
export function recuperacaoShelf(baixas: BaixaCalc[], campanhas: CampanhaMbr[], motivosDeAcao: Set<string>, mes: string) {
  const ini = `${mes.slice(0, 4)}-01-01`, fim = fimDoMes(mes);
  const bx = baixas.filter((b) => b.data >= ini && b.data <= fim);
  const linhas = cruzarBaixasComCampanhas(bx, campanhas, motivosDeAcao);
  const periodo = campanhas.filter((c) => (c.data_acao ?? "") >= ini && (c.data_acao ?? "").slice(0, 10) <= fim);
  const ind = calcularIndicadores(linhas, periodo), met = indicadoresMetodologia(periodo as any, ind.perda);
  const concl = periodo.filter((c) => c.status === "CONCLUIDA");
  const m = new Map<string, { perda: number; receita: number; saving: number }>();
  const get = (k: string) => { let e = m.get(k); if (!e) { e = { perda: 0, receita: 0, saving: 0 }; m.set(k, e); } return e; };
  for (const l of linhas) if (l.baixa.data) get(l.baixa.data.slice(0, 7)).perda += l.perda;
  for (const c of concl) { const e = get((c.data_acao ?? "").slice(0, 7)); if (c.categoria === "RECEITA") e.receita += c.valor_estimado_recuperado || 0; else e.saving += c.valor_estimado_saving || 0; }
  const mensal = [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, v]) => ({ mes, ...v }));
  const rec = new Map<string, { nome: string; valor: number; acoes: Set<string>; qtd: number; custo: number; saving: number }>();
  for (const c of concl) {
    const e = rec.get(c.sku) ?? { nome: c.descricao || c.sku, valor: 0, acoes: new Set<string>(), qtd: 0, custo: 0, saving: 0 };
    e.valor += valorRecuperadoCampanha(c); e.custo += Number(c.custo_acao) || 0; e.saving += Number(c.valor_estimado_saving) || 0; e.qtd++;
    if (c.tipo_nome) e.acoes.add(c.tipo_nome); rec.set(c.sku, e);
  }
  const perd = new Map<string, { nome: string; valor: number; quantidade: number; ocorrencias: number; motivos: Set<string> }>();
  for (const l of linhas) {
    if (l.perda <= 0) continue;
    const e = perd.get(l.baixa.codigo_produto) ?? { nome: l.baixa.descricao || l.baixa.codigo_produto, valor: 0, quantidade: 0, ocorrencias: 0, motivos: new Set<string>() };
    e.valor += l.perda; e.quantidade += Number(l.baixa.quantidade) || 0; e.ocorrencias++; if (l.baixa.motivo_nome) e.motivos.add(l.baixa.motivo_nome); perd.set(l.baixa.codigo_produto, e);
  }
  return {
    inicio: ini, fim, receitaRecuperada: met.receitaRecuperada, perdaEvitada: met.perdaEvitada, perdaReal: met.perdaReal, savingRecuperado: met.savingRecuperado, perdaVencimento: r2(ind.perda), mensal,
    topRecuperados: [...rec.values()].map((e) => ({ ...e, acao: [...e.acoes].join(", ") || "—" })).sort(desc((x) => x.valor)).slice(0, 10),
    topPerda: [...perd.values()].map((e) => ({ ...e, motivo: [...e.motivos].join(", ") || "—" })).sort(desc((x) => x.valor)).slice(0, 10),
  };
}
export type DadosRecuperacao = ReturnType<typeof recuperacaoShelf>;

// ---------- Dispersão de Ficha Técnica (producao.dispersao: v_impacto_consumo) ----------
export type ImpactoRow = { numero_op: string; material: string; desc_material: string | null; sku_produto_final: string | null; qtd_consumo: number; qtd_previsto: number; qtd_dif: number; impacto_rs: number | null; tem_furo: boolean; dt_producao: string | null };
export type ParamDispersao = { faixas: Faixas; limFreq: number; bloqueados: Set<string>; estrutura: (produto: string | null, material: string) => string };
function dataProducao(d: string | null) {
  const s = d ? String(d).slice(0, 10) : ""; const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return p && Number(p[1]) >= 2000 && Number(p[1]) <= 2100 && Number(p[2]) >= 1 && Number(p[2]) <= 12 ? s : null;
}
export function dispersaoFicha(rows: ImpactoRow[], P: ParamDispersao, mes: string) {
  const linhas = rows.filter((r) => !P.bloqueados.has(upper(r.material))).map((r) => {
    const data = dataProducao(r.dt_producao), impacto = Number(r.impacto_rs ?? 0);
    const cls = classificar(percentualDispersao(Number(r.qtd_dif) || 0, Number(r.qtd_previsto) || 0, Number(r.qtd_consumo) || 0), P.faixas);
    return { ...r, op: String(r.numero_op), mes: data?.slice(0, 7) ?? null, impacto, cls, estrutura: P.estrutura(r.sku_produto_final, r.material) };
  });
  const doMes = linhas.filter((r) => r.mes === mes);
  const mat = new Map<string, { desc: string; ops: Set<string>; liq: number; abs: number }>();
  for (const r of doMes) {
    if (!r.tem_furo && r.estrutura !== "FORA_FT") continue;
    const e = mat.get(r.material) ?? { desc: r.desc_material || r.material, ops: new Set<string>(), liq: 0, abs: 0 };
    e.ops.add(r.op); e.liq += r.impacto; e.abs += Math.abs(r.impacto); mat.set(r.material, e);
  }
  const matriz = [...mat.values()].map((m) => ({ descricao: m.desc, freq: m.ops.size, liq: m.liq, abs: m.abs })).sort(desc((x) => x.abs));
  const ops = new Set(doMes.map((r) => r.op)), opsFuro = new Set(doMes.filter((r) => r.tem_furo).map((r) => r.op)), opsCriticas = new Set(doMes.filter((r) => r.cls === "CRITICO").map((r) => r.op));
  const perda = soma(doMes, (r) => (r.impacto > 0 ? r.impacto : 0)), economia = soma(doMes, (r) => (r.impacto < 0 ? -r.impacto : 0));
  const totAbs = soma(matriz, (m) => m.abs);
  const serie = mesesAte(mes, 6).map((m) => {
    const l = linhas.filter((r) => r.mes === m), p = soma(l, (r) => (r.impacto > 0 ? r.impacto : 0)), e = soma(l, (r) => (r.impacto < 0 ? -r.impacto : 0));
    return { mes: m, perda: r2(p), economia: r2(e), liquido: r2(p - e), n: l.length };
  });
  // Pareto das maiores diferenças (perda de processo: material previsto na ficha) e furo de ficha classificado
  const prevDoMes = doMes.filter((r) => Number(r.qtd_previsto) > 0);
  const pm = new Map<string, { desc: string; perda: number; dif: number; ops: Set<string> }>();
  for (const r of prevDoMes) { if (r.impacto <= 0) continue; const e = pm.get(r.material) ?? { desc: r.desc_material || r.material, perda: 0, dif: 0, ops: new Set<string>() }; e.perda += r.impacto; e.dif += Number(r.qtd_dif) || 0; e.ops.add(r.op); pm.set(r.material, e); }
  const pl = [...pm].map(([material, e]) => ({ material, descricao: e.desc, perda: r2(e.perda), dif: e.dif, ops: e.ops.size })).sort(desc((x) => x.perda));
  const totPerda = soma(pl, (x) => x.perda); let ac = 0;
  const pareto = pl.slice(0, 12).map((x) => { ac += x.perda; return { ...x, acumPct: totPerda ? (100 * ac) / totPerda : 0 }; });
  const furo = classificarFuro(linhas, P.faixas, mes);
  // Fichas que pararam de errar depois do farol (perda no mês anterior e nenhuma no mês) × as que repetiram o erro
  const perdaPor = (m: string) => { const mm = new Map<string, { descricao: string; perda: number }>(); for (const r of linhas) { if (r.mes !== m || !(Number(r.qtd_previsto) > 0) || !(r.impacto > 0)) continue; const e = mm.get(r.material) ?? { descricao: r.desc_material || r.material, perda: 0 }; e.perda += r.impacto; mm.set(r.material, e); } return mm; };
  const pAnt = perdaPor(mesAnterior(mes)), pAt = perdaPor(mes);
  const corrigidas = [...pAnt].filter(([k]) => !pAt.has(k)).map(([material, e]) => ({ material, descricao: e.descricao, perdaAnterior: r2(e.perda) })).sort(desc((x) => x.perdaAnterior));
  const reincidentes = [...pAt].filter(([k]) => pAnt.has(k)).map(([material, e]) => ({ material, descricao: e.descricao, perda: r2(e.perda), perdaAnterior: r2(pAnt.get(material)!.perda) })).sort(desc((x) => x.perda));
  const correcao = { corrigidas, reincidentes, valorCorrigido: r2(soma(corrigidas, (x) => x.perdaAnterior)), perdaReincidente: r2(soma(reincidentes, (x) => x.perda)) };
  return {
    pareto, correcao, totalPerdaProcesso: r2(totPerda), materiaisComPerda: pl.length, top10Pct: totPerda ? (100 * soma(pl.slice(0, 10), (x) => x.perda)) / totPerda : null, furo,
    ops: ops.size, taxaFuro: ops.size ? (100 * opsFuro.size) / ops.size : 0, perda: r2(perda), economia: r2(economia), liquido: r2(perda - economia), opsCriticas: opsCriticas.size,
    cronicos: matriz.filter((m) => m.freq >= P.limFreq).length, limFreq: P.limFreq, pctTop20: totAbs ? (100 * soma(matriz.slice(0, 20), (m) => m.abs)) / totAbs : 0,
    serie: serie.slice(serie.findIndex((s) => s.n > 0) < 0 ? serie.length : serie.findIndex((s) => s.n > 0)),
    topPerda: matriz.filter((m) => m.liq > 0).sort(desc((m) => m.liq)).slice(0, 6),
    topEconomia: matriz.filter((m) => m.liq < 0).sort((a, b) => a.liq - b.liq).slice(0, 6),
  };
}
export type DadosDispersao = ReturnType<typeof dispersaoFicha>;

/**
 * Furo de ficha técnica: % das linhas OP × material (com ficha) fora da tolerância de atenção, por mês, e a perda do
 * mês classificada pela causa provável (viés × variabilidade por material, mesmo modelo do painel de Dispersão):
 * processo instável, ficha técnica a revisar, apontamento/compensação, material não previsto na ficha e residual.
 */
export function classificarFuro(linhas: { mes: string | null; material: string; desc_material: string | null; op: string; qtd_previsto: number; qtd_consumo: number; qtd_dif: number; impacto: number }[], faixas: Faixas, mes: string) {
  const pct = (r: { qtd_previsto: number; qtd_dif: number }) => (Number(r.qtd_previsto) > 0 ? (100 * Number(r.qtd_dif)) / Number(r.qtd_previsto) : null);
  const serie = mesesAte(mes, 6).map((m) => {
    const l = linhas.filter((r) => r.mes === m && Number(r.qtd_previsto) > 0);
    const fora = l.filter((r) => Math.abs(pct(r)!) > faixas.atencao).length;
    return { mes: m, linhas: l.length, fora, pct: l.length ? (100 * fora) / l.length : null };
  }).filter((x) => x.linhas > 0);
  const doMes = linhas.filter((r) => r.mes === mes);
  // viés e variabilidade por material com até 6 meses de histórico (estabilidade do diagnóstico)
  const janela = new Set(mesesAte(mes, 6));
  const porMat = new Map<string, number[]>(), difs = new Map<string, { dif: number; prev: number }>();
  for (const r of linhas) { if (!r.mes || !janela.has(r.mes)) continue; const p = pct(r); if (p === null) continue; porMat.set(r.material, [...(porMat.get(r.material) ?? []), Math.max(-200, Math.min(200, p))]); const d = difs.get(r.material) ?? { dif: 0, prev: 0 }; d.dif += Number(r.qtd_dif) || 0; d.prev += Number(r.qtd_previsto) || 0; difs.set(r.material, d); }
  const diag = new Map<string, string>();
  for (const [m, ps] of porMat) {
    if (ps.length < 3) { diag.set(m, "Sem histórico suficiente"); continue; }
    const media = ps.reduce((a, b) => a + b, 0) / ps.length, dp = Math.sqrt(ps.reduce((a, b) => a + (b - media) ** 2, 0) / (ps.length - 1));
    const d = difs.get(m)!, vies = d.prev ? (100 * d.dif) / d.prev : 0, sist = Math.abs(vies) > faixas.atencao, inst = dp > faixas.critico;
    diag.set(m, sist && !inst ? "Revisar ficha técnica" : sist && inst ? "Processo instável" : inst ? "Apontamento / compensação" : "Sob controle (residual)");
  }
  const cls = new Map<string, number>();
  for (const r of doMes) {
    if (!(r.impacto > 0)) continue;
    const k = Number(r.qtd_previsto) > 0 ? (diag.get(r.material) ?? "Sem histórico suficiente") : "Não previsto na ficha";
    cls.set(k, (cls.get(k) ?? 0) + r.impacto);
  }
  const tot = [...cls.values()].reduce((a, b) => a + b, 0);
  const classes = [...cls].map(([nome, valor]) => ({ nome, valor: r2(valor), pct: tot ? (100 * valor) / tot : 0 })).sort(desc((x) => x.valor));
  const atual = serie.find((x) => x.mes === mes) ?? null, ant = serie.length >= 2 && serie.at(-1)?.mes === mes ? serie.at(-2)! : null;
  return { serie, pctMes: atual?.pct ?? null, deltaPP: atual?.pct != null && ant?.pct != null ? atual.pct - ant.pct : null, linhasMes: atual?.linhas ?? 0, foraMes: atual?.fora ?? 0, classes, perdaTotal: r2(tot) };
}

// ---------- Testes Industriais (producao.testes-industriais: v_teste_industrial_consumo) ----------
export type TesteRow = { ano_mes: string; numero_op: string; material: string; desc_material: string | null; qtd_consumo: number; custo_unit_medio: number | null };
export function testesIndustriais(rows: TesteRow[], mes: string) {
  const doMes = rows.filter((r) => r.ano_mes === mes).map((r) => { const q = Number(r.qtd_consumo) || 0, u = Number(r.custo_unit_medio) || 0; return { ...r, custo: q * u, semCusto: q > 0 && u === 0 }; });
  const com = doMes.filter((r) => !r.semCusto), gasto = soma(com, (r) => r.custo), ops = new Set(com.map((r) => String(r.numero_op)).filter(Boolean));
  const ag = new Map<string, number>();
  for (const r of com) { const k = r.desc_material || r.material || "—"; ag.set(k, (ag.get(k) ?? 0) + r.custo); }
  return { itens: com.length, semCusto: doMes.length - com.length, gasto: r2(gasto), ops: ops.size, custoMedio: ops.size ? r2(gasto / ops.size) : 0, top: [...ag].map(([nome, custo]) => ({ nome, custo: r2(custo) })).sort(desc((x) => x.custo)).slice(0, 8) };
}
export type DadosTestes = ReturnType<typeof testesIndustriais>;

// ---------- Controle de FEFO (suprimentos.fefo: checagens_fefo + justificativas) ----------
export type FefoRow = { data: string; id_produto: string; descricao: string | null; destino: string | null; doc: string | null; lote_movimentado: string | null; quebra: boolean; status: string };
export type FefoJust = { data: string; id_produto: string; doc: string | null; lote_movimentado: string | null; destino: string | null };
const AUDITADO = (s: string) => s !== "Destino (não auditado)";
const INCONCLUSIVO = (s: string) => s.startsWith("Inconclusivo") || s.startsWith("Sem validade") || s === "Almox não mapeado";
const chaveJust = (r: FefoJust) => [r.data, r.id_produto, r.doc ?? "", r.lote_movimentado ?? "", r.destino ?? ""].join("|");
/** Quebra com justificativa registrada deixa de contar como quebra ("QUEBRA JUSTIFICADA"), como na tela. */
export function aplicarJustificativas(rows: FefoRow[], justs: FefoJust[]): FefoRow[] {
  const j = new Set(justs.map(chaveJust));
  return rows.map((r) => (r.quebra && j.has(chaveJust(r)) ? { ...r, quebra: false, status: "QUEBRA JUSTIFICADA" } : r));
}
const normCod = (v: string) => { const s = upper(v); return /^\d+$/.test(s) ? s.padStart(8, "0") : s; };
/** Grupo como na tela de FEFO: código exato (8 dígitos) ou o grupo mais frequente do prefixo de 8 dígitos. */
export function resolvedorGrupoFefo(grupos: { codigo_produto: string; grupo: string }[]) {
  const exato = new Map<string, string>(), cont = new Map<string, Map<string, number>>();
  for (const r of grupos) {
    const g = String(r.grupo ?? "").trim(); if (!g) continue;
    const cod = normCod(r.codigo_produto); exato.set(cod, g);
    const m = cont.get(cod.slice(0, 8)) ?? new Map(); m.set(g, (m.get(g) ?? 0) + 1); cont.set(cod.slice(0, 8), m);
  }
  const pre = new Map([...cont].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  return (cod: string) => { const c = normCod(cod); return exato.get(c) ?? pre.get(c.slice(0, 8)) ?? "Sem grupo"; };
}
export function controleFefo(rows: FefoRow[], grupoDe: (cod: string) => string, mes: string) {
  const aud = (m: string) => rows.filter((r) => AUDITADO(r.status) && String(r.data).slice(0, 7) === m);
  const resumo = (l: FefoRow[]) => { const q = l.filter((r) => r.quebra).length; return { total: l.length, quebras: q, taxa: l.length ? (q / l.length) * 100 : 0 }; };
  const a = aud(mes), atual = resumo(a), ant = resumo(aud(mesAnterior(mes)));
  const contar = (chave: (r: FefoRow) => string, l = a) => { const m = new Map<string, { total: number; quebras: number }>(); for (const r of l) { const k = chave(r); const e = m.get(k) ?? { total: 0, quebras: 0 }; e.total++; if (r.quebra) e.quebras++; m.set(k, e); } return m; };
  const inconc = a.filter((r) => INCONCLUSIVO(r.status));
  const motivosInconc = [...contar((r) => (r.status.startsWith("Sem validade") ? "Sem validade" : r.status.startsWith("Inconclusivo") ? "Inconclusivo" : "Almox não mapeado"), inconc)].map(([motivo, v]) => ({ motivo, qtd: v.total }));
  const quebrasProd = new Map<string, { nome: string; qtd: number }>();
  for (const r of a.filter((x) => x.quebra)) { const e = quebrasProd.get(r.id_produto) ?? { nome: `${r.id_produto}${r.descricao ? " - " + r.descricao : ""}`, qtd: 0 }; e.qtd++; quebrasProd.set(r.id_produto, e); }
  return {
    ...atual, oks: a.filter((r) => r.status.startsWith("OK")).length, inconclusivos: inconc.length, motivosInconc,
    deltaQuebras: ant.total ? atual.quebras - ant.quebras : null, deltaTaxa: ant.total ? atual.taxa - ant.taxa : null,
    produtosQuebra: quebrasProd.size,
    porDia: [...contar((r) => String(r.data).slice(0, 10))].sort((x, y) => x[0].localeCompare(y[0])).map(([dia, v]) => ({ dia: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, ...v })),
    porDestino: [...contar((r) => r.destino || "—")].map(([nome, v]) => ({ nome, total: v.total })).sort(desc((x) => x.total)),
    porGrupo: [...contar((r) => grupoDe(r.id_produto))].map(([nome, v]) => ({ nome, total: v.total })).sort(desc((x) => x.total)),
    topProdutos: [...quebrasProd.values()].sort(desc((x) => x.qtd)).slice(0, 10),
  };
}
export type DadosFefo = ReturnType<typeof controleFefo>;

// ---------- Fechamento Mensal do Stock Savvy (RPCs fechamento_*) ----------
export type FechResumo = { modulo: string; ordem: number; acoes_criadas: number; acoes_concluidas: number; acoes_em_aberto: number; valor_ou_quantidade: number; unidade_valor: string; status_geral: string };
export type FechTopBaixa = { codigo_produto: string; descricao: string | null; lote: string | null; almoxarifado: string | null; motivo: string | null; solicitante: string | null; valor_total: number };
export type FechTopGeral = { modulo: string; rnk: number; item: string; detalhe: string; valor: number; unidade: string };
export type FechTopLote = { sku: string; descricao: string | null; lote: string | null; almoxarifado: string | null; tipo_acao: string | null; responsavel: string | null; quantidade: number; custo_acao: number; saving: number };
export type FechPnl = { perda_real: number; perda_estimada: number; valor_recuperado: number; saving_recuperado: number; roi_operacional: number; qtd_concluidas: number; qtd_acoes_abertas: number; qtd_baixas_vencimento: number };
export type DadosFechamento = { inicio: string; fim: string; resumo: FechResumo[]; topBaixas: FechTopBaixa[]; topGeral: FechTopGeral[]; topLote: FechTopLote[]; pnl: FechPnl | null };

// ---------- Metas Individuais (upload do .html exportado — porte de extrair_metas_individuais do Atlas) ----------
const MESES_METAS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** "-149%" → -149 ; "1.038,09" → 1038.09 ; "—" → null (mesmo token-regex do Atlas). */
export function numBr(t: string | null | undefined): number | null {
  const s = String(t ?? "").trim();
  if (!s || s === "—" || s === "-" || s === "–") return null;
  const m = /[-−]?[\d.,]*\d/.exec(s); if (!m) return null;
  const neg = /^[-−]/.test(m[0]), bruto = m[0].replace(/^[-−]/, "");
  // "0.0%" / "12.5" (ponto decimal do navegador) x "1.038,09" (pt-BR)
  const n = !bruto.includes(",") && /^\d+\.\d{1,2}$/.test(bruto) ? bruto : bruto.replace(/\./g, "").replace(",", ".");
  const v = Number(n); return Number.isNaN(v) ? null : neg ? -v : v;
}
export type Meta = {
  descricao: string; direcao: string | null; unidade: string | null; tipo: "booleano" | "numerico"; peso: number | null;
  metaMes: number | null; realizadoMes: number | null; realizadoTexto: string | null; atingMes: number | null; realAcum: number | null;
  serie: { meta: number | null; realizado: number | string | null; ating: number | null }[];
  sinalInconsistente: boolean; acumuladoSomado: boolean; mediaAteMes: number | null;
  /** Export em grade (2026/27): meta e real acumulados, atingimento como veio no export e o recalculado pelo sentido da meta. */
  menorMelhor?: boolean; agregacao?: string | null; metaAcum?: number | null; atingAcum?: number | null;
  atingOrigemMes?: number | null; atingOrigemAcum?: number | null; corrigida?: boolean; batidaMes?: boolean | null; batidaAcum?: boolean | null;
};
export type DadosMetas = { colaborador: string | null; somaPesos: number | null; pesosOk: boolean; metas: Meta[]; idxMes: number; enviadoEm: string | null };
type El = { children: ArrayLike<El> | Iterable<El>; childNodes: Iterable<{ nodeType: number; textContent: string | null }>; tagName: string; textContent: string | null; querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El> | Iterable<El>; getAttribute(n: string): string | null; nextElementSibling: El | null; value?: string };
const filhosDiv = (e: El) => [...(e.children as Iterable<El>)].filter((c) => c.tagName.toUpperCase() === "DIV");
const txt = (e: El | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
/** Texto com espaço entre os nós (como o get_text(" ") do BeautifulSoup): "maior" + "R$" → "maior R$". */
function txtSep(e: El | null | undefined) {
  const out: string[] = [];
  const walk = (n: any) => { for (const c of [...(n.childNodes as Iterable<any>)]) { if (c.nodeType === 3) out.push(String(c.textContent ?? "").trim()); else if (c.nodeType === 1) walk(c); } };
  if (e) walk(e);
  return out.filter(Boolean).join(" ").replace(/\s+/g, " ");
}
/** Lê o export "Minhas metas" (grid de metas + painel mensal de cada meta). `doc` = DOMParser().parseFromString(html). */
/**
 * Atingimento pelo sentido da meta. Metas de perda (prejuízo, valores negativos) são "menor é melhor": o export usa
 * Real ÷ Meta e mostra 66% quando a perda ficou abaixo do teto; o correto é Meta ÷ Real (perda menor → acima de 100%).
 */
export function atingimentoMeta(meta: number | null, real: number | null, menorMelhor: boolean): number | null {
  if (meta == null || real == null) return null;
  const m = Math.abs(meta), r = Math.abs(real);
  if (menorMelhor) return r === 0 ? (m === 0 ? 100 : 200) : Math.round((m / r) * 1000) / 10;
  return m === 0 ? null : Math.round((real / meta) * 1000) / 10;
}
const semAcentoM = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Export "Minhas metas" no formato de grade mensal (linhas tr[data-goal-grid-row], célula do mês com title "Meta: x · Real: y"). */
function extrairMetasGrade(doc: { querySelectorAll(s: string): ArrayLike<El> | Iterable<El> }, mes: string, enviadoEm: string | null): DadosMetas | null {
  const rows = [...(doc.querySelectorAll("tr[data-goal-grid-row]") as Iterable<El>)];
  if (!rows.length) return null;
  const ths = [...(doc.querySelectorAll("thead th") as Iterable<El>)].map((t) => txt(t));
  const iSet = ths.findIndex((t) => MESES_METAS.includes(t.slice(0, 3)));
  const mesesCol = ths.slice(iSet).map((t) => MESES_METAS.indexOf(t.slice(0, 3)));
  const idx = Number(mes.slice(5, 7)) - 1, colMes = mesesCol.indexOf(idx);
  const dono = [...(doc.querySelectorAll("tbody tr") as Iterable<El>)].find((r) => !r.getAttribute("data-goal-grid-row") && /meta\(s\)/i.test(txt(r)));
  const colaborador = dono ? txt(dono).replace(/você.*$/i, "").replace(/·.*$/, "").trim() || null : null;
  const metas: Meta[] = [];
  for (const row of rows) {
    const tds = [...(row.querySelectorAll("td") as Iterable<El>)]; if (tds.length < 5 + mesesCol.length) continue;
    const botoes = [...(tds[0].querySelectorAll("button") as Iterable<El>)];
    const descricao = txt(botoes.at(-1) ?? tds[0]).replace(/Ver detalhes/g, "").trim();
    const tags = [...(tds[0].querySelectorAll("div.flex > div") as Iterable<El>)].map((d) => txt(d));
    const unidade = tags[0] ?? null, agregacao = tags[1] ?? null;
    const cel = tds.slice(5, 5 + mesesCol.length).map((c) => {
      const t = c.querySelector("[title]")?.getAttribute("title") ?? "";
      const mm = /Meta:\s*([^·]+)·\s*Real:\s*(.+)$/.exec(t);
      return { meta: mm ? numBr(mm[1]) : null, realTxt: mm ? mm[2].trim() : txt(c), real: mm ? numBr(mm[2]) : numBr(txt(c)) };
    });
    const booleano = cel.some((c) => /^(sim|não|nao)$/i.test(c.realTxt)) || /^(sim|não|nao)$/i.test(txt(tds[1]));
    const tipo: Meta["tipo"] = booleano ? "booleano" : "numerico";
    const metaAnual = numBr(txt(tds[1])), metaAcum = numBr(txt(tds[2])), realAcum = numBr(txt(tds[3])), atingOrigemAcum = numBr(txt(tds[4]));
    const menorMelhor = !booleano && (/preju[ií]zo|perda|desvio|ruptura|furo/i.test(semAcentoM(descricao)) || (metaAcum ?? metaAnual ?? 0) < 0);
    const serie = MESES_METAS.map(() => ({ meta: null as number | null, realizado: null as number | string | null, ating: null as number | null }));
    mesesCol.forEach((mi, k) => {
      if (mi < 0) return; const c = cel[k];
      serie[mi] = booleano ? { meta: null, realizado: /^(sim|não|nao)$/i.test(c.realTxt) ? c.realTxt : null, ating: /^sim$/i.test(c.realTxt) ? 100 : /^n[ãa]o$/i.test(c.realTxt) ? 0 : null }
        : { meta: c.meta, realizado: c.real, ating: atingimentoMeta(c.meta, c.real, menorMelhor) };
    });
    const pctSpan = (c: El | undefined) => { for (const sp of [...((c?.querySelectorAll("span") ?? []) as Iterable<El>)]) { const t = txt(sp); if (/^-?\d+(,\d+)?%$/.test(t)) return numBr(t); } return null; };
    const sm = serie[idx], origem = colMes >= 0 ? pctSpan(tds[5 + colMes]) : null;
    const atingMes = sm?.ating ?? null, atingAcum = booleano ? (/^sim$/i.test(txt(tds[1])) ? 100 : null) : atingimentoMeta(metaAcum, realAcum, menorMelhor);
    metas.push({
      descricao, direcao: booleano ? "sim/não" : menorMelhor ? "menor" : "maior", unidade, tipo, peso: null,
      metaMes: booleano ? null : sm?.meta ?? null, realizadoMes: booleano ? null : (sm?.realizado as number | null) ?? null, realizadoTexto: booleano ? ((sm?.realizado as string | null) ?? null) : null,
      atingMes, realAcum, serie, sinalInconsistente: false, acumuladoSomado: false, mediaAteMes: null,
      menorMelhor, agregacao, metaAcum, atingAcum, atingOrigemMes: origem, atingOrigemAcum,
      corrigida: menorMelhor && origem != null && atingMes != null && Math.abs(origem - atingMes) > 1,
      batidaMes: atingMes == null ? null : atingMes >= 100, batidaAcum: atingAcum == null ? null : atingAcum >= 100,
    });
  }
  if (!metas.length) return null;
  return { colaborador, somaPesos: null, pesosOk: true, metas, idxMes: idx, enviadoEm };
}

export function extrairMetas(doc: { querySelectorAll(s: string): ArrayLike<El> | Iterable<El> }, mes: string, enviadoEm: string | null = null): DadosMetas | null {
  const grade = extrairMetasGrade(doc, mes, enviadoEm);
  if (grade) return grade;
  const idx = Number(mes.slice(5, 7)) - 1;
  const grids = [...(doc.querySelectorAll("div.grid") as Iterable<El>)];
  if (grids.length < 3) return null;
  const resumo = grids[1], fr = filhosDiv(resumo);
  const colaborador = fr[0] ? txtSep(filhosDiv(fr[0])[0] ?? fr[0]).replace(/você/gi, "").trim() || null : null;
  const mp = /soma dos pesos\s*([\d.,]+)\s*%/i.exec(txtSep(resumo));
  const somaPesos = mp ? numBr(mp[1]) : null;
  const metas: Meta[] = [];
  for (const row of grids.slice(2)) {
    const f = filhosDiv(row); if (f.length < 8) continue;
    const pesoIn = f[0].querySelector("input"), peso = pesoIn ? numBr(pesoIn.getAttribute("value")) : null;
    const d = filhosDiv(f[1]); const dd = d.length ? filhosDiv(d[0]) : [];
    const descricao = txt(dd[0] ?? d[0] ?? f[1]);
    const du = txtSep(dd[1] ?? d[1]).split(" ").filter(Boolean);
    let direcao: string | null = du[0] ?? null; if (du[1] === "não") direcao = "sim/não";
    const unidade = du.length && !["maior", "menor", "sim/não"].includes(du.at(-1)!) ? du.at(-1)! : null;
    const tipo = ["sim/não", "sim/nao"].includes((direcao ?? "").toLowerCase()) ? "booleano" : "numerico";
    const realAcum = numBr(txt(f[6]));
    const tabela = row.nextElementSibling?.tagName.toUpperCase() === "DIV" ? row.nextElementSibling.querySelector("table") : null;
    const linhas = new Map<string, string[]>();
    if (tabela) for (const tr of [...(tabela.querySelectorAll("tr") as Iterable<El>)]) {
      const cel = [...(tr.querySelectorAll("td, th") as Iterable<El>)]; if (!cel.length) continue;
      linhas.set(txt(cel[0]), cel.slice(1).map((c) => { const i = c.querySelector("input"); if (i) return (i.getAttribute("value") ?? "").trim(); const s = c.querySelector("select") ?? c.querySelector("button"); return s ? txt(s) : txt(c); }));
    }
    const serie = MESES_METAS.map((_, i) => ({ meta: numBr(linhas.get("Meta")?.[i]), realizado: tipo === "booleano" ? (linhas.get("Realizado")?.[i] ?? null) : numBr(linhas.get("Realizado")?.[i]), ating: numBr(linhas.get("% atingimento")?.[i]) }));
    const s = tabela ? serie[idx] : undefined;
    const metaMes = s?.meta ?? null, realizadoMes = tipo === "booleano" ? null : ((s?.realizado as number | null) ?? null);
    const sinalInconsistente = tipo === "numerico" && metaMes != null && realizadoMes != null && metaMes !== 0 && realizadoMes !== 0 && metaMes < 0 !== realizadoMes < 0;
    let acumuladoSomado = false, mediaAteMes: number | null = null;
    if (tipo === "numerico" && unidade === "%" && realAcum != null && tabela) {
      const v = serie.slice(0, idx + 1).map((x) => x.realizado as number | null).filter((x): x is number => x != null);
      if (v.length) { const sm = v.reduce((a, b) => a + b, 0); mediaAteMes = Math.round((sm / v.length) * 10) / 10; acumuladoSomado = Math.abs(sm - realAcum) < 1 && realAcum > 105; }
    }
    metas.push({ descricao, direcao, unidade, tipo, peso, metaMes, realizadoMes, realizadoTexto: tipo === "booleano" ? ((s?.realizado as string | null) || null) : null, atingMes: s?.ating ?? null, realAcum, serie, sinalInconsistente, acumuladoSomado, mediaAteMes });
  }
  if (!metas.length) return null;
  return { colaborador, somaPesos, pesosOk: somaPesos != null && Math.abs(somaPesos - 100) < 0.5, metas, idxMes: idx, enviadoEm };
}
