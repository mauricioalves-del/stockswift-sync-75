// MBR · automações em operação (farois no Slack, e-mails e rotinas agendadas) e o PDCA da operação de controle:
// dor/demanda → solução implantada → resultado medido → padronização/próximo passo.
import { supabase } from "@/integrations/supabase/client";
import { fimDoMes } from "./dados3";
import type { Consolidado } from "./secao1";
import type { Extras } from "./executivo";
import { COR, LARGURA, MARGEM, fmtMoeda, fmtNum, fmtPct, fmtPP } from "./formato";
import { cabecalho, caixaLeitura, linhaKpis, novoSlide, retangulo, tabela, texto, type Pptx } from "./kit";

const sb = supabase as any;
const LC = LARGURA - 2 * MARGEM;

export type Automacao = { nome: string; canal: "Slack" | "E-mail" | "Sistema"; frequencia: string; desde: string; acao?: string; entrega: string };
/** Cadastro das automações (agenda do pg_cron e eventos registrados no log de auditoria). */
export const AUTOMACOES: Automacao[] = [
  { nome: "Farol de Dispersão (SP e Pará)", canal: "Slack", frequencia: "Dias úteis, 07h", desde: "2026-09-14", acao: "FAROL_DISPERSAO_ENVIADO", entrega: "OPs com consumo fora da ficha técnica do dia anterior" },
  { nome: "Farol de FEFO", canal: "Slack", frequencia: "Dias úteis, 13h30 e 16h10", desde: "2026-09-14", acao: "FAROL_FEFO_ENVIADO", entrega: "Quebras de FEFO nas transferências do dia" },
  { nome: "Farol de Shelf Life", canal: "Slack", frequencia: "Segunda, 09h30", desde: "2026-09-14", acao: "FAROL_SHELF_ENVIADO", entrega: "Lotes vencidos e em risco de validade" },
  { nome: "Farol de Baixas", canal: "Slack", frequencia: "Dias úteis, 15h", desde: "2026-09-21", acao: "FAROL_BAIXAS_ENVIADO", entrega: "Baixas do dia e pendências de aprovação" },
  { nome: "Farol de Itens sem Movimentação", canal: "Slack", frequencia: "Segunda, 09h30", desde: "2026-09-21", acao: "FAROL_RISCO_OBSOLETOS_ENVIADO", entrega: "Estoque parado por faixa de dias" },
  { nome: "Farol de Investimento Operacional", canal: "Slack", frequencia: "Sexta, 16h", desde: "2026-09-25", acao: "FAROL_INVESTIMENTO_OPERACIONAL_ENVIADO", entrega: "Cortesia, degustação, sensorial e uso e consumo da semana" },
  { nome: "Farol de Transferências Fábrica → Loja", canal: "Slack", frequencia: "Dias úteis, 17h", desde: "2026-09-28", acao: "FAROL_TRANSFERENCIAS_ENVIADO", entrega: "Transferências do dia para as lojas" },
  { nome: "Farol de Recebimento Pendente", canal: "Slack", frequencia: "Terça e quinta, 09h30", desde: "2026-10-01", acao: "FAROL_RECEBIMENTO_PENDENTE_ENVIADO", entrega: "Notas de transferência sem recebimento" },
  { nome: "Farol Premium", canal: "Slack", frequencia: "Segunda, 09h30", desde: "2026-10-07", acao: "FAROL_PREMIUM_ENVIADO", entrega: "Acompanhamento da linha premium" },
  { nome: "Farol de Testes Industriais", canal: "Slack", frequencia: "Dias 1 e 16", desde: "2026-10-01", entrega: "Consumo dos testes industriais da quinzena" },
  { nome: "Notificação de NF-e de baixa", canal: "Slack", frequencia: "A cada baixa fiscal", desde: "2026-10-02", acao: "BAIXA_NFE_NOTIFICADA", entrega: "Nota fiscal emitida para a baixa aprovada" },
  { nome: "Aprovação de baixa por e-mail", canal: "E-mail", frequencia: "A cada solicitação", desde: "2026-08-13", acao: "BAIXA_APROVACAO_EMAIL_ENVIADO", entrega: "Pedido de aprovação ao Diretor e ao Financeiro" },
  { nome: "Lista de Movimentados por almoxarifado", canal: "E-mail", frequencia: "Dias úteis, 18h", desde: "2026-11-06", acao: "LISTA_MOVIMENTADOS_ENVIADA", entrega: "Itens movimentados no dia para contagem D+1" },
  { nome: "Resumo de tarefas", canal: "E-mail", frequencia: "Segunda e quinta, 12h", desde: "2026-08-24", acao: "RESUMO_TAREFAS_ENVIADO", entrega: "Pendências por responsável" },
  { nome: "Tarefas atribuídas", canal: "E-mail", frequencia: "A cada tarefa", desde: "2026-08-21", acao: "TAREFA_EMAIL_ENVIADO", entrega: "Aviso ao responsável da tarefa" },
  { nome: "Sincronização de estoque com o ERP", canal: "Sistema", frequencia: "Contínua (API)", desde: "2026-08-28", acao: "SINCRONIZAR_ESTOQUE_API", entrega: "Saldo do ERP no Stock Savvy sem upload manual" },
  { nome: "Contagem cíclica automática", canal: "Sistema", frequencia: "Diária, 08h30", desde: "2026-07-04", acao: "CRIAR_MISSAO", entrega: "Missões de inventário geradas pelos planos de contagem" },
  { nome: "Foto diária de disponibilidade", canal: "Sistema", frequencia: "Diária, 09h", desde: "2026-10-01", entrega: "Ruptura e venda perdida por loja e SKU" },
  { nome: "Congelamento do consumo de produção", canal: "Sistema", frequencia: "Diária, 00h30", desde: "2026-09-01", entrega: "Dispersão do mês fechada para o MBR" },
  { nome: "Alerta de assinatura do inventário", canal: "E-mail", frequencia: "Diária, 12h", desde: "2026-10-01", entrega: "Fechamentos aguardando assinatura" },
];

