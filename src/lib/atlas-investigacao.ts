// Motor de investigação das divergências do Atlas (investigation.py + feature_extraction.py + baixas_operacionais.py),
// portado para TypeScript. Parte pura (investigar/reconciliar sobre uma "Base" já carregada) separada da parte que lê e
// grava no banco, para dar para testar com o backup.
//
// Diferença em relação ao Atlas: o modelo estatístico (Random Forest em Python) ainda não roda aqui — reconciliar() recebe
// só o motor de regras, então hipotese_ia = hipótese de regras. A distribuição e a confiança seguem o mesmo cálculo.
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

// ---------- constantes do Atlas ----------
export const PESO_MIN = 5, PESO_MAX = 60, INCREMENTO_ACERTO = 2, DECREMENTO_ERRO = 2;
const JANELA_DIAS_ANTES = 1, JANELA_DIAS_DEPOIS = 4;
const TOL_CORRELACAO = 0.5, TOL_CORRELACAO_PESO_CHEIO = 0.2;
export const RESPONSAVEL_AUTOMATICO = "Integração Lovable (automático)";

/** motivo_baixa_id (tabela motivo_baixa do Stock Savvy) → hipótese do Atlas. */
export const MOTIVO_PARA_HIPOTESE: Record<string, [string, string]> = {
  "9717e486-c7a0-4b3d-9515-272f28adbebd": ["Avaria_Perda", "Avaria"],
  "4ec6b21a-0744-44c7-a435-fba22872112d": ["Cortesia_Amostra", "Cortesia"],
  "11a201ee-9bd3-4eb9-80a7-cd7727d358b6": ["Degustacao_Amostra", "Degustação"],
  "55187d01-d362-4a9f-9a5f-ad8b5cf9925f": ["Descarte_Operacional", "Descarte/Qualidade"],
  "e5e043a9-20a5-43ea-9cc5-80de2e903bfd": ["Envio_Laboratorio_Analise", "Envio/Laboratório"],
  "2490f52b-9f3b-4045-9eb0-f65ce33788b7": ["Perda_Furto_Registrado", "Perda/Furto"],
  "94fae356-5f30-4d9d-a273-bcd552a396f4": ["Uso_Consumo_Interno", "Uso e Consumo"],
  "de203fd3-dd2b-4662-bbdc-633c7412d48b": ["Vencimento_Produto", "Vencimento"],
  "484912e6-d10e-48fe-8d73-987fe0b53dd0": ["Amostra_Sensorial_Inovacao", "Sensorial/Inovações"],
};
/** id_local da baixa (Almox do Stock Savvy) → código do almoxarifado no Atlas. */
export const ALMOX_SS_PARA_ATLAS: Record<string, string> = {
  Alm_SP_Processo: "Almox_SP_Processo", Alm_SP_Loja: "Almox_SP_Loja", Alm_SP_Fabrica: "Almox_SP_Fabrica", Alm_PDV_Ativacao: "Almox_SP_Ativacao",
  Alm_SP_Qualidade: "Almox_SP_Qualidade", Alm_Degustacao: "Almox_SP_Degustacao", Alm_Para: "Almox_PA_Para", Alm_Paulista: "Almox_SP_PatioPaulista",
};

