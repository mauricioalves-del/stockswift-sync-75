// Importar do Atlas (fase 2): mesmas regras do import_router.py do Atlas Operações BI, agora no navegador, gravando nas
// tabelas atlas_*. A investigação automática das divergências (regras + ML) vem com a tela de Divergências (fase 3);
// até lá, cada divergência nova é criada como "Aberta" com a evidência "investigação pendente", igual ao que o Atlas
// já fazia quando a investigação falhava — o "Reinvestigar" da fase 3 completa o diagnóstico.
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

// ---------- leitura de planilha / CSV ----------
export type Planilha = { abas: string[]; ler: (aba: string) => unknown[][] };

export function abrirPlanilha(buf: ArrayBuffer, nomeArquivo: string): Planilha {
  if (/\.csv$/i.test(nomeArquivo)) {
    const texto = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
    const linhas = lerCsvSimples(texto);
    return { abas: ["CSV"], ler: () => linhas };
  }
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return { abas: wb.SheetNames, ler: (aba) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: null, blankrows: false }) };
}

function lerCsvSimples(texto: string): string[][] {
  const out: string[][] = []; let campo = ""; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texto[i + 1] === "\n") i++; linha.push(campo); campo = ""; if (linha.some((x) => x !== "")) out.push(linha); linha = []; }
    else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.some((x) => x !== "")) out.push(linha); }
  return out;
}

/** Linhas de uma aba como objetos {cabeçalho: valor} (cabeçalho com trim). */
export function comoObjetos(linhas: unknown[][]): Record<string, unknown>[] {
  if (!linhas.length) return [];
  const cab = linhas[0].map((c) => (c == null ? "" : String(c).trim()));
  return linhas.slice(1).filter((l) => l.some((v) => v != null && v !== "")).map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i] ?? null])));
}