export async function carregarAutomacoes(mes: string) {
  const ini = `${mes}-01T00:00:00`, fim = `${fimDoMes(mes)}T23:59:59`;
  const contar = async (acao: string) => { const { count } = await sb.from("audit_logs").select("id", { count: "exact", head: true }).eq("acao", acao).gte("created_at", ini).lte("created_at", fim); return count ?? 0; };
  const linhas = await Promise.all(AUTOMACOES.map(async (a) => ({ ...a, envios: a.acao ? await contar(a.acao).catch(() => null) : null })));
  return { linhas: linhas.filter((a) => a.desde <= fimDoMes(mes)) };
}
export type DadosAutomacoes = Awaited<ReturnType<typeof carregarAutomacoes>>;

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function slideAutomacoes(p: Pptx, mesLabel: string, pag: number, a: DadosAutomacoes | null) {
  const s = novoSlide(p), L = a?.linhas ?? [];
  const envios = L.reduce((t, x) => t + (x.envios ?? 0), 0), slack = L.filter((x) => x.canal === "Slack").length;
  cabecalho(s, `${L.length} automações rodam sozinhas; ${fmtNum(envios)} mensagens e rotinas registradas no mês`, mesLabel, pag, "Farois no Slack, e-mails automáticos e rotinas agendadas que substituíram acompanhamento manual.");
  if (!L.length) { caixaLeitura(s, MARGEM, 1.7, LC, 1.2, "Sem automações", "Nenhuma automação ativa no mês.", { corRotulo: COR.ATENCAO }); return; }
  linhaKpis(s, 1.62, [
    { valor: fmtNum(L.length), rotulo: "Automações ativas" },
    { valor: fmtNum(slack), rotulo: "Farois e avisos no Slack", cor: COR.VERDE_AMAZONIA },
    { valor: fmtNum(L.filter((x) => x.canal === "E-mail").length), rotulo: "Rotinas por e-mail" },
    { valor: fmtNum(L.filter((x) => x.canal === "Sistema").length), rotulo: "Rotinas internas agendadas" },
    { valor: fmtNum(envios), rotulo: "Execuções registradas no mês", cor: COR.AZUL_INSTITUCIONAL },
  ], 0.7);
  const ord = [...L].sort((x, y) => (x.canal === y.canal ? x.desde.localeCompare(y.desde) : x.canal.localeCompare(y.canal)));
  const cor = { Slack: COR.VERDE_AMAZONIA, "E-mail": COR.INFO, Sistema: COR.AZUL_INSTITUCIONAL } as const;
  tabela(s, MARGEM, 2.5, LC, Math.min(4.45, 0.215 * (ord.length + 1)), ["Automação", "Canal", "Frequência", "Desde", "No mês", "O que entrega"], ord.map((x) => [x.nome, { t: x.canal, cor: cor[x.canal], negrito: true }, x.frequencia, dataBr(x.desde), x.envios == null ? "—" : fmtNum(x.envios), x.entrega]), { larguras: [3.0, 0.8, 1.9, 0.85, 0.75, 5.03], tamanho: 8, margemV: 0.01 });
}