// palavras da coluna Obs da planilha → hipótese (hipoteses_config.PALAVRAS_CHAVE_OBSERVACAO)
const PALAVRAS_OBS: [string, string[]][] = [
  ["Avaria_Perda", ["avaria", "avariad", "quebrad", "danificad"]],
  ["Perda_Nao_Identificada", ["furto", "roubo", "sumiu", "desapareceu"]],
  ["Transferencia_Pendente", ["transf.", "transferencia pendente", "transferência pendente", "no radar do estoque", "aguardando transferencia"]],
  ["Consumo_Parcial_OP", ["consumo interno", "consumo parcial", "consumido em"]],
  ["Producao_Nao_Encerrada", ["op nao encerrada", "op não encerrada", "producao em andamento", "produção em andamento", "aguardando apontamento"]],
  ["Pendencia_Faturamento", ["pendente faturamento", "nota fiscal", "nf pendente", "aguardando faturamento"]],
  ["Erro_Fiscal", ["nf cancelada", "nota cancelada", "erro fiscal"]],
  ["Falha_Inventario", ["recontagem", "recontar", "erro de contagem", "contagem incorreta"]],
  ["Ajuste_Manual_Incorreto", ["ajuste pendente", "ajuste incorreto", "pendente de baixa", "pendentes de baixa", "aguardando ajuste"]],
  ["Movimentacao_Duplicada", ["duplicad", "lancado duas vezes", "lançado duas vezes"]],
  ["Conversao_Unidade_Incorreta", ["conversao de unidade", "conversão de unidade", "unidade errada", "unidade incorreta"]],
  ["Divergencia_Ficha_Tecnica", ["ficha tecnica", "ficha técnica", "bom desatualizada"]],
  ["Erro_Cadastro", ["erro de cadastro", "lote incorreto", "cadastro incorreto", "sku incorreto"]],
  ["Sem_Divergencia_Real", ["falso positivo", "sem divergencia real", "recontado sem diferenca", "ok apos recontagem"]],
];
const semAcento = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function evidenciasTexto(obs: string | null | undefined): [string, string][] {
  if (!obs) return [];
  const t = semAcento(obs); const out: [string, string][] = [];
  for (const [cod, palavras] of PALAVRAS_OBS) for (const p of palavras) if (t.includes(semAcento(p))) { out.push([cod, p]); break; }
  return out;
}

// de-para de almoxarifado do faturamento (normalizar_almoxarifado do Atlas)
const DE_PARA_ALMOX: [string, string][] = [
  ["processo", "Almox_SP_Processo"], ["qualidade", "Almox_SP_Qualidade"], ["ativa", "Almox_SP_Ativacao"], ["degusta", "Almox_SP_Degustacao"],
  ["box2", "Almox_Box_2"], ["box 2", "Almox_Box_2"], ["box", "Almox_Box"], ["loja", "Almox_SP_Loja"], ["paulista", "Almox_SP_PatioPaulista"],
  ["par", "Almox_PA_Para"], ["geral", "Almox_SP_Fabrica"], ["frabrica", "Almox_SP_Fabrica"], ["frabica", "Almox_SP_Fabrica"], ["fabrica", "Almox_SP_Fabrica"],
];
export function normalizarAlmox(v: string | null | undefined): string {
  if (v == null) return "NAO_MAPEADO__vazio";
  const l = String(v).trim().toLowerCase();
  for (const [k, c] of DE_PARA_ALMOX) if (l.includes(k)) return c;
  return `NAO_MAPEADO__${String(v).trim()}`;
}

// ---------- tipos ----------
export type Div = {
  id: number; sku: string; almoxarifado: string; categoria_produto: string | null; data_deteccao: string; saldo_sistema: number | null;
  divergencia_qtd: number; valor_estimado: number | null; status: string; observacao_origem: string | null; hipotese_regras?: string | null;
  hipotese_confirmada?: string | null; origem?: string | null;
};
export type Baixa = { origem_id: string; sku: string; almoxarifado: string; hipotese: string | null; motivo: string; status: string; quantidade: number; data: string; solicitante: string | null; vinculada: number | null };
export type Evidencia = { hipotese: string; verificacao: string; encontrado: boolean; peso_aplicado: number };

/** Tudo o que o motor precisa, carregado uma vez (vale para uma divergência ou para um lote). */
export type Base = {
  pesos: Map<string, number>;
  descricoes: Map<string, string | null>;
  transfPendentes: { sku: string; origem: string | null; destino: string | null }[];
  pedidosPendentes: Map<string, number>;          // `${sku}|${almox}` → saldo pendente
  opsAbertas: Set<string>;                         // sku_produto_final com OP != Produzida
  consumoDivergente: Set<string>;                  // sku_material com qtd_diferenca != 0
  bom: Map<string, boolean>;                       // sku_item → gera_oc
  faturamento: Map<string, { data: string; origem: string | null }[]>;
  resolvidas: { id: number; sku: string; almoxarifado: string; data: string; hipotese: string | null; qtd: number | null; valor: number | null; solucao: string | null; responsavel: string | null }[];
  historicoConfirmado: { sku: string; almoxarifado: string; categoria: string | null; data: string; hipotese: string; qtd: number | null; valor: number | null }[];
  baixas: Baixa[];
};

