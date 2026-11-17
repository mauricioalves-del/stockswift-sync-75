// Mensagens de Risco sem Giro (Obsoletos) para o Slack — mesmo modelo de Trend do Risco de Shelf, com um padrão
// de posicionamento para Comercial e Produtos (puro, testável).
import { brl, chaveEnvio, dataBR, dividir, indexarEnviosPorLote, separarJaEnviados, type EnvioSlack } from "./shelf-slack";
export { brl, chaveEnvio, dataBR, dividir, indexarEnviosPorLote, separarJaEnviados, type EnvioSlack };

export type ItemSlackObs = { sku: string; descricao: string; lote: string; almoxarifado: string; dias_sem_mov: number | null; faixa: string; quantidade: number; valor: number };
export const FAIXA_ROTULO: Record<string, string> = { "30-60": "30 a 60 dias", "61-90": "61 a 90 dias", "+90": "Mais de 90 dias" };

/** Prazo para posicionamento conforme a faixa mais crítica da Trend (dias úteis). */
export const SLA_DIAS_UTEIS: Record<string, number> = { "+90": 3, "61-90": 5, "30-60": 7 };
export function somaDiasUteis(d: Date, n: number): Date {
  const x = new Date(d); let f = 0;
  while (f < n) { x.setDate(x.getDate() + 1); const w = x.getDay(); if (w !== 0 && w !== 6) f++; }
  return x;
}
export function prazoPosicionamento(itens: ItemSlackObs[], hoje = new Date()): { faixa: string; dias: number; data: Date } {
  const ordem = ["+90", "61-90", "30-60"];
  const faixa = ordem.find((f) => itens.some((i) => i.faixa === f)) ?? "30-60";
  const dias = SLA_DIAS_UTEIS[faixa] ?? 7;
  return { faixa, dias, data: somaDiasUteis(hoje, dias) };
}

export function almoxDosItens(itens: ItemSlackObs[]): string {
  return Array.from(new Set(itens.map((l) => l.almoxarifado).filter(Boolean))).sort().join(", ");
}
export function totalValor(itens: ItemSlackObs[]): number {
  return Math.round(itens.reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100;
}
export function tituloTrendObs(observacao: string, almox: string, data: Date, numero?: number | null): string {
  const n = numero ? ` #${numero}` : "";
  return `:warning: *Risco sem Giro${n}* - ${observacao.trim()} - Almox - ${almox} - ${dataBR(data)}`;
}

function pad(s: string, n: number, dir: "l" | "r" = "r") {
  const t = s.length > n ? s.slice(0, n - 1) + "…" : s;
  return dir === "r" ? t.padEnd(n) : t.padStart(n);
}
/** Tabela monoespaçada (bloco de código no Slack). */
export function tabelaItensObs(itens: ItemSlackObs[]): string {
  const cab = `${pad("SKU", 11)} ${pad("Produto", 28)} ${pad("Lote", 18)} ${pad("Almox", 14)} ${pad("Dias s/ mov", 11, "l")} ${pad("Faixa", 8)} ${pad("Saldo", 9, "l")} ${pad("Valor", 14, "l")}`;
  const linhas = itens.map((l) => `${pad(l.sku, 11)} ${pad(l.descricao, 28)} ${pad(l.lote || "—", 18)} ${pad(l.almoxarifado, 14)} ${pad(l.dias_sem_mov == null ? "—" : String(l.dias_sem_mov), 11, "l")} ${pad(l.faixa, 8)} ${pad(l.quantidade.toLocaleString("pt-BR"), 9, "l")} ${pad(brl(l.valor), 14, "l")}`);
  return "```\n" + [cab, "-".repeat(cab.length), ...linhas].join("\n") + "\n```";
}

export type Equipe = "Comercial" | "Produtos";
/** Padrão de resposta no fio: cada equipe responde numa linha, no formato abaixo, até o prazo. */
export function padraoPosicionamento(equipes: Equipe[], prazo: { dias: number; data: Date; faixa: string }): string {
  const linhas = [`:memo: *Padrão de posicionamento* — responder neste fio até *${dataBR(prazo.data)}* (${prazo.dias} dias úteis · faixa mais crítica: ${FAIXA_ROTULO[prazo.faixa] ?? prazo.faixa}).`];
  if (equipes.includes("Comercial")) linhas.push(
    "*Comercial* — destino comercial do estoque parado:",
    "`COMERCIAL | SKU: <código ou TODOS> | Ação: <Promoção · Kit/combo · Venda B2B · Transferência para loja · Venda colaborador · Doação/brinde> | Desconto: <%> | Canal: <loja/e-commerce/B2B> | Volume previsto: <un> | Prazo: <dd/mm>`",
  );
  if (equipes.includes("Produtos")) linhas.push(
    "*Produtos* — decisão de portfólio e uso do material:",
    "`PRODUTOS | SKU: <código ou TODOS> | Decisão: <Manter no portfólio · Reaproveitar em produção · Reformular · Descontinuar · Baixar> | Uso alternativo: <SKU/receita> | Justificativa: <texto> | Prazo: <dd/mm>`",
  );
  linhas.push("_Uma linha por SKU (ou TODOS). Sem posicionamento no prazo, o item segue para baixa no próximo pacote. O posicionamento é registrado como Ação vinculada no Mapeamento de Risco — Obsoletos._");
  return linhas.join("\n");
}

/** Mensagem única (webhook, sem fio): título, responsáveis, tabela e padrão de posicionamento. */
export function mensagemWebhookObs(p: { titulo: string; mencoes: string[]; departamentos: string[]; itens: ItemSlackObs[]; equipes: Equipe[]; prazo: { dias: number; data: Date; faixa: string } }): string {
  const cab = `*Para posicionamento:* ${p.mencoes.length ? p.mencoes.join(" ") : "_sem responsáveis selecionados_"}\n` +
    (p.departamentos.length ? `Departamentos: ${p.departamentos.join(", ")}\n` : "") +
    `*${p.itens.length} item(ns) sem giro · Valor parado: ${brl(totalValor(p.itens))}*`;
  return [p.titulo, cab, tabelaItensObs(p.itens.slice(0, 40)), p.itens.length > 40 ? `_+${p.itens.length - 40} item(ns) no sistema (Mapeamento de Risco — Obsoletos)._` : "", padraoPosicionamento(p.equipes, p.prazo)].filter(Boolean).join("\n");
}