/** Linha do tempo das implantações, mês a mês, desde o início da operação de controle. */
export function slideLinhaTempo(p: Pptx, mesLabel: string, pag: number, marcos: { mes: string; itens: string[] }[]) {
  const s = novoSlide(p);
  cabecalho(s, `${marcos.reduce((t, m) => t + m.itens.length, 0)} implantações em ${marcos.length} meses: do inventário manual à operação automatizada`, mesLabel, pag, "Linha do tempo da operação de controle — o que entrou em cada mês.");
  const n = marcos.length, w = LC / n, y = 2.35;
  s.addShape("line" as any, { x: MARGEM, y, w: LC, h: 0, line: { color: COR.AZUL_INSTITUCIONAL, width: 2 } });
  marcos.forEach((m, i) => {
    const x = MARGEM + i * w;
    retangulo(s, x + w / 2 - 0.1, y - 0.1, 0.2, 0.2, { fill: COR.VERDE_AMAZONIA, arredondado: true, raio: 0.1 });
    texto(s, x, y - 0.55, w, 0.3, `${MESES[Number(m.mes.slice(5, 7)) - 1]}/${m.mes.slice(2, 4)}`, { tamanho: 13, negrito: true, cor: COR.AZUL_INSTITUCIONAL, alinhamento: "center" });
    retangulo(s, x + 0.06, y + 0.3, w - 0.12, 3.7, { fill: i % 2 ? "F4F5F7" : COR.BRANCO, borda: COR.CINZA_CLARO, arredondado: true, raio: 0.06 });
    texto(s, x + 0.14, y + 0.4, w - 0.28, 3.5, m.itens.map((t) => `• ${t}`).join("\n"), { tamanho: 9 });
  });
}

type Pdca = { frente: string; plan: string; doo: string; desde: string; check: string; act: string };
/** PDCA desde o início da operação: dor/demanda, solução, resultado medido (do sistema quando disponível) e padronização. */
export function linhasPdca(c: Consolidado, x: Extras): Pdca[] {
  const d = c.d, ep = d.evolucaoPonderada.filter((e) => e.item != null), mov = d.evolucaoMovimentados.filter((m) => m.pct != null);
  const pri = ep[0], ult = ep.at(-1);
  const ganho = (a?: number | null, b?: number | null, menor = false) => (a == null || b == null ? "sem série no sistema" : `${fmtPct(a)} → ${fmtPct(b)} (${b - a > 0 ? "+" : ""}${fmtPP(b - a)}${(menor ? b < a : b > a) ? ", melhora" : ""})`);
  const fs = x.dispersao?.furo.serie ?? [], rs = (x.rupturas?.serie ?? []).filter((r) => r.pct != null), as = (x.atlas?.serieAcerto ?? []).filter((r) => r.acerto != null);
  return [
    { frente: "Inventário", plan: "Acurácia baixa e recontagens manuais, sem rastreio por item", doo: "Missões de contagem cíclica, recontagem com aprovação e fechamento por almoxarifado", desde: "2026-06", check: `Item a item ${ganho(pri?.item, ult?.item)}; IAP ${fmtPct(ult?.iap)}`, act: "Planos de contagem automáticos por grupo e ABC; assinatura do fechamento" },
    { frente: "Movimentados", plan: "Divergência só aparecia no fechamento do mês", doo: "Conciliação diária sistema × físico e Lista de Movimentados D+1 por e-mail", desde: mov[0]?.mes ?? "2026-05", check: `Conciliação diária ${ganho(mov[0]?.pct, mov.at(-1)?.pct)}`, act: "Cobrança D+1 no Farol de Movimentados desde 05/11" },
    { frente: "Baixas", plan: "Baixa sem fluxo de aprovação nem causa padronizada", doo: "Relatório de Baixa com motivo fechado, aprovação Diretor/Financeiro por e-mail e NF-e notificada", desde: "2026-07", check: `${fmtMoeda(c.baixas?.total)} no mês; ${fmtMoeda(c.baixas?.acumuladoAno)} no ano, 100% com motivo`, act: "Farol de Baixas diário no Slack e pacote mensal" },
    { frente: "Shelf life e FEFO", plan: "Perda por vencimento e quebra de FEFO descobertas tarde", doo: "Farol de Shelf Life, ações de lote e Farol de FEFO no Slack", desde: "2026-09", check: `Recuperado ${fmtMoeda((x.recuperacao?.receitaRecuperada ?? 0) + (x.recuperacao?.savingRecuperado ?? 0))} no mês; quebra de FEFO ${fmtPct((c.fefo as any)?.atual?.taxa ?? (c.fefo as any)?.taxa)}`, act: "Ações de lote com dono e prazo; FEFO auditado duas vezes por dia" },
    { frente: "Dispersão de ficha", plan: "Consumo de OP sem comparação com a ficha técnica", doo: "Dispersão de Lote com Pareto, viés × variabilidade e Farol diário (SP e Pará)", desde: fs[0]?.mes ?? "2026-09", check: `Furo de ficha ${ganho(fs[0]?.pct, fs.at(-1)?.pct, true)}`, act: "Revisão de fichas com desvio sistemático; correção de apontamento" },
    { frente: "Abastecimento", plan: "Ruptura nas lojas sem medição diária", doo: "Foto diária de disponibilidade, motor de reposição, pedidos e Farol de Transferências", desde: rs[0]?.mes ?? "2026-10", check: `Ruptura ${ganho(rs[0]?.pct, rs.at(-1)?.pct, true)}; meta ≤ 3%`, act: "Projeção do CD integrada ao PCP; transferir excesso antes de produzir" },
    { frente: "Divergências (Atlas)", plan: "Causa da divergência investigada caso a caso, sem histórico", doo: "Atlas com motor de regras, modelo treinado e análise da IA com sinais do sistema", desde: as[0]?.mes ?? "2026-10", check: `Acerto da causa ${ganho(as[0]?.acerto, as.at(-1)?.acerto)}`, act: "Confirmar a causa em toda divergência para seguir treinando o modelo" },
  ];
}

