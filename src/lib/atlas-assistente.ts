// Assistente Atlas (assistente_ia.py + assistente_perguntas_padrao.py + comandos de voz do hub do Atlas).
// O retrato é montado aqui, no navegador, com as permissões de quem pergunta; a função atlas-assistente só
// recebe esse retrato e pede à IA uma resposta curta para ser lida em voz alta.
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "./atlas-investigacao";

const sb = supabase as any;
const r2 = (n: number) => Math.round(n * 100) / 100;
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const normalizar = (t: string) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// ---------- mapa de módulos (voz e "onde encontro X") ----------
export type Modulo = { rota: string; nome: string; conteudo: string; palavras: string[] };
export const MODULOS_VOZ: Modulo[] = [
  { rota: "/atlas/inicio", nome: "Início", conteudo: "Assistente, comandos de voz e mapa dos módulos do Atlas.", palavras: ["início", "inicio", "hub", "home"] },
  { rota: "/atlas/painel", nome: "Painel", conteudo: "Acurácia das contagens diárias por dia, mês e almoxarifado, causas confirmadas e ranking de divergências.", palavras: ["painel de divergências", "painel", "divergências abertas"] },
  { rota: "/atlas/divergencias", nome: "Divergências", conteudo: "Lista de cada divergência com filtros; o detalhe mostra hipóteses, evidências, casos similares e permite confirmar a causa.", palavras: ["divergências", "lista de divergências", "divergência"] },
  { rota: "/atlas/mapeamento-passivos", nome: "Mapeamento de Passivos", conteudo: "Baixas aprovadas (passivos) × resultado de inventário, por motivo, mês e almoxarifado, com resumo executivo.", palavras: ["mapeamento de passivos", "passivos", "passivo"] },
  { rota: "/atlas/importar", nome: "Importar", conteudo: "Upload das planilhas: movimentação, livro-caixa, custos, faturamento, ficha técnica, OPs, consumo de OP e transferências.", palavras: ["importar", "importação", "importa"] },
  { rota: "/atlas/painel-inventario", nome: "Painel Inventário", conteudo: "Acurácia, faltas e sobras dos fechamentos de inventário mensal, por grupo, almoxarifado e mês.", palavras: ["painel inventário", "painel de inventário", "painel do inventário"] },
  { rota: "/atlas/acuracia-ponderada", nome: "Acurácia Ponderada", conteudo: "Acurácia item a item, IAQ (quantidade) e IAP (valor), concentração do valor divergente e recorrentes de risco.", palavras: ["acurácia ponderada", "acurácia"] },
  { rota: "/atlas/fechamento-inventario", nome: "Fechamento Inventário", conteudo: "Fechamentos por almoxarifado, itens, as três ciências (Diretor de Operações, Coordenador Financeiro e Responsável pelo Departamento) e PDF.", palavras: ["fechamento inventário", "fechamento de inventário", "fechamento"] },
  { rota: "/atlas/pos-inventario", nome: "Pós-Inventário", conteudo: "Ações corretivas dos itens divergentes do fechamento, com responsável, prazo e checklist.", palavras: ["pós-inventário", "pós inventário", "pos inventario"] },
  { rota: "/atlas/cadastros", nome: "Cadastros", conteudo: "Produtos, almoxarifados e hipóteses de causa do Atlas.", palavras: ["cadastros", "cadastro"] },
  { rota: "/logs", nome: "Auditoria", conteudo: "Log das ações, incluindo o histórico do Atlas.", palavras: ["auditoria"] },
  { rota: "/usuarios", nome: "Usuários", conteudo: "Usuários, papéis e o vínculo com os logins do Atlas.", palavras: ["usuários", "usuarios"] },
  { rota: "/baixas", nome: "Relatório de Baixa", conteudo: "Todas as baixas operacionais (avaria, vencimento, descarte...) e as aprovações.", palavras: ["relatório de baixa", "relatorio de baixa", "relatório de baixas", "baixas operacionais", "baixa operacional"] },
  { rota: "/shelf-life/dashboard", nome: "Shelf Life", conteudo: "Risco de validade dos lotes em estoque.", palavras: ["shelf life", "validade", "vencimento"] },
  { rota: "/quebras-fefo", nome: "FEFO", conteudo: "Quebras do critério FEFO nas saídas e transferências.", palavras: ["fefo", "quebras de fefo"] },
  { rota: "/obsoletos/dashboard", nome: "Obsolescência", conteudo: "Risco de obsolescência (baixo giro).", palavras: ["obsolescência", "obsoletos", "baixo giro"] },
];
export const GATILHOS_ASSISTENTE = ["assistente", "assistente atlas", "assistente do atlas", "abrir assistente", "abrir o assistente", "abra o assistente", "falar com assistente", "falar com o assistente"];