const dias = (a: string, b: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);
const somaDias = (d: string, n: number) => { const x = new Date(d.slice(0, 10) + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- baixas ----------
export function baixaCompativel(base: Base, d: Div): Baixa | null {
  const c = base.baixas.filter((b) => b.vinculada == null && b.sku === d.sku && b.almoxarifado === d.almoxarifado && (() => { const df = dias(d.data_deteccao, b.data); return df >= -JANELA_DIAS_DEPOIS && df <= JANELA_DIAS_ANTES; })());
  c.sort((a, b) => Math.abs(dias(d.data_deteccao, a.data)) - Math.abs(dias(d.data_deteccao, b.data)));
  return c[0] ?? null;
}
export function correlacaoPendentes(base: Base, d: Pick<Div, "sku" | "almoxarifado" | "divergencia_qtd">) {
  if (!d.divergencia_qtd || d.divergencia_qtd >= 0) return null;
  const pend = base.baixas.filter((b) => b.status === "PENDENTE" && b.sku === d.sku && b.almoxarifado === d.almoxarifado);
  if (!pend.length) return null;
  const soma = pend.reduce((a, b) => a + (b.quantidade || 0), 0), falta = Math.abs(d.divergencia_qtd), maior = Math.max(falta, soma);
  const dif = maior ? Math.abs(falta - soma) / maior : 1;
  if (dif > TOL_CORRELACAO) return null;
  return { baixas: pend, soma, falta, dif: Math.round(dif * 10000) / 10000, bem: dif <= TOL_CORRELACAO_PESO_CHEIO };
}
/** Texto do aviso de baixa pendente (buscar_avisos_baixa_pendente do Atlas). */
export function avisoBaixaPendente(base: Base, d: Div): string | null {
  if (d.status === "Resolvida") return null;
  const c = correlacaoPendentes(base, d); if (!c) return null;
  const motivos = [...new Set(c.baixas.map((b) => b.motivo).filter(Boolean))].sort().join(", ");
  const sol = [...new Set(c.baixas.map((b) => b.solicitante).filter(Boolean))].sort().join(", ") || "não informado";
  const pl = c.baixas.length > 1 ? "s" : "";
  return `Há ${c.baixas.length} baixa${pl} pendente${pl} de aprovação no Relatório de Baixa ('${motivos}', solicitada${pl} por ${sol}), somando ${c.soma} unidade(s) — quantidade ${c.bem ? "compatível" : "parcialmente compatível"} com esta divergência (${c.falta} un.). Se aprovada${pl}, a divergência é resolvida automaticamente.`;
}

// ---------- sinais de contexto (feature_extraction.py) ----------
export function sinaisContexto(base: Base, d: Div) {
  const s = {
    tem_transferencia_pendente: base.transfPendentes.some((t) => t.sku === d.sku && (t.origem === d.almoxarifado || t.destino === d.almoxarifado)),
    tem_pedido_compra_pendente: d.divergencia_qtd < 0 && (base.pedidosPendentes.get(`${d.sku}|${d.almoxarifado}`) ?? 0) > 0,
    tem_op_aberta: base.opsAbertas.has(d.sku),
    tem_consumo_divergente_bom: base.consumoDivergente.has(d.sku),
    e_item_de_ficha_tecnica: base.bom.has(d.sku),
    item_gera_oc: base.bom.get(d.sku) ?? false,
    tem_faturamento_proximo: false,
    tem_faturamento_mesmo_almoxarifado: false,
  };
  if (d.data_deteccao) {
    const ini = somaDias(d.data_deteccao, -5), fim = somaDias(d.data_deteccao, 5);
    const prox = (base.faturamento.get(d.sku) ?? []).filter((f) => f.data >= ini && f.data <= fim);
    s.tem_faturamento_proximo = prox.length > 0;
    s.tem_faturamento_mesmo_almoxarifado = prox.some((f) => f.origem && normalizarAlmox(f.origem) === d.almoxarifado);
  }
  return s;
}

// ---------- investigar (investigation.py) ----------
export type Resultado = {
  evidencias: Evidencia[]; scores: Record<string, number>; hipotese_regras: string | null; confianca_regras: number | null;
  casos_similares: Record<string, unknown>[]; baixa_aprovada: Baixa | null;
};

export function investigar(base: Base, d: Div): Resultado {
  const peso = (h: string) => base.pesos.get(h) ?? 20;
  const ev: Evidencia[] = []; const scores: Record<string, number> = {};
  const registrar = (h: string, nome: string, achou: boolean, p?: number) => {
    const pp = p ?? peso(h);
    ev.push({ hipotese: h, verificacao: nome, encontrado: !!achou, peso_aplicado: achou ? pp : 0 });
    if (achou) scores[h] = (scores[h] ?? 0) + pp;
  };

  // 0) observação da planilha
  for (const [h, p] of evidenciasTexto(d.observacao_origem)) registrar(h, `observacao_planilha_menciona('${p}')`, true);

  // 0b) baixa APROVADA compatível (SKU + almox + janela de data) — resolve automaticamente
  let baixaAprovada: Baixa | null = null;
  const b = baixaCompativel(base, d);
  if (b && b.hipotese && b.status === "APROVADA") {
    registrar(b.hipotese, `baixa_operacional_aprovada_compativel('${b.motivo}', qtd ${b.quantidade})`, true, peso(b.hipotese) * 3);
    if (d.status !== "Resolvida") baixaAprovada = b;
  }

  // 0c) baixas PENDENTES correlacionadas (almox × item × quantidade, sem data)
  const corr = correlacaoPendentes(base, d);
  if (corr) {
    const cont = new Map<string, number>();
    for (const x of corr.baixas) if (x.hipotese) cont.set(x.hipotese, (cont.get(x.hipotese) ?? 0) + 1);
    if (cont.size) {
      const dom = [...cont.entries()].sort((a, b) => b[1] - a[1])[0][0];
      registrar(dom, `baixa_operacional_pendente_correlacionada(soma_qtd_pendente=${corr.soma}, diferenca_relativa=${r1(corr.dif * 100)}%)`, true, peso(dom) * (corr.bem ? 1.75 : 1.1));
    }
  }

  const s = sinaisContexto(base, d);
  registrar("Transferencia_Pendente", "transferencia_sem_entrada_correspondente", s.tem_transferencia_pendente);

  let pesoPedido: number | undefined;
  if (s.tem_pedido_compra_pendente) {
    const pend = base.pedidosPendentes.get(`${d.sku}|${d.almoxarifado}`) ?? 0; const falta = Math.abs(d.divergencia_qtd || 0);
    const dif = pend ? Math.abs(falta - pend) / pend : 1;
    pesoPedido = dif <= 0.2 ? peso("Pedido_Compra_Pendente") : peso("Pedido_Compra_Pendente") * 0.5;
  }
  registrar("Pedido_Compra_Pendente", "pedido_compra_em_aberto_com_saldo_pendente_compativel", s.tem_pedido_compra_pendente, pesoPedido);

  registrar("Consumo_Parcial_OP", "op_aberta_para_sku", s.tem_op_aberta);
  registrar("Consumo_Parcial_OP", "consumo_diferente_do_previsto_ficha_tecnica", s.tem_consumo_divergente_bom, peso("Consumo_Parcial_OP") * 0.5);

  const pesoFat = s.tem_faturamento_proximo ? (s.tem_faturamento_mesmo_almoxarifado ? peso("Pendencia_Faturamento") : peso("Pendencia_Faturamento") * 0.5) : undefined;
  registrar("Pendencia_Faturamento", "faturamento_proximo_a_data_deteccao" + (s.tem_faturamento_mesmo_almoxarifado ? " (mesmo_almoxarifado)" : ""), s.tem_faturamento_proximo, pesoFat);

  registrar("Divergencia_Ficha_Tecnica", "sku_e_item_de_ficha_tecnica_com_consumo_divergente", s.e_item_de_ficha_tecnica && s.tem_consumo_divergente_bom, peso("Divergencia_Ficha_Tecnica") * 0.6);

  // 5) reincidência: mesmo SKU ou almox resolvido nos 90 dias anteriores
  const janela = somaDias(d.data_deteccao, -90);
  const cont = new Map<string, number>();
  for (const r of base.resolvidas) if (r.data >= janela && r.data < d.data_deteccao && (r.sku === d.sku || r.almoxarifado === d.almoxarifado) && r.hipotese) cont.set(r.hipotese, (cont.get(r.hipotese) ?? 0) + 1);
  if (cont.size) { const top = [...cont.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]; registrar(top, "reincidencia_sku_ou_almoxarifado_90_dias", true, peso(top) * 0.4); }

  // 6) nenhuma evidência documental → falha de inventário; 7) pequena → erro operacional
  const nenhuma = !ev.some((e) => e.encontrado);
  registrar("Falha_Inventario", "ausencia_de_qualquer_documento_associado", nenhuma);
  const base0 = Math.abs(d.saldo_sistema || 0);
  const pequena = Math.abs(d.divergencia_qtd) <= 2 || (base0 > 0 && Math.abs(d.divergencia_qtd) / base0 <= 0.01);
  registrar("Erro_Operacional", "divergencia_pequena_sem_documento", pequena && nenhuma);

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const norm: Record<string, number> = total > 0 ? Object.fromEntries(Object.entries(scores).map(([h, v]) => [h, r1((v / total) * 100)])) : {};
  let top: string | null = null;
  for (const [h, v] of Object.entries(norm)) if (top === null || v > norm[top]) top = h;
  return { evidencias: ev, scores: norm, hipotese_regras: top, confianca_regras: top ? norm[top] : null, casos_similares: casosSimilares(base, d), baixa_aprovada: baixaAprovada };
}

function casosSimilares(base: Base, d: Div, limite = 8) {
  const res: Record<string, unknown>[] = [];
  const h = base.historicoConfirmado.filter((x) => x.sku === d.sku).sort((a, b) => b.data.localeCompare(a.data)).slice(0, limite);
  for (const c of h) res.push({ sku: c.sku, hipotese_confirmada: c.hipotese, data: c.data, criterio: "mesmo_sku", almoxarifado: c.almoxarifado, divergencia_qtd: c.qtd, valor: c.valor, fonte: "historico" });
  const r = base.resolvidas.filter((x) => x.sku === d.sku && x.hipotese && x.id !== d.id).sort((a, b) => b.data.localeCompare(a.data)).slice(0, limite);
  for (const c of r) res.push({ sku: c.sku, hipotese_confirmada: c.hipotese, data: c.data, criterio: "mesmo_sku", almoxarifado: c.almoxarifado, divergencia_qtd: c.qtd, valor: c.valor, fonte: "divergencia_resolvida", solucao_aplicada: c.solucao, responsavel: c.responsavel });
  res.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const out = res.slice(0, limite);
  if (out.length < limite) {
    const sim = base.historicoConfirmado.filter((x) => x.categoria === d.categoria_produto && x.almoxarifado === d.almoxarifado && x.sku !== d.sku).sort((a, b) => b.data.localeCompare(a.data)).slice(0, limite - out.length);
    for (const c of sim) out.push({ sku: c.sku, hipotese_confirmada: c.hipotese, data: c.data, criterio: "categoria_e_almoxarifado_semelhantes", almoxarifado: c.almoxarifado, divergencia_qtd: c.qtd, valor: c.valor, fonte: "historico" });
  }
  for (const c of out) c.descricao_produto = base.descricoes.get(String(c.sku)) ?? null;
  return out;
}

/** Funde regras e modelo (peso 50/50). Sem modelo, a hipótese final é a de regras com metade do score, como no Atlas. */
export function reconciliar(scoresRegras: Record<string, number>, distribuicaoML: { hipotese: string; confianca: number }[] = [], pesoRegras = 0.5): [string | null, number | null] {
  const comb = new Map<string, number>();
  for (const [h, v] of Object.entries(scoresRegras ?? {})) comb.set(h, (comb.get(h) ?? 0) + v * pesoRegras);
  for (const i of distribuicaoML) comb.set(i.hipotese, (comb.get(i.hipotese) ?? 0) + i.confianca * (1 - pesoRegras));
  if (!comb.size) return [null, null];
  let top: string | null = null;
  for (const [h, v] of comb) if (top === null || v > comb.get(top)!) top = h;
  return [top, r1(comb.get(top!)!)];
}

// ---------- carregamento da Base ----------
async function lerTudo<T>(tabela: string, colunas: string, filtro?: (q: any) => any, ordem = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(colunas).order(ordem).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Baixas do Relatório de Baixa do Stock Savvy (tabela viva) + vínculo já feito com divergências (atlas_baixas_operacionais). */
async function carregarBaixas(): Promise<Baixa[]> {
  const [vivas, hist] = await Promise.all([
    lerTudo<any>("baixa_operacional", "id, codigo_produto, id_local, motivo_baixa_id, quantidade, status_fluxo, data_ocorrencia, data_solicitacao, responsavel_nome").catch(() => [] as any[]),
    lerTudo<any>("atlas_baixas_operacionais", "origem_id, sku, almoxarifado, hipotese_aplicada, motivo_baixa_bruto, status_fluxo, quantidade, data_baixa, solicitante_nome, divergencia_vinculada_id"),
  ]);
  const porOrigem = new Map<string, Baixa>();
  for (const h of hist) if (h.origem_id) porOrigem.set(String(h.origem_id), { origem_id: String(h.origem_id), sku: h.sku, almoxarifado: h.almoxarifado, hipotese: h.hipotese_aplicada, motivo: h.motivo_baixa_bruto ?? "", status: h.status_fluxo, quantidade: Number(h.quantidade) || 0, data: String(h.data_baixa ?? "").slice(0, 10), solicitante: h.solicitante_nome, vinculada: h.divergencia_vinculada_id });
  for (const v of vivas) {
    const m = v.motivo_baixa_id ? MOTIVO_PARA_HIPOTESE[String(v.motivo_baixa_id)] : undefined;
    if (!v.codigo_produto || !v.id_local || !m) continue;
    const ant = porOrigem.get(String(v.id));
    porOrigem.set(String(v.id), {
      origem_id: String(v.id), sku: String(v.codigo_produto), almoxarifado: ALMOX_SS_PARA_ATLAS[v.id_local] ?? `NAO_MAPEADO__${v.id_local}`, hipotese: m[0], motivo: m[1],
      status: v.status_fluxo, quantidade: Number(v.quantidade) || 0, data: String(v.data_ocorrencia || v.data_solicitacao || "").slice(0, 10), solicitante: v.responsavel_nome, vinculada: ant?.vinculada ?? null,
    });
  }
  return [...porOrigem.values()].filter((b) => b.data);
}

export async function carregarBase(): Promise<Base> {
  const [hip, prod, transf, pedidos, receb, ops, consumo, bom, fat, divs, hist, baixas] = await Promise.all([
    lerTudo<any>("atlas_hipoteses", "codigo, peso_padrao", undefined, "codigo"),
    lerTudo<any>("atlas_produtos", "sku, descricao", undefined, "sku"),
    lerTudo<any>("atlas_transferencias", "sku, almoxarifado_origem, almoxarifado_destino", (q) => q.is("data_entrada", null)),
    lerTudo<any>("atlas_pedidos_compra", "id, sku, almoxarifado_destino, quantidade_pedida, status", (q) => q.in("status", ["Aberto", "Parcialmente_Recebido"])),
    lerTudo<any>("atlas_recebimentos_pedido", "pedido_id, quantidade_recebida"),
    lerTudo<any>("atlas_ordens_producao", "sku_produto_final, status", undefined, "numero_op"),
    lerTudo<any>("atlas_consumo_op", "sku_material", (q) => q.neq("qtd_diferenca", 0)),
    lerTudo<any>("atlas_ficha_tecnica_bom", "sku_item, gera_oc"),
    lerTudo<any>("atlas_faturamento", "sku, data_faturamento, origem"),
    lerTudo<any>("atlas_divergencias", "id, sku, almoxarifado, data_deteccao, hipotese_confirmada, divergencia_qtd, valor_estimado, solucao_aplicada, responsavel", (q) => q.eq("status", "Resolvida")),
    lerTudo<any>("atlas_movimentacoes_historico", "sku, almoxarifado, categoria_produto, data_movimento, hipotese_confirmada, divergencia, valor_divergencia", (q) => q.not("hipotese_confirmada", "is", null)),
    carregarBaixas(),
  ]);
  const recebido = new Map<number, number>();
  for (const r of receb) recebido.set(r.pedido_id, (recebido.get(r.pedido_id) ?? 0) + (Number(r.quantidade_recebida) || 0));
  const pedidosPendentes = new Map<string, number>();
  for (const p of pedidos) { const k = `${p.sku}|${p.almoxarifado_destino}`; pedidosPendentes.set(k, (pedidosPendentes.get(k) ?? 0) + Math.max(0, (Number(p.quantidade_pedida) || 0) - (recebido.get(p.id) ?? 0))); }
  const bomMap = new Map<string, boolean>();
  for (const b of bom) if (!bomMap.has(b.sku_item)) bomMap.set(b.sku_item, !!b.gera_oc);
  const fatMap = new Map<string, { data: string; origem: string | null }[]>();
  for (const f of fat) { if (!f.sku || !f.data_faturamento) continue; (fatMap.get(f.sku) ?? fatMap.set(f.sku, []).get(f.sku)!).push({ data: String(f.data_faturamento).slice(0, 10), origem: f.origem }); }
  return {
    pesos: new Map(hip.map((h: any) => [h.codigo, Number(h.peso_padrao ?? 20)])),
    descricoes: new Map(prod.map((p: any) => [p.sku, p.descricao])),
    transfPendentes: transf.map((t: any) => ({ sku: t.sku, origem: t.almoxarifado_origem, destino: t.almoxarifado_destino })),
    pedidosPendentes,
    opsAbertas: new Set(ops.filter((o: any) => o.status !== "Produzida").map((o: any) => o.sku_produto_final)),
    consumoDivergente: new Set(consumo.map((c: any) => c.sku_material)),
    bom: bomMap, faturamento: fatMap,
    resolvidas: divs.map((x: any) => ({ id: x.id, sku: x.sku, almoxarifado: x.almoxarifado, data: String(x.data_deteccao ?? "").slice(0, 10), hipotese: x.hipotese_confirmada, qtd: x.divergencia_qtd, valor: x.valor_estimado, solucao: x.solucao_aplicada, responsavel: x.responsavel })),
    historicoConfirmado: hist.map((x: any) => ({ sku: x.sku, almoxarifado: x.almoxarifado, categoria: x.categoria_produto, data: String(x.data_movimento ?? "").slice(0, 10), hipotese: x.hipotese_confirmada, qtd: x.divergencia, valor: x.valor_divergencia })),
    baixas,
  };
}

// ---------- gravação ----------
async function logAtlas(usuario: string, acao: string, detalhes: Record<string, unknown>, entidadeId?: number) {
  await sb.from("atlas_log_auditoria").insert({ username: usuario, acao, entidade: entidadeId != null ? "divergencia" : null, entidade_id: entidadeId != null ? String(entidadeId) : null, detalhes, criado_em: new Date().toISOString() });
}

/** Ajusta o peso da hipótese que o motor de regras sugeriu (loop de aprendizado do Atlas). */
async function ajustarPeso(base: Base, hipoteseRegras: string | null | undefined, confirmada: string) {
  if (!hipoteseRegras || !base.pesos.has(hipoteseRegras)) return;
  const atual = base.pesos.get(hipoteseRegras)!;
  const novo = hipoteseRegras === confirmada ? Math.min(PESO_MAX, atual + INCREMENTO_ACERTO) : Math.max(PESO_MIN, atual - DECREMENTO_ERRO);
  base.pesos.set(hipoteseRegras, novo);
  await sb.from("atlas_hipoteses").update({ peso_padrao: novo }).eq("codigo", hipoteseRegras);
}

/** Resolve uma divergência: confirma hipótese, aprende (peso + caso para o modelo) e registra. */
export async function resolverDivergencia(base: Base, d: Div, hipotese: string, solucao: string | null, responsavel: string, tempoMin: number | null, usuario: string, extra: Record<string, unknown> = {}) {
  const { error } = await sb.from("atlas_divergencias").update({ hipotese_confirmada: hipotese, solucao_aplicada: solucao, responsavel, tempo_resolucao_minutos: tempoMin, status: "Resolvida", resolvido_em: new Date().toISOString(), ...extra }).eq("id", d.id);
  if (error) throw new Error(`Divergência #${d.id}: ${error.message}`);
  await ajustarPeso(base, d.hipotese_regras, hipotese);
  await sb.from("atlas_casos_ml_feedback").insert({ divergencia_id: d.id, sku: d.sku, almoxarifado: d.almoxarifado, categoria_produto: d.categoria_produto, divergencia_qtd: d.divergencia_qtd, valor_estimado: d.valor_estimado, data_deteccao: d.data_deteccao, hipotese_confirmada: hipotese, criado_em: new Date().toISOString() });
  base.resolvidas.push({ id: d.id, sku: d.sku, almoxarifado: d.almoxarifado, data: d.data_deteccao, hipotese, qtd: d.divergencia_qtd, valor: d.valor_estimado, solucao, responsavel });
}

/** Roda o motor e grava o diagnóstico; se houver baixa APROVADA compatível, resolve automaticamente. */
export async function investigarEGravar(base: Base, d: Div, usuario: string): Promise<{ hipotese: string | null; confianca: number | null; resolvidaPorBaixa: boolean }> {
  const r = investigar(base, d);
  const [hip, conf] = reconciliar(r.scores);
  const { error } = await sb.from("atlas_divergencias").update({
    hipotese_regras: r.hipotese_regras, confianca_regras: r.confianca_regras, evidencias: r.evidencias, casos_similares: r.casos_similares,
    hipotese_ml: null, confianca_ml: null, distribuicao_probabilidades: Object.entries(r.scores).map(([hipotese, confianca]) => ({ hipotese, confianca })).sort((a, b) => b.confianca - a.confianca),
    hipotese_ia: hip, confianca_ia: conf,
  }).eq("id", d.id);
  if (error) throw new Error(`Divergência #${d.id}: ${error.message}`);
  let resolvidaPorBaixa = false;
  if (r.baixa_aprovada) {
    const b = r.baixa_aprovada;
    await resolverDivergencia(base, { ...d, hipotese_regras: r.hipotese_regras }, b.hipotese!, `Baixa de '${b.motivo}' aprovada no Relatório de Baixa, casada automaticamente.`, RESPONSAVEL_AUTOMATICO, null, usuario);
    await sb.from("atlas_baixas_operacionais").upsert({ origem_id: b.origem_id, sku: b.sku, almoxarifado: b.almoxarifado, hipotese_aplicada: b.hipotese, motivo_baixa_bruto: b.motivo, status_fluxo: b.status, quantidade: b.quantidade, data_baixa: b.data, solicitante_nome: b.solicitante, divergencia_vinculada_id: d.id, atualizado_em: new Date().toISOString() }, { onConflict: "origem_id" });
    b.vinculada = d.id; resolvidaPorBaixa = true;
  }
  return { hipotese: hip, confianca: conf, resolvidaPorBaixa };
}

export const COLS_DIV = "id, sku, almoxarifado, categoria_produto, data_deteccao, saldo_sistema, divergencia_qtd, valor_estimado, status, observacao_origem, hipotese_regras, hipotese_confirmada, origem";
export const normDiv = (x: any): Div => ({ ...x, data_deteccao: String(x.data_deteccao ?? "").slice(0, 10), divergencia_qtd: Number(x.divergencia_qtd) || 0 });

/** Investiga em lote (ex.: as divergências de uma importação, ou as que nunca tiveram diagnóstico). */
export async function investigarLote(filtro: (q: any) => any, usuario: string, progresso?: (feitas: number, total: number) => void) {
  const base = await carregarBase();
  const divs = (await lerTudo<any>("atlas_divergencias", COLS_DIV, filtro)).map(normDiv);
  let ok = 0, porBaixa = 0; const erros: string[] = [];
  for (const [i, d] of divs.entries()) {
    try { const r = await investigarEGravar(base, d, usuario); ok++; if (r.resolvidaPorBaixa) porBaixa++; }
    catch (e: any) { erros.push(e?.message ?? String(e)); }
    if (i % 10 === 0) progresso?.(i + 1, divs.length);
  }
  await logAtlas(usuario, "reinvestigar_falhas_em_lote", { total_afetadas: divs.length, corrigidas: ok, resolvidas_por_baixa: porBaixa, ainda_com_erro: erros.length });
  return { total: divs.length, ok, porBaixa, erros };
}

export { logAtlas, lerTudo };
