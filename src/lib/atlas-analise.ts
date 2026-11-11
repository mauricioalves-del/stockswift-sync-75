// Análise assistida (IA) de uma divergência de contagem de movimentados.
// 1) Coleta sinais de todo o sistema para o SKU/lote/almox na janela da divergência: baixas pendentes, estoque em
//    trânsito, contagens de loja e inventários, contagens de movimentados nos outros almoxarifados, apontamento de OP,
//    faturamento do SKU e de produtos semelhantes e o histórico de resoluções.
// 2) Combina os sinais com a probabilidade do motor (regras + modelo) num classificador bayesiano ingênuo:
//    posterior ∝ prior × Π razão de verossimilhança, em que a razão cresce com a compatibilidade da quantidade.
import { supabase } from "@/integrations/supabase/client";
import { ALMOX_SS_PARA_ATLAS, MOTIVO_PARA_HIPOTESE } from "./atlas-investigacao";

const sb = supabase as any;
export type Compat = "exata" | "compativel" | "parcial" | "presenca";
/** Registro de origem do sinal, para abrir direto a tela onde a ação aconteceu. */
export type LinkSinal =
  | { tipo: "baixa"; id: string; aba: "fila" | "historico" }
  | { tipo: "recebimento"; nf: string; sku: string }
  | { tipo: "missao"; id: string }
  | { tipo: "inventario"; busca: string }
  | { tipo: "divergencia"; id: number }
  | { tipo: "op"; material: string };
export type Sinal = { fonte: string; titulo: string; detalhe: string; hipotese: string; compat: Compat; qtd?: number | null; data?: string | null; link?: LinkSinal };
export type DivAnalise = { id: number; sku: string; almoxarifado: string; data_deteccao: string; divergencia_qtd: number; categoria_produto?: string | null; lote?: string | null };