/** Tira a palavra de ativação ("Atlas," / "Ei Atlas") do começo. */
export const semAtivacao = (t: string) => t.replace(/^\s*(e[ai]?\s+)?atlas[,\s]*/i, "").trim();

/** Módulo citado na frase (a palavra-chave mais longa que aparece ganha), ou null. */
export function moduloPorVoz(frase: string): Modulo | null {
  const alvo = normalizar(semAtivacao(frase));
  let melhor: Modulo | null = null, tam = 0;
  for (const m of MODULOS_VOZ) for (const p of m.palavras) { const n = normalizar(p); if (alvo.includes(n) && n.length > tam) { melhor = m; tam = n.length; } }
  return melhor;
}
/** Frase curta de navegação ("Atlas, divergências") × pergunta aberta ("Atlas, quais os motivos..."). */
export function ehComandoDeNavegacao(frase: string, m: Modulo | null) {
  if (!m) return false;
  const alvo = normalizar(semAtivacao(frase)).replace(/^(abrir|abra|abre|ir para|ir pra|va para|vai para|mostrar|mostre)\s+(o |a |os |as )?/, "");
  return m.palavras.some((p) => alvo === normalizar(p));
}

// ---------- perguntas padrão ----------
export type PerguntaPadrao = { chave: string; rotulo: string; pergunta: string; gatilhos: string[]; instrucao: string | null; personalizada: boolean; extra?: "risco_por_almoxarifado" };
export const PERGUNTAS_FIXAS: PerguntaPadrao[] = [
  { chave: "resumo_do_dia", rotulo: "Resumo do dia", pergunta: "Resumo do dia", personalizada: false, gatilhos: ["resumo do dia", "resumo de hoje", "resumo hoje", "o que aconteceu hoje", "o que foi feito hoje"], instrucao: "Essa pergunta é sobre o dia de hoje - foque no que já foi feito (divergências detectadas/resolvidas, baixas aprovadas, fechamentos criados) e no que está pendente/planejado (ações pós-inventário). Não é necessário repetir números de risco de longo prazo aqui." },
  { chave: "motivos_recorrentes_divergencia", rotulo: "Motivos mais recorrentes de divergência", pergunta: "Quais são os motivos mais recorrentes de divergência?", personalizada: false, gatilhos: ["motivo mais recorrente", "motivos mais recorrentes", "causa mais comum", "causas mais comuns", "motivo de divergencia", "motivos de divergencia", "motivo das divergencias"], instrucao: "A resposta já está pronta na chave motivos_de_divergencia_mais_recorrentes_ultimos_90_dias do retrato (já ordenada do mais pro menos recorrente) - baseie a resposta diretamente nela." },
  { chave: "risco_por_almoxarifado", rotulo: "Qual almoxarifado representa mais risco?", pergunta: "Qual almoxarifado representa mais risco pro negócio?", personalizada: false, extra: "risco_por_almoxarifado", gatilhos: ["qual almoxarifado", "almoxarifado representa", "almoxarifado com mais risco", "almoxarifado tem mais risco", "qual local representa risco", "qual unidade tem mais risco"], instrucao: "Use o bloco detalhamento_para_esta_pergunta - ele quebra divergências abertas, passivos pendentes e ações atrasadas POR ALMOXARIFADO. Aponte o(s) almoxarifado(s) que aparecem repetidamente no topo de mais de um desses blocos - isso é o sinal mais forte de risco concentrado. Não invente uma pontuação combinada entre os blocos - se nenhum almoxarifado se repetir, diga isso e cite o topo de cada bloco separadamente." },
  { chave: "riscos_negocio", rotulo: "Riscos pro negócio", pergunta: "Quais são os principais riscos pro negócio agora?", personalizada: false, gatilhos: ["risco pro negocio", "riscos pro negocio", "principal risco", "principais riscos", "riscos do negocio"], instrucao: "Cruze passivo_de_baixas_pendentes, divergencias (valor em aberto), acoes_pos_inventario (atrasadas) e fechamentos_de_inventario (assinaturas pendentes) - aponte qual desses te parece mais crítico agora e por quê, em termos de valor financeiro em risco." },
];