export function slidesPdca(p: Pptx, mesLabel: string, prox: () => number, c: Consolidado, x: Extras) {
  const L = linhasPdca(c, x);
  for (const [i, parte] of [L.slice(0, 4), L.slice(4)].entries()) {
    if (!parte.length) continue;
    const s = novoSlide(p);
    cabecalho(s, i === 0 ? "PDCA da operação de controle: dores, soluções e resultados medidos" : "PDCA da operação de controle (continuação)", mesLabel, prox(), "Plan = dor ou demanda · Do = solução implantada · Check = resultado medido no Stock Savvy · Act = padronização e próximo passo.");
    const w = [1.45, 2.3, 2.85, 0.65, 2.7, 2.38];
    const cab = ["Frente", "P · Dor / demanda", "D · Solução implantada", "Desde", "C · Resultado medido", "A · Padronização"];
    tabela(s, MARGEM, 1.65, LC, 0.38 + parte.length * 1.12, cab, parte.map((l) => [{ t: l.frente, negrito: true, cor: COR.AZUL_INSTITUCIONAL }, l.plan, l.doo, `${MESES[Number(l.desde.slice(5, 7)) - 1]}/${l.desde.slice(2, 4)}`, { t: l.check, negrito: true, cor: COR.SUCESSO }, l.act]), { larguras: w, tamanho: 9.5, corCab: COR.AZUL_INSTITUCIONAL });
  }
}

/** Marcos da linha do tempo a partir do cadastro de automações e dos controles. */
export function marcosLinhaTempo(mes: string, c: Consolidado, x: Extras) {
  const m = new Map<string, string[]>();
  const add = (k: string | null | undefined, t: string) => { if (!k || k.slice(0, 7) > mes) return; const kk = k.slice(0, 7); m.set(kk, [...(m.get(kk) ?? []), t]); };
  add(c.d.evolucaoMovimentados.find((p) => p.pct != null)?.mes, "Controle de Movimentados (conciliação diária)");
  add("2026-06", "Missões de contagem e recontagem com aprovação");
  add("2026-07", "Relatório de Baixa com aprovação e baixa fiscal");
  for (const a of AUTOMACOES) add(a.desde, a.nome);
  add(x.dispersao?.furo.serie[0]?.mes, "Dispersão de ficha técnica com Pareto");
  add(x.atlas?.serieAcerto[0]?.mes, "Atlas com IA de causa das divergências");
  add("2026-11", "Análise da IA com sinais de todo o sistema");
  return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, itens]) => ({ mes: k, itens: [...new Set(itens)] })).slice(-7);
}