const RAZAO: Record<Compat, number> = { exata: 6, compativel: 3, parcial: 1.8, presenca: 1.3 };
const ATLAS_PARA_SS: Record<string, string> = Object.fromEntries(Object.entries(ALMOX_SS_PARA_ATLAS).map(([ss, at]) => [at, ss]));
const k0 = (s: unknown) => String(s ?? "").trim().replace(/^0+/, "");
const variantes = (sku: string) => { const s = k0(sku); return [...new Set([String(sku).trim(), s, `0${s}`, `00${s}`, `000${s}`])]; };
const addDias = (d: string, n: number) => { const x = new Date(`${d.slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Compatibilidade entre a quantidade de um sinal e a divergência (em módulo). */
export function compatibilidade(qtdSinal: number, divergencia: number): Compat {
  const a = Math.abs(qtdSinal), b = Math.abs(divergencia);
  if (!a || !b) return "presenca";
  const rel = Math.abs(a - b) / b;
  return rel <= 0.02 ? "exata" : rel <= 0.25 ? "compativel" : a >= b * 0.25 ? "parcial" : "presenca";
}

/** Palavras significativas da descrição (para achar produtos semelhantes). */
export function chaveSemelhanca(desc: string | null | undefined) {
  return semAcento(String(desc ?? "")).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^\d+g?$/.test(w) && !["com", "para", "sem", "unitario"].includes(w)).slice(0, 3);
}

export async function coletarSinais(d: DivAnalise, descricao: string | null) {
  const ids = variantes(d.sku), dia = d.data_deteccao.slice(0, 10), div = Number(d.divergencia_qtd) || 0;
  const almoxSS = ATLAS_PARA_SS[d.almoxarifado] ?? d.almoxarifado;
  const ini7 = addDias(dia, -7), fim7 = addDias(dia, 7), ini60 = addDias(dia, -60);
  const seguro = async (p: Promise<any>) => { try { const r = await p; return r?.data ?? []; } catch { return []; } };
  const palavras = chaveSemelhanca(descricao);
  const [baixas, notas, transf, invAtual, invArq, outras, ops, fat, fatSem, itensMissao] = await Promise.all([
    seguro(sb.from("baixa_operacional").select("id, codigo_produto, origem, lote, quantidade, status_fluxo, motivo_baixa_id, data_solicitacao, responsavel_nome").in("codigo_produto", ids).in("status_fluxo", ["PENDENTE", "APROVADA"]).limit(50)),
    seguro(sb.from("notas_transferencia_recebimento").select("nr_nf, cod_prod, almox, qtd, lote, dt_emissao, recebimento, dt_recebimento, nota_cancelada").in("cod_prod", ids).gte("dt_emissao", ini60).limit(50)),
    seguro(sb.from("atlas_transferencias").select("sku, almoxarifado_origem, almoxarifado_destino, quantidade, data_saida, data_entrada, documento").in("sku", ids).is("data_entrada", null).limit(50)),
    seguro(sb.from("inventario").select("origem, data_contagem, saldo_sistemico, quantidade_contada, divergencia, lote").in("id_produto", ids).gte("data_contagem", ini60).limit(100)),
    seguro(sb.from("inventario_arquivado").select("origem, data_contagem, saldo_sistemico, quantidade_contada, divergencia, lote").in("id_produto", ids).gte("data_contagem", ini60).limit(200)),
    seguro(sb.from("atlas_divergencias").select("id, almoxarifado, data_deteccao, divergencia_qtd, status, hipotese_confirmada").in("sku", ids).gte("data_deteccao", ini7).lte("data_deteccao", fim7).neq("id", d.id).limit(50)),
    seguro(sb.from("producao_consumo").select("id_op, material, data_producao, produto, desc_produto, qtd_consumo, qtd_previsto, qtd_dif").in("material", ids).gte("data_producao", addDias(dia, -5)).lte("data_producao", addDias(dia, 2)).limit(100)),
    seguro(sb.from("atlas_faturamento").select("sku, descricao, data_faturamento, quantidade, origem").in("sku", ids).gte("data_faturamento", addDias(dia, -5)).lte("data_faturamento", addDias(dia, 5)).limit(50)),
    palavras.length ? seguro(sb.from("atlas_faturamento").select("sku, descricao, data_faturamento, quantidade, origem").ilike("descricao", `%${palavras[0]}%`).gte("data_faturamento", addDias(dia, -5)).lte("data_faturamento", addDias(dia, 5)).limit(200)) : Promise.resolve([]),
    // contagem cíclica da loja: Missões de Inventário (itens contados × saldo previsto)
    seguro(sb.from("missoes_itens").select("missao_id, lote, quantidade_prevista, quantidade_contada, updated_at").in("codigo_produto", ids).not("quantidade_contada", "is", null).gte("updated_at", ini60).limit(200)),
  ]);
  const idsMissao = [...new Set(itensMissao.map((i: any) => i.missao_id))];
  const missoes: any[] = idsMissao.length ? await seguro(sb.from("missoes").select("id, titulo, id_local, origem, data_execucao, status").in("id", idsMissao)) : [];
  const porMissao = new Map(missoes.map((m: any) => [m.id, m]));
  const sinais: Sinal[] = [];
  // 1) Baixas pendentes do SKU / lote / almox
  for (const b of baixas) {
    const mesmoAlmox = b.origem === almoxSS || ALMOX_SS_PARA_ATLAS[b.origem] === d.almoxarifado;
    const hip = MOTIVO_PARA_HIPOTESE[b.motivo_baixa_id]?.[0] ?? "Avaria_Perda";
    const c = div < 0 ? compatibilidade(Number(b.quantidade), div) : "presenca";
    sinais.push({ fonte: "Baixas", titulo: `Baixa ${b.status_fluxo === "PENDENTE" ? "pendente de aprovação" : "aprovada e não executada"}${mesmoAlmox ? " no mesmo almoxarifado" : ` em ${b.origem}`}`, detalhe: `${Number(b.quantidade).toLocaleString("pt-BR")} un${b.lote ? ` · lote ${b.lote}` : ""}${b.responsavel_nome ? ` · ${b.responsavel_nome}` : ""}${b.data_solicitacao ? ` · ${String(b.data_solicitacao).slice(0, 10)}` : ""}`, hipotese: hip, compat: mesmoAlmox ? c : "presenca", qtd: Number(b.quantidade), data: b.data_solicitacao, link: b.id ? { tipo: "baixa", id: String(b.id), aba: b.status_fluxo === "PENDENTE" ? "fila" : "historico" } : undefined });
  }
  // 2) Estoque em trânsito (notas sem recebimento e transferências sem entrada)
  for (const n of notas.filter((x: any) => !x.nota_cancelada && (x.recebimento === "Pendente" || !x.dt_recebimento)))
    sinais.push({ fonte: "Trânsito", titulo: `Nota de transferência ${n.nr_nf} sem recebimento`, detalhe: `${Number(n.qtd).toLocaleString("pt-BR")} un para ${n.almox}${n.lote ? ` · lote ${n.lote}` : ""} · emitida ${String(n.dt_emissao).slice(0, 10)}`, hipotese: "Transferencia_Pendente", compat: compatibilidade(Number(n.qtd), div), qtd: Number(n.qtd), data: n.dt_emissao, link: { tipo: "recebimento", nf: String(n.nr_nf), sku: String(n.cod_prod ?? d.sku) } });
  for (const t of transf.filter((x: any) => x.almoxarifado_origem === d.almoxarifado || x.almoxarifado_destino === d.almoxarifado))
    sinais.push({ fonte: "Trânsito", titulo: `Transferência ${t.documento ?? ""} sem entrada no destino`, detalhe: `${Number(t.quantidade).toLocaleString("pt-BR")} un · ${t.almoxarifado_origem} → ${t.almoxarifado_destino}`, hipotese: "Transferencia_Pendente", compat: compatibilidade(Number(t.quantidade), div), qtd: Number(t.quantidade), data: t.data_saida, link: { tipo: "recebimento", nf: String(t.documento ?? ""), sku: String(t.sku ?? d.sku) } });
  // 3) Última contagem de loja / inventário por local (sobra ou falta)
  const ultimas = new Map<string, any>();
  for (const c of [...invAtual.map((x: any) => ({ ...x, _atual: true })), ...invArq]) { const k = String(c.origem); const o = ultimas.get(k); if (!o || String(c.data_contagem) > String(o.data_contagem)) ultimas.set(k, c); }
  // contagens cíclicas (missões): soma os lotes da última missão contada de cada local
  const ultMissao = new Map<string, { m: any; prev: number; cont: number; lotes: string[] }>();
  for (const it of itensMissao) {
    const m = porMissao.get(it.missao_id); if (!m) continue;
    const loc = String(m.id_local || m.origem || "Loja"), dataM = String(m.data_execucao ?? it.updated_at).slice(0, 10);
    const o = ultMissao.get(loc);
    if (o && String(o.m.data_execucao ?? "").slice(0, 10) > dataM) continue;
    const alvo = o && o.m.id === m.id ? o : { m, prev: 0, cont: 0, lotes: [] as string[] };
    alvo.prev += Number(it.quantidade_prevista) || 0; alvo.cont += Number(it.quantidade_contada) || 0; if (it.lote) alvo.lotes.push(String(it.lote));
    ultMissao.set(loc, alvo);
  }
  for (const [loc, x] of ultMissao) {
    const dv = x.cont - x.prev; if (Math.abs(dv) < 1e-9) continue;
    const oposto = Math.sign(dv) !== Math.sign(div) && div !== 0;
    sinais.push({ fonte: "Contagem de loja / inventário", titulo: `Contagem cíclica em ${loc}: ${dv > 0 ? "sobra" : "falta"} de ${Math.abs(dv).toLocaleString("pt-BR")} un`, detalhe: `${String(x.m.data_execucao ?? "").slice(0, 10)} · ${x.m.titulo ?? "missão"} · sistema ${x.prev.toLocaleString("pt-BR")} × contado ${x.cont.toLocaleString("pt-BR")}${x.lotes.length ? ` · lote(s) ${[...new Set(x.lotes)].slice(0, 3).join(", ")}` : ""}${oposto ? " · sinal oposto ao desta divergência: o material pode ter ido para a loja sem transferência" : ""}`, hipotese: oposto ? "Transferencia_Pendente" : "Falha_Inventario", compat: oposto ? compatibilidade(dv, div) : "presenca", qtd: dv, data: x.m.data_execucao, link: { tipo: "missao", id: String(x.m.id) } });
  }
  for (const [loc, c] of ultimas) {
    const dv = Number(c.divergencia ?? (Number(c.quantidade_contada) - Number(c.saldo_sistemico))) || 0;
    if (!dv) continue;
    const oposto = Math.sign(dv) !== Math.sign(div) && div !== 0;
    sinais.push({ fonte: "Contagem de loja / inventário", titulo: `Última contagem em ${loc}: ${dv > 0 ? "sobra" : "falta"} de ${Math.abs(dv).toLocaleString("pt-BR")} un`, detalhe: `${String(c.data_contagem).slice(0, 10)} · sistema ${c.saldo_sistemico} × contado ${c.quantidade_contada}${c.lote ? ` · lote ${c.lote}` : ""}${oposto ? " · sinal oposto ao desta divergência: o material pode ter ido para lá sem registro" : ""}`, hipotese: oposto ? "Transferencia_Pendente" : "Falha_Inventario", compat: oposto ? compatibilidade(dv, div) : "presenca", qtd: dv, data: c.data_contagem, link: c._atual ? { tipo: "inventario", busca: k0(d.sku) } : undefined });
  }
  // 4) Contagem de movimentados nas outras operações (±7 dias)
  for (const o of outras) {
    const q = Number(o.divergencia_qtd) || 0;
    if (o.almoxarifado === d.almoxarifado) { sinais.push({ fonte: "Movimentados", titulo: `Nova divergência no mesmo almox em ${String(o.data_deteccao).slice(0, 10)}`, detalhe: `${q.toLocaleString("pt-BR")} un · ${o.status}${o.hipotese_confirmada ? ` · ${o.hipotese_confirmada}` : ""}`, hipotese: q === -div ? "Movimentacao_Duplicada" : "Erro_Operacional", compat: q === -div ? "exata" : "presenca", qtd: q, data: o.data_deteccao, link: { tipo: "divergencia", id: Number(o.id) } }); continue; }
    const oposto = Math.sign(q) !== Math.sign(div);
    sinais.push({ fonte: "Movimentados", titulo: `${q > 0 ? "Sobra" : "Falta"} de ${Math.abs(q).toLocaleString("pt-BR")} un em ${o.almoxarifado}`, detalhe: `${String(o.data_deteccao).slice(0, 10)} · ${o.status}${oposto ? " · compensa esta divergência: movimentação física sem transferência ou apontamento no almox errado" : ""}`, hipotese: oposto ? "Transferencia_Pendente" : "Erro_Operacional", compat: oposto ? compatibilidade(q, div) : "presenca", qtd: q, data: o.data_deteccao, link: { tipo: "divergencia", id: Number(o.id) } });
  }
  // 5) Apontamento de OP do material (−5 a +2 dias)
  for (const p of ops) {
    const dif = Number(p.qtd_dif ?? (Number(p.qtd_consumo) - Number(p.qtd_previsto))) || 0;
    const naoApontado = Number(p.qtd_consumo) === 0 && Number(p.qtd_previsto) > 0;
    // falta no estoque + OP com consumo apontado abaixo do previsto: o consumo real saiu do estoque sem apontamento
    const indica = naoApontado || (div < 0 && dif < 0) || (div > 0 && dif > 0);
    sinais.push({ fonte: "OP", titulo: `OP ${p.id_op} (${p.desc_produto || p.produto}) ${naoApontado ? "sem consumo apontado" : dif ? `apontou ${dif > 0 ? "+" : ""}${dif.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} vs ficha` : "aderente à ficha"}`, detalhe: `${String(p.data_producao).slice(0, 10)} · previsto ${p.qtd_previsto} · apontado ${p.qtd_consumo}`, hipotese: indica ? "Falha_No_Apontamento" : "Consumo_Parcial_OP", compat: indica ? compatibilidade(naoApontado ? Number(p.qtd_previsto) : dif, div) : "presenca", qtd: dif, data: p.data_producao, link: { tipo: "op", material: String(p.material ?? d.sku) } });
  }
  // 6) Faturamento do SKU e de produtos semelhantes (±5 dias)
  for (const f of fat) sinais.push({ fonte: "Faturamento", titulo: `Faturamento do próprio SKU em ${String(f.data_faturamento).slice(0, 10)}`, detalhe: `${Number(f.quantidade).toLocaleString("pt-BR")} un${f.origem ? ` · ${f.origem}` : ""}`, hipotese: "Pendencia_Faturamento", compat: compatibilidade(Number(f.quantidade), div), qtd: Number(f.quantidade), data: f.data_faturamento });
  const idsSet = new Set(ids.map(k0));
  for (const f of fatSem) {
    if (idsSet.has(k0(f.sku))) continue;
    const pw = chaveSemelhanca(f.descricao); const comum = palavras.filter((w) => pw.includes(w)).length;
    if (comum < Math.min(2, palavras.length)) continue;
    const c = compatibilidade(Number(f.quantidade), div);
    if (c === "presenca" || c === "parcial") continue;
    sinais.push({ fonte: "Faturamento", titulo: `Produto semelhante faturado: ${f.sku} ${f.descricao}`, detalhe: `${Number(f.quantidade).toLocaleString("pt-BR")} un em ${String(f.data_faturamento).slice(0, 10)} · quantidade igual à divergência: possível lançamento no SKU errado`, hipotese: "Erro_Fiscal", compat: c, qtd: Number(f.quantidade), data: f.data_faturamento });
  }
  return { sinais, contagens: [...ultimas.entries()].map(([loc, c]) => ({ loc, ...c })) };
}

export type Historico = { hipotese: string | null; almoxarifado?: string | null; categoria?: string | null }[];

/** Classificador: prior (motor + histórico de resoluções do SKU) × razões de verossimilhança dos sinais. */
export function analisarIA(motor: { hipotese: string; confianca: number }[], sinais: Sinal[], historico: Historico, d: Pick<DivAnalise, "almoxarifado" | "categoria_produto">) {
  const prior = new Map<string, number>();
  const add = (h: string | null | undefined, v: number) => { if (h) prior.set(h, (prior.get(h) ?? 0) + v); };
  const totMotor = motor.reduce((s, x) => s + Math.max(0, x.confianca), 0) || 1;
  for (const x of motor) add(x.hipotese, (0.6 * Math.max(0, x.confianca)) / totMotor);
  const hs = historico.filter((h) => h.hipotese);
  const pesoH = (h: Historico[number]) => 1 + (h.almoxarifado === d.almoxarifado ? 1 : 0) + (h.categoria && h.categoria === d.categoria_produto ? 0.5 : 0);
  const totH = hs.reduce((s, h) => s + pesoH(h), 0) || 1;
  for (const h of hs) add(h.hipotese, (0.4 * pesoH(h)) / totH);
  for (const s of sinais) if (!prior.has(s.hipotese)) prior.set(s.hipotese, 0.02); // causa nova trazida pelos sinais
  if (!prior.size) prior.set("Outros_Nao_Categorizado", 1);
  const post = new Map<string, { p: number; motivos: string[] }>();
  for (const [h, p] of prior) post.set(h, { p: Math.max(p, 0.01), motivos: [] });
  for (const s of sinais) { const o = post.get(s.hipotese)!; o.p *= RAZAO[s.compat]; o.motivos.push(`${s.titulo}${s.compat === "exata" ? " (quantidade igual)" : s.compat === "compativel" ? " (quantidade compatível)" : ""}`); }
  const tot = [...post.values()].reduce((s, x) => s + x.p, 0);
  const ranking = [...post].map(([hipotese, x]) => ({ hipotese, prob: x.p / tot, motivos: x.motivos, historico: hs.filter((h) => h.hipotese === hipotese).length }))
    .sort((a, b) => b.prob - a.prob);
  const fortes = sinais.filter((s) => s.compat === "exata" || s.compat === "compativel");
  const confiabilidade = fortes.length >= 2 ? "alta" : fortes.length === 1 ? "media" : sinais.length ? "baixa" : "sem sinais";
  return { ranking, confiabilidade, sinaisFortes: fortes.length };
}