export async function carregarPerguntas(): Promise<PerguntaPadrao[]> {
  const { data } = await sb.from("atlas_perguntas_padrao_personalizadas").select("chave, rotulo, pergunta, gatilhos, instrucao_extra, ativo").order("id");
  const pers = (data ?? []).filter((p: any) => p.ativo !== false).map((p: any) => ({ chave: p.chave, rotulo: p.rotulo, pergunta: p.pergunta, gatilhos: Array.isArray(p.gatilhos) ? p.gatilhos : [], instrucao: p.instrucao_extra, personalizada: true }));
  return [...PERGUNTAS_FIXAS, ...pers];
}
export function identificarPergunta(pergunta: string, lista: PerguntaPadrao[]): PerguntaPadrao | null {
  const alvo = normalizar(pergunta);
  return lista.find((p) => p.gatilhos.some((g) => alvo.includes(normalizar(g)))) ?? null;
}
export function chaveDe(rotulo: string) { return normalizar(rotulo).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "pergunta"; }

// ---------- retrato ----------
async function seguro<T>(fn: () => Promise<T>): Promise<T | { indisponivel: string }> { try { return await fn(); } catch (e: any) { return { indisponivel: `não foi possível calcular agora (${e?.message ?? e})` }; } }

export async function montarRetrato(p: PerguntaPadrao | null) {
  const h = hoje();
  const desde90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [hip, divs, acoes, fech, cien, baixas] = await Promise.all([
    sb.from("atlas_hipoteses").select("codigo, nome").then((r: any) => new Map<string, string>((r.data ?? []).map((x: any) => [x.codigo, x.nome]))),
    lerTudo<any>("atlas_divergencias", "id, almoxarifado, status, data_deteccao, resolvido_em, hipotese_ia, hipotese_confirmada, valor_estimado, origem").catch(() => []),
    lerTudo<any>("atlas_acoes_pos_inventario", "id, sku, almoxarifado, acao_descricao, responsavel, prazo, status, concluido_em").catch(() => []),
    lerTudo<any>("atlas_fechamentos_inventario", "id, almoxarifado, data_fechamento, criado_em, aprovado_manual").catch(() => []),
    lerTudo<any>("atlas_conciliacoes_ciencia", "fechamento_id, papel_assinatura").catch(() => []),
    lerTudo<any>("baixa_operacional", "*").catch(() => []),
  ]);
  const nomeHip = (c: string) => hip.get(c) ?? c;
  const ctx: Record<string, unknown> = { data_hoje: h };
  ctx.divergencias = await seguro(async () => ({
    abertas_total: divs.filter((d) => d.status === "Aberta").length,
    em_investigacao: divs.filter((d) => d.status === "Em_Investigacao").length,
    valor_em_aberto: r2(divs.filter((d) => d.status !== "Resolvida").reduce((s, d) => s + (Number(d.valor_estimado) || 0), 0)),
    detectadas_hoje: divs.filter((d) => String(d.data_deteccao ?? "").slice(0, 10) === h).length,
    resolvidas_hoje: divs.filter((d) => d.status === "Resolvida" && String(d.resolvido_em ?? "").slice(0, 10) === h).length,
  }));
  ctx.motivos_de_divergencia_mais_recorrentes_ultimos_90_dias = await seguro(async () => {
    const c = new Map<string, number>();
    for (const d of divs) if (d.hipotese_ia && String(d.data_deteccao ?? "") >= desde90) c.set(d.hipotese_ia, (c.get(d.hipotese_ia) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([codigo, quantidade]) => ({ hipotese: codigo, nome: nomeHip(codigo), quantidade }));
  });
  const valorBaixa = (b: any) => (b.valor_total != null ? Number(b.valor_total) : (Number(b.quantidade) || 0) * (Number(b.custo_unitario) || 0));
  ctx.baixas_operacionais = await seguro(async () => { const ap = baixas.filter((b) => b.status_fluxo === "APROVADA" && String(b.data_ocorrencia || b.data_solicitacao || "").slice(0, 10) === h); return { aprovadas_hoje_qtd: ap.length, aprovadas_hoje_valor: r2(ap.reduce((s, b) => s + valorBaixa(b), 0)) }; });
  ctx.passivo_de_baixas_pendentes = await seguro(async () => { const pend = baixas.filter((b) => ["PENDENTE", "PARCIAL", "AGUARDANDO_ADMIN"].includes(b.status_fluxo)); return { total: pend.length, valor_total: r2(pend.reduce((s, b) => s + valorBaixa(b), 0)), aguardando_administrador: pend.filter((b) => b.status_fluxo === "AGUARDANDO_ADMIN").length }; });
  ctx.fechamentos_de_inventario = await seguro(async () => {
    const pap = new Map<number, Set<string>>(); for (const c of cien) if (c.papel_assinatura) (pap.get(c.fechamento_id) ?? pap.set(c.fechamento_id, new Set()).get(c.fechamento_id)!).add(c.papel_assinatura);
    const abertos = fech.filter((f) => !f.aprovado_manual && (pap.get(f.id)?.size ?? 0) < 3);
    return { criados_hoje: fech.filter((f) => String(f.criado_em ?? "").slice(0, 10) === h).length, em_aberto_sem_as_tres_assinaturas: abertos.length, exemplos_em_aberto: abertos.slice(-5).map((f) => ({ id: f.id, almoxarifado: f.almoxarifado, data: f.data_fechamento, assinaturas: pap.get(f.id)?.size ?? 0 })) };
  });
  ctx.acoes_pos_inventario = await seguro(async () => {
    const pend = acoes.filter((a) => ["Pendente", "Em_Andamento"].includes(a.status)); const atr = pend.filter((a) => a.prazo && a.prazo < h);
    return { pendentes_total: pend.length, atrasadas_total: atr.length, concluidas_hoje: acoes.filter((a) => String(a.concluido_em ?? "").slice(0, 10) === h).length, exemplos_atrasadas: atr.sort((a, b) => String(a.prazo).localeCompare(String(b.prazo))).slice(0, 5).map((a) => ({ sku: a.sku, acao: a.acao_descricao, responsavel: a.responsavel, prazo: a.prazo })) };
  });
  if (p?.extra === "risco_por_almoxarifado") {
    ctx.detalhamento_para_esta_pergunta = await seguro(async () => {
      const top = (pares: [string, number][]) => pares.sort((a, b) => b[1] - a[1]).slice(0, 5);
      const div = new Map<string, number>(), val = new Map<string, number>(), atr = new Map<string, number>();
      for (const d of divs) if (d.status === "Aberta") { div.set(d.almoxarifado || "Não informado", (div.get(d.almoxarifado || "Não informado") ?? 0) + 1); val.set(d.almoxarifado || "Não informado", (val.get(d.almoxarifado || "Não informado") ?? 0) + (Number(d.valor_estimado) || 0)); }
      for (const a of acoes) if (["Pendente", "Em_Andamento"].includes(a.status) && a.prazo && a.prazo < h) atr.set(a.almoxarifado || "Não informado", (atr.get(a.almoxarifado || "Não informado") ?? 0) + 1);
      const pb = new Map<string, number>(); for (const b of baixas) if (["PENDENTE", "PARCIAL", "AGUARDANDO_ADMIN"].includes(b.status_fluxo)) pb.set(b.id_local || "Não informado", (pb.get(b.id_local || "Não informado") ?? 0) + valorBaixa(b));
      return {
        divergencias_abertas_por_almoxarifado: top([...div]).map(([almoxarifado, quantidade]) => ({ almoxarifado, quantidade, valor: r2(val.get(almoxarifado) ?? 0) })),
        passivo_de_baixas_pendentes_por_almoxarifado: top([...pb]).map(([almoxarifado, valor]) => ({ almoxarifado, valor: r2(valor) })),
        acoes_pos_inventario_atrasadas_por_almoxarifado: top([...atr]).map(([almoxarifado, quantidade]) => ({ almoxarifado, quantidade })),
      };
    });
  }
  return ctx;
}

/** Pergunta ao assistente: identifica a pergunta padrão, monta o retrato e chama a função atlas-assistente. */
export async function perguntarAtlas(pergunta: string, lista: PerguntaPadrao[]) {
  const p = identificarPergunta(pergunta, lista);
  const contexto = await montarRetrato(p);
  const { data, error } = await supabase.functions.invoke("atlas-assistente", { body: { pergunta, contexto, instrucao: p?.instrucao ?? null, rotulo: p?.rotulo ?? null, modulos: MODULOS_VOZ.map((m) => ({ modulo: m.nome, conteudo: m.conteudo })) } });
  if (error) { let msg = error.message; try { const b = await (error as any).context?.json?.(); if (b?.erro) msg = b.erro; } catch { /* corpo sem JSON */ } throw new Error(msg); }
  if (!data?.resposta) throw new Error(data?.erro ?? "O assistente não respondeu.");
  return { resposta: String(data.resposta), padrao: p };
}

/** Lê o texto em voz alta (pt-BR), escolhendo uma voz brasileira se houver. */
export function falar(texto: string, aoTerminar?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) { aoTerminar?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "pt-BR"; u.rate = 1.05;
  const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt-br")) ?? window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
  if (voz) u.voice = voz;
  u.onend = () => aoTerminar?.(); u.onerror = () => aoTerminar?.();
  window.speechSynthesis.speak(u);
}