// ---------- conversões (csv_utils.py) ----------
export function parseSku(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (s === "" || s.toLowerCase() === "nan") return null;
  s = s.replace(/^(&apos;|&#39;|')+/, "");
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Data como yyyy-mm-dd. Aceita data do Excel, "2026-05-13", "2026-05-13 00:00:00" e "13/05/2026". Hora diferente de 00:00 é erro (dado perdido). */
export function parseData(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) { if (isNaN(v.getTime())) return null; return iso(new Date(v.getTime() + 30000)); }   // +30 s: o Excel às vezes grava 23:59:59.99
  let s = String(v).trim();
  if (s === "" || s.toLowerCase() === "nan") return null;
  if (s.includes(" ")) { const [d, h] = s.split(" ", 2); if (!["00:00:00", "0:00:00"].includes(h.trim())) throw new Error(`Data '${s}' tem hora diferente de 00:00:00 — verifique a origem antes de importar.`); s = d; }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(`Data '${s}' em formato desconhecido.`);
}
export function limparTexto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || ["nan", "none", "null", "n/a", "#n/a"].includes(s.toLowerCase()) ? null : s;
}
export function parseDecimal(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (s === "" || s.toLowerCase() === "nan") return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: '${v}'`);
  return n;
}

// ---------- almoxarifado de planilha bruta → código do Atlas (hipoteses_config.py) ----------
const DE_PARA_ALMOX: [string, string][] = [
  ["Processo", "Almox_SP_Processo"], ["Qualidade", "Almox_SP_Qualidade"], ["Ativa", "Almox_SP_Ativacao"], ["Degusta", "Almox_SP_Degustacao"],
  ["Box2", "Almox_Box_2"], ["Box 2", "Almox_Box_2"], ["Box", "Almox_Box"], ["Loja", "Almox_SP_Loja"], ["Paulista", "Almox_SP_PatioPaulista"],
  ["Par", "Almox_PA_Para"], ["Geral", "Almox_SP_Fabrica"], ["Frabrica", "Almox_SP_Fabrica"], ["Frabica", "Almox_SP_Fabrica"], ["Fabrica", "Almox_SP_Fabrica"],
];
export function normalizarAlmoxarifado(v: unknown): string {
  if (v == null) return "NAO_MAPEADO__vazio";
  const s = String(v).trim(); const l = s.toLowerCase();
  for (const [chave, codigo] of DE_PARA_ALMOX) if (l.includes(chave.toLowerCase())) return codigo;
  return `NAO_MAPEADO__${s}`;
}
/** Separa "Almox A --> Almox B" (ou "->") nos dois lados normalizados; null se não for transferência entre almoxarifados. */
export function parseOperacaoTransferencia(op: string): [string, string] | null {
  for (const sep of ["-->", "->"]) if (op.includes(sep)) { const p = op.split(sep); if (p.length === 2) return [normalizarAlmoxarifado(p[0].trim()), normalizarAlmoxarifado(p[1].trim())]; }
  return null;
}

// ---------- contexto comum ----------
export type Contexto = { usuario: string; produtos: Map<string, { categoria: string | null; custo: number | null }> };

async function lerTudo<T>(tabela: string, colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(colunas).order("id").range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function carregarContexto(): Promise<Contexto> {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = u.user ? await sb.from("profiles").select("nome, email").eq("id", u.user.id).maybeSingle() : { data: null };
  const produtos = new Map<string, { categoria: string | null; custo: number | null }>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("atlas_produtos").select("sku, categoria_produto, custo_unitario").order("sku").range(de, de + 999);
    if (error) throw new Error("Cadastro de produtos do Atlas: " + error.message);
    for (const x of data ?? []) produtos.set(x.sku, { categoria: x.categoria_produto, custo: x.custo_unitario });
    if (!data || data.length < 1000) break;
  }
  return { usuario: p?.nome || p?.email || u.user?.email || "Stock Savvy", produtos };
}

async function inserirEmLotes(tabela: string, linhas: Record<string, unknown>[], progresso?: (n: number) => void) {
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await sb.from(tabela).insert(linhas.slice(i, i + 1000));
    if (error) throw new Error(`${tabela} (linhas ${i + 1}–${Math.min(i + 1000, linhas.length)}): ${error.message}`);
    progresso?.(Math.min(i + 1000, linhas.length));
  }
}
async function registrarLog(ctx: Contexto, acao: string, detalhes: Record<string, unknown>, entidade?: string, entidadeId?: string | number) {
  await sb.from("atlas_log_auditoria").insert({ username: ctx.usuario, acao, entidade: entidade ?? null, entidade_id: entidadeId == null ? null : String(entidadeId), detalhes, criado_em: new Date().toISOString() });
}

// ---------- 1) Movimentação (planilha de reconciliação: sistema × contagem) ----------
export const COLUNAS_MOV_EXCEL = { grupo: "Grupo", data: "Data", sku: "Id_Produto", unidade: "Unid.", saldo_sistema: "Sistema", entrada: "Entrada", saida: "Saídas", saldo_fisico: "Contagem", obs: "Obs", prejuizo: "Prejuízo" };
export type LinhaMov = { sku: unknown; almoxarifado: string; data: unknown; entrada: unknown; saida: unknown; saldo_sistema: unknown; saldo_fisico: unknown; unidade: unknown; grupo?: unknown; obs?: unknown; prejuizo?: boolean };

/** Decide histórico (saldo bate) ou divergência (não bate) — processar_linha_movimentacao do Atlas, sem a investigação. */
export function classificarMovimentacao(l: LinhaMov, ctx: Contexto, loteId: number) {
  const sku = parseSku(l.sku); if (!sku) throw new Error("SKU vazio");
  const data = parseData(l.data); if (!data) throw new Error("data vazia");
  const entrada = parseDecimal(l.entrada), saida = parseDecimal(l.saida), sis = parseDecimal(l.saldo_sistema), fis = parseDecimal(l.saldo_fisico);
  const div = Math.round((fis - sis) * 10000) / 10000;
  const prod = ctx.produtos.get(sku);
  const categoria = prod?.categoria || limparTexto(l.grupo) || "Desconhecido";
  const custo = prod?.custo ?? null;
  const valor = custo != null ? Math.round(Math.abs(div) * custo * 100) / 100 : 0;
  const obs = limparTexto(l.obs);
  const unidade = limparTexto(l.unidade);
  if (div === 0) {
    return { tipo: "historico" as const, linha: { sku, almoxarifado: l.almoxarifado, categoria_produto: categoria, data_movimento: data, entrada, saida, saldo_sistema: sis, saldo_fisico: fis, divergencia: 0, valor_divergencia: 0, unidade, observacao_original: obs, prejuizo_confirmado: !!l.prejuizo, status: "Historico_Resolvido", lote_importacao_id: loteId } };
  }
  return { tipo: "divergencia" as const, linha: {
    sku, almoxarifado: l.almoxarifado, categoria_produto: categoria, data_deteccao: data, saldo_sistema: sis, saldo_fisico: fis, divergencia_qtd: div, valor_estimado: valor,
    status: "Aberta", observacao_origem: obs, lote_importacao_id: loteId, criado_em: new Date().toISOString(),
    evidencias: [{ hipotese: "Falha_Inventario", verificacao: "investigacao_pendente: a investigação automática roda na tela de Divergências (Reinvestigar)", encontrado: false, peso_aplicado: 0 }],
    casos_similares: [], distribuicao_probabilidades: [],
  } };
}

export type ResultadoMov = { loteId: number; linhas: number; historico: number; divergencias: number; erros: string[] };

export async function importarMovimentacao(p: Planilha, arquivo: string, almoxForcado: string | null, abaEscolhida: string | null, ctx: Contexto): Promise<ResultadoMov> {
  const csv = p.abas[0] === "CSV";
  const aba = csv ? "CSV" : abaEscolhida || (p.abas.includes("Movimentação") ? "Movimentação" : p.abas[0]);
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const objs = comoObjetos(p.ler(aba));
  let linhas: LinhaMov[];
  if (csv) {
    const falta = ["sku", "almoxarifado", "data_movimento", "saldo_sistema", "saldo_fisico"].filter((c) => !(objs[0] && c in objs[0]));
    if (falta.length) throw new Error(`Colunas do CSV não encontradas: ${falta.join(", ")}`);
    linhas = objs.map((o) => ({ sku: o.sku, almoxarifado: String(o.almoxarifado ?? "").trim(), data: o.data_movimento, entrada: o.entrada, saida: o.saida, saldo_sistema: o.saldo_sistema, saldo_fisico: o.saldo_fisico, unidade: o.unidade }));
  } else {
    if (!almoxForcado) throw new Error("Escolha o almoxarifado deste arquivo.");
    const cab = Object.keys(objs[0] ?? {});
    const falta = Object.values(COLUNAS_MOV_EXCEL).filter((c) => !cab.includes(c));
    if (falta.length) throw new Error(`Colunas esperadas não encontradas na aba '${aba}': ${falta.join(", ")}. Cabeçalho: ${cab.join(", ")}`);
    const C = COLUNAS_MOV_EXCEL;
    linhas = objs.filter((o) => o[C.sku] != null && String(o[C.sku]).trim() !== "").map((o) => ({
      sku: o[C.sku], almoxarifado: almoxForcado, data: o[C.data], entrada: o[C.entrada], saida: o[C.saida], saldo_sistema: o[C.saldo_sistema], saldo_fisico: o[C.saldo_fisico],
      unidade: o[C.unidade], grupo: o[C.grupo], obs: o[C.obs], prejuizo: String(o[C.prejuizo] ?? "").trim().toLowerCase() === "sim",
    }));
  }
  const { data: lote, error } = await sb.from("atlas_lotes_importacao").insert({ tipo: csv ? "movimentacao_csv" : "movimentacao_excel", arquivo_origem: arquivo, almoxarifado: almoxForcado, usuario: ctx.usuario, criado_em: new Date().toISOString() }).select("id").single();
  if (error) throw new Error("Não consegui abrir o lote de importação: " + error.message);
  const hist: Record<string, unknown>[] = [], divs: Record<string, unknown>[] = [], erros: string[] = [];
  linhas.forEach((l, i) => {
    try { const r = classificarMovimentacao(l, ctx, lote.id); (r.tipo === "historico" ? hist : divs).push(r.linha); }
    catch (e: any) { erros.push(`linha ${i + 2}: ${e?.message ?? e}`); }
  });
  try {
    await inserirEmLotes("atlas_movimentacoes_historico", hist);
    await inserirEmLotes("atlas_divergencias", divs);
  } catch (e) {
    // desfaz o lote parcial para não deixar meia importação
    await sb.from("atlas_divergencias").delete().eq("lote_importacao_id", lote.id);
    await sb.from("atlas_movimentacoes_historico").delete().eq("lote_importacao_id", lote.id);
    await sb.from("atlas_lotes_importacao").delete().eq("id", lote.id);
    throw e;
  }
  await sb.from("atlas_lotes_importacao").update({ linhas_processadas: linhas.length, divergencias_criadas: divs.length, historico_criado: hist.length }).eq("id", lote.id);
  await registrarLog(ctx, csv ? "importar_movimentacao_csv" : "importar_movimentacao_excel", { arquivo, almoxarifado: almoxForcado, linhas: linhas.length, divergencias: divs.length }, "lote_importacao", lote.id);
  return { loteId: lote.id, linhas: linhas.length, historico: hist.length, divergencias: divs.length, erros };
}

/** Desfaz uma importação de movimentação inteira (divergências, histórico e feedback de ML ligados ao lote). */
export async function excluirLote(loteId: number, ctx: Contexto) {
  const { data: divs } = await sb.from("atlas_divergencias").select("id").eq("lote_importacao_id", loteId);
  const ids = (divs ?? []).map((d: any) => d.id);
  for (let i = 0; i < ids.length; i += 500) await sb.from("atlas_casos_ml_feedback").delete().in("divergencia_id", ids.slice(i, i + 500));
  const a = await sb.from("atlas_divergencias").delete({ count: "exact" }).eq("lote_importacao_id", loteId);
  const b = await sb.from("atlas_movimentacoes_historico").delete({ count: "exact" }).eq("lote_importacao_id", loteId);
  if (a.error || b.error) throw new Error((a.error ?? b.error).message);
  const { data: lote } = await sb.from("atlas_lotes_importacao").select("arquivo_origem").eq("id", loteId).maybeSingle();
  await sb.from("atlas_lotes_importacao").delete().eq("id", loteId);
  await registrarLog(ctx, "excluir_lote_importacao", { arquivo: lote?.arquivo_origem, divergencias_removidas: a.count ?? 0, historico_removido: b.count ?? 0 }, "lote_importacao", loteId);
  return { divergencias: a.count ?? 0, historico: b.count ?? 0 };
}

// ---------- 2) Livro-caixa bruto do sistema (transferências, conferências, dias operacionais) ----------
export type ResultadoBruto = { linhas: number; dias: number; conferencias: number; transfCriadas: number; transfAtualizadas: number; naoMapeados: string[] };

export async function importarLivroCaixa(p: Planilha, arquivo: string, almox: string, abaEscolhida: string | null, ctx: Contexto, progresso?: (txt: string) => void): Promise<ResultadoBruto> {
  const aba = abaEscolhida || p.abas[0];
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const brutas = p.ler(aba);
  if (!brutas.length) throw new Error("Planilha vazia.");
  const cab = brutas[0].map((c) => (c == null ? "" : String(c).trim()));
  for (const c of ["Id_Produto", "Data", "Operacao", "Id_Doc", "Doc", "Qtd_Sai", "Qtd_Ent"]) if (!cab.includes(c)) throw new Error(`Coluna obrigatória '${c}' não encontrada. Cabeçalho: ${cab.join(", ")}`);
  const ix = (c: string) => cab.indexOf(c);

  progresso?.("lendo transferências e dias já registrados…");
  const transfs = await lerTudo<any>("atlas_transferencias", "*");
  const porDocSku = new Map<string, any>(transfs.filter((t) => t.documento).map((t) => [`${t.documento}|${t.sku}`, t]));
  const alteradas = new Map<string, any>(); const novas = new Map<string, any>();
  const linhasBrutas: Record<string, unknown>[] = []; const conferencias: Record<string, unknown>[] = [];
  const dias = new Set<string>(); const naoMapeados = new Set<string>();
  let criadas = 0, atualizadas = 0;

  for (const l of brutas.slice(1)) {
    const sku = parseSku(l[ix("Id_Produto")]); if (!sku) continue;
    const data = parseData(l[ix("Data")]); if (!data) continue;
    dias.add(data);
    const operacao = limparTexto(l[ix("Operacao")]) ?? "";
    const idDoc = l[ix("Id_Doc")] != null ? String(l[ix("Id_Doc")]).trim() : null;
    const doc = l[ix("Doc")] != null ? String(l[ix("Doc")]).trim() : null;
    const qSai = parseDecimal(l[ix("Qtd_Sai")]), qEnt = parseDecimal(l[ix("Qtd_Ent")]);
    const descricao = ix("Descricao") >= 0 ? limparTexto(l[ix("Descricao")]) : null;
    const saldo = ix("Saldo") >= 0 ? parseDecimal(l[ix("Saldo")]) : null;
    linhasBrutas.push({ almoxarifado: almox, sku, descricao, data, operacao, id_doc: idDoc, doc, qtd_sai: qSai, qtd_ent: qEnt, saldo });
    if (operacao.toLowerCase().includes("inventario")) { conferencias.push({ almoxarifado: almox, data, sku, quantidade_ajustada: qSai || qEnt }); continue; }
    if (idDoc !== "INT" || !doc) continue;
    const par = parseOperacaoTransferencia(operacao); const k = `${doc}|${sku}`;
    let t = novas.get(k) ?? alteradas.get(k) ?? porDocSku.get(k);
    if (qSai > 0) {
      if (!t) { t = { sku, documento: doc, descricao }; novas.set(k, t); criadas++; } else { atualizadas++; if (!novas.has(k)) alteradas.set(k, t); }
      t.almoxarifado_origem = almox;
      if (par) { const destino = par[0] === almox ? par[1] : par[0]; if (destino.startsWith("NAO_MAPEADO__")) naoMapeados.add(destino.replace("NAO_MAPEADO__", "")); else if (destino) t.almoxarifado_destino = t.almoxarifado_destino || destino; }
      t.data_saida = data; t.quantidade = qSai;
    } else if (qEnt > 0) {
      if (!t) {
        let origem: string | null = null;
        if (par) { origem = par[1] === almox ? par[0] : par[1]; if (origem.startsWith("NAO_MAPEADO__")) { naoMapeados.add(origem.replace("NAO_MAPEADO__", "")); origem = null; } }
        t = { sku, documento: doc, descricao, almoxarifado_origem: origem, quantidade: qEnt }; novas.set(k, t); criadas++;
      } else { atualizadas++; if (!novas.has(k)) alteradas.set(k, t); }
      t.almoxarifado_destino = almox; t.data_entrada = data;
    }
  }

  progresso?.(`gravando ${linhasBrutas.length} movimentações brutas…`);
  const del = await sb.from("atlas_movimentacoes_brutas").delete().eq("almoxarifado", almox);
  if (del.error) throw new Error("Limpando o livro-caixa anterior: " + del.error.message);
  await inserirEmLotes("atlas_movimentacoes_brutas", linhasBrutas, (n) => progresso?.(`gravando movimentações brutas… ${n}/${linhasBrutas.length}`));
  await inserirEmLotes("atlas_conferencias_realizadas", conferencias);
  const campos = ["sku", "documento", "descricao", "almoxarifado_origem", "almoxarifado_destino", "data_saida", "data_entrada", "quantidade", "lote"];
  const limpar = (t: any) => Object.fromEntries(campos.filter((c) => c in t).map((c) => [c, t[c] ?? null]));
  await inserirEmLotes("atlas_transferencias", [...novas.values()].map(limpar));
  for (const t of alteradas.values()) { const { error } = await sb.from("atlas_transferencias").update(limpar(t)).eq("id", t.id); if (error) throw new Error("Transferência " + t.documento + ": " + error.message); }
  const { data: jaDias } = await sb.from("atlas_dias_operacionais").select("data").eq("almoxarifado", almox).in("data", [...dias]);
  const ja = new Set((jaDias ?? []).map((d: any) => String(d.data).slice(0, 10)));
  const novosDias = [...dias].filter((d) => !ja.has(d)).map((d) => ({ almoxarifado: almox, data: d }));
  await inserirEmLotes("atlas_dias_operacionais", novosDias);
  await registrarLog(ctx, "importar_movimentacao_bruta_sistema", { arquivo, almoxarifado: almox, conferencias: conferencias.length, transferencias: criadas + atualizadas });
  return { linhas: linhasBrutas.length, dias: novosDias.length, conferencias: conferencias.length, transfCriadas: criadas, transfAtualizadas: atualizadas, naoMapeados: [...naoMapeados].sort() };
}

// ---------- 3) Custos ----------
export type ResultadoCustos = { atualizados: number; ambiguos: string[]; naoEncontrados: string[] };

async function gravarCustos(custos: Map<string, number>, ctx: Contexto): Promise<{ atualizados: number; naoEncontrados: string[] }> {
  const naoEncontrados: string[] = []; let atualizados = 0;
  for (const [sku, custo] of custos) {
    if (!ctx.produtos.has(sku)) { naoEncontrados.push(sku); continue; }
    const { error } = await sb.from("atlas_produtos").update({ custo_unitario: custo }).eq("sku", sku);
    if (error) throw new Error(`Custo de ${sku}: ${error.message}`);
    ctx.produtos.get(sku)!.custo = custo; atualizados++;
  }
  return { atualizados, naoEncontrados };
}

/** Planilha de preço (explosão de ficha técnica com custo): só grava o SKU cujo custo é o mesmo em todas as ocorrências. */
export async function importarCustosPlanilhaPreco(p: Planilha, arquivo: string, aba: string, ctx: Contexto): Promise<ResultadoCustos> {
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const objs = comoObjetos(p.ler(aba));
  if (!objs.length || !("Id_item" in objs[0]) || !("custo" in objs[0])) throw new Error("Colunas obrigatórias 'Id_item' e 'custo' não encontradas.");
  const valores = new Map<string, Set<number>>();
  for (const o of objs) { const sku = parseSku(o.Id_item); if (!sku) continue; const c = Math.round(parseDecimal(o.custo) * 1e6) / 1e6; (valores.get(sku) ?? valores.set(sku, new Set()).get(sku)!).add(c); }
  const unicos = new Map<string, number>(); const ambiguos: string[] = [];
  for (const [sku, v] of valores) if (v.size > 1) ambiguos.push(sku); else unicos.set(sku, [...v][0]);
  const r = await gravarCustos(unicos, ctx);
  await registrarLog(ctx, "importar_custos_planilha_preco", { arquivo, atualizados: r.atualizados, ambiguos: ambiguos.length, nao_encontrados: r.naoEncontrados.length });
  return { ...r, ambiguos };
}

/** Duas colunas: sku, custo_unitario (CSV ou Excel). */
export async function importarCustosSimples(p: Planilha, arquivo: string, abaEscolhida: string | null, ctx: Contexto): Promise<ResultadoCustos & { erros: string[] }> {
  const aba = p.abas[0] === "CSV" ? "CSV" : abaEscolhida || p.abas[0];
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const linhas = p.ler(aba);
  const cab = (linhas[0] ?? []).map((c) => (c == null ? "" : String(c).trim().toLowerCase()));
  const iS = cab.indexOf("sku"), iC = cab.indexOf("custo_unitario");
  if (iS < 0 || iC < 0) throw new Error(`Colunas 'sku' e 'custo_unitario' não encontradas. Cabeçalho: ${cab.join(", ")}`);
  const custos = new Map<string, number>(); const erros: string[] = [];
  linhas.slice(1).forEach((l, i) => { try { const sku = parseSku(l[iS]); if (sku) custos.set(sku, parseDecimal(l[iC])); } catch (e: any) { erros.push(`linha ${i + 2}: ${e?.message ?? e}`); } });
  const r = await gravarCustos(custos, ctx);
  await registrarLog(ctx, "importar_custos", { arquivo, atualizados: r.atualizados });
  return { ...r, ambiguos: [], erros };
}

// ---------- 4) Dados de contexto (substituição completa a cada envio) ----------
export type FonteContexto = "faturamento" | "ficha_tecnica_bom" | "ordens_producao" | "consumo_op" | "transferencias";
export const FONTES_CONTEXTO: Record<FonteContexto, { nome: string; abaPadrao: string; tabela: string; acao: string }> = {
  faturamento: { nome: "Faturamento", abaPadrao: "Faturamento", tabela: "atlas_faturamento", acao: "importar_faturamento_excel" },
  ficha_tecnica_bom: { nome: "Ficha Técnica (BOM)", abaPadrao: "Planilha1", tabela: "atlas_ficha_tecnica_bom", acao: "importar_ficha_tecnica_bom_excel" },
  ordens_producao: { nome: "Ordens de Produção", abaPadrao: "Ops - PA", tabela: "atlas_ordens_producao", acao: "importar_ordens_producao_excel" },
  consumo_op: { nome: "Consumo de OP", abaPadrao: "OPs - Mat.P", tabela: "atlas_consumo_op", acao: "importar_consumo_op_excel" },
  transferencias: { nome: "Transferências", abaPadrao: "Transferencia", tabela: "atlas_transferencias", acao: "importar_transferencias_excel" },
};

/** Converte as linhas da planilha de contexto nas linhas da tabela (mesmo de-para do Atlas). */
export function linhasContexto(fonte: FonteContexto, objs: Record<string, unknown>[]): { linhas: Record<string, unknown>[]; ignorados: number } {
  const g = (o: Record<string, unknown>, k: string) => o[k] ?? null;
  const sn = (v: unknown) => String(v ?? "").trim().toUpperCase() === "S";
  let ignorados = 0;
  const linhas: Record<string, unknown>[] = [];
  for (const o of objs) {
    switch (fonte) {
      case "faturamento": if (!g(o, "SKU")) { ignorados++; break; }
        linhas.push({ sku: parseSku(o.SKU), origem: limparTexto(o.Origem), data_faturamento: parseData(o.Data), quantidade: parseDecimal(o.Quantidade), descricao: limparTexto(o.Descricao) }); break;
      case "ficha_tecnica_bom": if (!g(o, "Id_produto") || !g(o, "Id_item")) { ignorados++; break; }
        linhas.push({ sku_produto_final: parseSku(o.Id_produto), produto_final: limparTexto(o.Produto), sku_subconjunto: parseSku(o.Id_subconjunto), subconjunto: limparTexto(o.Subconjunto), sku_item: parseSku(o.Id_item), descricao_item: limparTexto(o.item), qtd_padrao: parseDecimal(o.Qtd), unidade: limparTexto(o.item_Unidade), custo: o.custo == null ? null : parseDecimal(o.custo), tem_filho: sn(o.Tem_Filho), gera_oc: sn(o.Gera_Oc), categoria: limparTexto(o.Grupo), linha_producao: limparTexto(o.Linha) }); break;
      case "ordens_producao": if (g(o, "Número da OP") == null) { ignorados++; break; }
        linhas.push({ numero_op: String(o["Número da OP"]).trim(), sku_produto_final: parseSku(o["SKU Produto Final"]), descricao_produto: limparTexto(o.Desc_Prod), data_registro: parseData(o.Dt_Registro), data_producao: parseData(o.Dt_Producao), status: limparTexto(o.Status), qtd_prevista: parseDecimal(o.Qtd_Prevista), qtd_produzida: parseDecimal(o.Qtd_Prod), qtd_saldo: parseDecimal(o.Qtd_Saldo) }); break;
      case "consumo_op": if (g(o, "Número da OP") == null) { ignorados++; break; }
        linhas.push({ numero_op: String(o["Número da OP"]).trim(), sku_produto_final: parseSku(o["SKU Produto Final"]), sku_material: parseSku(o.Material), descricao_material: limparTexto(o.Desc_Material), qtd_consumo: parseDecimal(o.qtd_consumo), qtd_previsto: parseDecimal(o.Qtd_Previsto), qtd_diferenca: parseDecimal(o.Qtd_Dif), data_registro: parseData(o.Dt_Registro), data_producao: parseData(o.Dt_Producao), status: limparTexto(o.Status) }); break;
      case "transferencias": if (!g(o, "SKU")) { ignorados++; break; }
        linhas.push({ sku: parseSku(o.SKU), descricao: limparTexto(o.descricao), data_saida: parseData(o["Data de Saída"]), data_entrada: parseData(o["Data de Entrada"]), documento: o.doc == null ? null : String(o.doc), almoxarifado_origem: o["Almoxarifado de Origem"] ? normalizarAlmoxarifado(o["Almoxarifado de Origem"]) : null, almoxarifado_destino: o["Almoxarifado de Destino"] ? normalizarAlmoxarifado(o["Almoxarifado de Destino"]) : null, quantidade: parseDecimal(o.Quantidade), lote: limparTexto(o.lote) }); break;
    }
  }
  // OP repetida na planilha: a chave da tabela é o número da OP — fica a última ocorrência (o Atlas falharia na duplicata)
  if (fonte === "ordens_producao") { const m = new Map(linhas.map((l) => [l.numero_op, l])); return { linhas: [...m.values()], ignorados: ignorados + (linhas.length - m.size) }; }
  return { linhas, ignorados };
}

export async function importarContexto(fonte: FonteContexto, p: Planilha, arquivo: string, abaEscolhida: string | null, ctx: Contexto, progresso?: (txt: string) => void) {
  const cfg = FONTES_CONTEXTO[fonte];
  const aba = abaEscolhida || cfg.abaPadrao;
  if (!p.abas.includes(aba)) throw new Error(`Aba '${aba}' não encontrada. Abas: ${p.abas.join(", ")}`);
  const { linhas, ignorados } = linhasContexto(fonte, comoObjetos(p.ler(aba)));
  if (!linhas.length) throw new Error("Nenhuma linha válida na aba — confira se é a aba certa.");
  progresso?.("substituindo os dados anteriores…");
  const chave = fonte === "ordens_producao" ? "numero_op" : "id";
  const del = fonte === "ordens_producao" ? await sb.from(cfg.tabela).delete().neq(chave, "") : await sb.from(cfg.tabela).delete().gte(chave, 0);
  if (del.error) throw new Error("Limpando os dados anteriores: " + del.error.message);
  await inserirEmLotes(cfg.tabela, linhas, (n) => progresso?.(`gravando… ${n}/${linhas.length}`));
  await registrarLog(ctx, cfg.acao, { arquivo, linhas: linhas.length, ignorados });
  return { linhas: linhas.length, ignorados };
}
