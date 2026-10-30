// Regras puras do alerta de assinatura do fechamento de inventário (sem APIs do Deno: testável com bun).

export type Pendencia = {
  fechamento_id: number; data_fechamento: string; almoxarifado: string | null; arquivo: string | null;
  total_itens: number | null; total_divergentes: number | null; valor_divergente: number | string | null; dias_aberto: number;
  papel: string; papel_nome: string; origem_responsavel: string | null; user_id: string | null; nome: string | null; email: string | null;
};
export type Envio = { tipo: "RESPONSAVEL" | "SEM_RESPONSAVEL"; email: string; nome: string | null; user_id: string | null; itens: Pendencia[] };

/** Um e-mail por responsável com tudo o que ele precisa assinar; pendências sem responsável vão aos administradores. */
export function montarEnvios(pend: Pendencia[], admins: { email: string; nome: string | null; user_id: string }[]): Envio[] {
  const porEmail = new Map<string, Envio>();
  for (const p of pend) {
    if (!p.user_id || !p.email) continue;
    const k = p.email.trim().toLowerCase();
    const e = porEmail.get(k) ?? { tipo: "RESPONSAVEL" as const, email: p.email.trim(), nome: p.nome, user_id: p.user_id, itens: [] };
    e.itens.push(p);
    porEmail.set(k, e);
  }
  const semResp = pend.filter((p) => !p.user_id || !p.email);
  const envios = [...porEmail.values()];
  if (semResp.length) {
    for (const a of admins) envios.push({ tipo: "SEM_RESPONSAVEL", email: a.email, nome: a.nome, user_id: a.user_id, itens: semResp });
  }
  for (const e of envios) e.itens.sort((a, b) => b.dias_aberto - a.dias_aberto || a.fechamento_id - b.fechamento_id);
  return envios;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (v: unknown) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function assunto(e: Envio): string {
  const n = new Set(e.itens.map((i) => i.fechamento_id)).size;
  const maior = Math.max(...e.itens.map((i) => i.dias_aberto));
  if (e.tipo === "SEM_RESPONSAVEL") return `[Inventário] ${n} fechamento(s) sem responsável pela assinatura`;
  return `[Inventário] Assinatura pendente: ${n} fechamento(s) — ${maior} dia(s) em aberto`;
}

export function html(e: Envio, appUrl: string, quando: string): string {
  const linhas = e.itens.map((i) => {
    const cor = i.dias_aberto >= 5 ? "#DC2626" : i.dias_aberto >= 2 ? "#D97706" : "#111827";
    const link = `${appUrl}/atlas/assinatura-fechamento/${i.fechamento_id}?papel=${encodeURIComponent(i.papel)}`;
    const td = 'style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px"';
    return `<tr>
      <td ${td}><b>#${i.fechamento_id}</b></td>
      <td ${td}>${esc(dataBR(i.data_fechamento))}</td>
      <td ${td}>${esc(i.almoxarifado)}</td>
      <td ${td}>${esc(i.papel_nome)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:700;color:${cor}">${i.dias_aberto}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">${i.total_divergentes ?? 0}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">${esc(brl(i.valor_divergente))}</td>
      <td ${td}><a href="${esc(link)}" style="color:#4E7F84;font-weight:700">${e.tipo === "SEM_RESPONSAVEL" ? "Abrir" : "Abrir e assinar"}</a></td>
    </tr>`;
  }).join("");
  const intro = e.tipo === "SEM_RESPONSAVEL"
    ? `Os fechamentos abaixo têm assinatura pendente <b>sem nenhum responsável cadastrado</b> para o papel indicado. Cadastre o responsável em Atlas › Fechamento Inventário › Responsáveis pelas assinaturas.`
    : `Olá${e.nome ? `, ${esc(e.nome.split(" ")[0])}` : ""}. Os fechamentos de inventário abaixo aguardam a <b>sua assinatura</b>. Este lembrete se repete todos os dias às 12h até a assinatura ser registrada.`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:820px">
    <h2 style="margin:0 0 4px;color:#1f2937">Assinatura do fechamento de inventário</h2>
    <div style="font-size:12px;color:#6b7280;margin-bottom:14px">Stock Savvy · Mágio Chocolates · ${esc(quando)}</div>
    <p style="font-size:14px;line-height:1.5">${intro}</p>
    <table style="border-collapse:collapse;width:100%;margin-top:8px">
      <thead><tr style="background:#F3F4F6">
        <th style="padding:6px 8px;text-align:left;font-size:11px">Fechamento</th><th style="padding:6px 8px;text-align:left;font-size:11px">Data</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px">Almoxarifado</th><th style="padding:6px 8px;text-align:left;font-size:11px">Papel</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px">Dias em aberto</th><th style="padding:6px 8px;text-align:right;font-size:11px">Divergentes</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px">Valor divergente</th><th style="padding:6px 8px;font-size:11px"></th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="font-size:11px;color:#6b7280;margin-top:16px">O inventário só fica Fechado com as três ciências: Diretor de Operações, Coordenador Financeiro e Responsável pelo Departamento.</p>
  </div>`;
}
