// Server-only helpers para o e-mail de aprovação de Baixa Operacional.
import type { SupabaseClient } from "@supabase/supabase-js";

const GMAIL_GATEWAY =
  "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";

export const FINALIDADE_APROVACAO = "Aprovação de Baixa";

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function b64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64url(input: string): string {
  return b64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildRawEmail(o: {
  from?: string | null; to: string[]; subject: string; html: string; replyTo?: string | null;
}): string {
  const h: string[] = [];
  if (o.from) h.push(`From: ${o.from}`);
  h.push(`To: ${o.to.join(", ")}`);
  if (o.replyTo) h.push(`Reply-To: ${o.replyTo}`);
  h.push(`Subject: =?UTF-8?B?${b64(o.subject)}?=`);
  h.push("MIME-Version: 1.0");
  h.push('Content-Type: text/html; charset="UTF-8"');
  return b64url(h.join("\r\n") + "\r\n\r\n" + o.html);
}

export async function sendViaGmail(raw: string) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const GMAIL_KEY = process.env["GOOGLE_MAIL_API_KEY"];
  if (!LOVABLE_API_KEY || !GMAIL_KEY) {
    return { ok: false, status: 0, body: "Credenciais do Gmail ausentes" };
  }
  const r = await fetch(GMAIL_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GMAIL_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

export function htmlAprovacao(opts: {
  solicitacaoId: string | number;
  itens: any[];
  nomeDiretor: string;
  nomeFinanceiro: string;
  dtDiretor: unknown;
  dtFinanceiro: unknown;
  link: string | null;
}): string {
  const total = opts.itens.reduce((s, b) => s + Number(b.valor_total ?? 0), 0);
  const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR") : "—");
  const linhas = opts.itens.map((b) => `
    <tr>
      <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(b.codigo_produto)}</td>
      <td style="padding:6px 8px;font-size:12px">${esc(b.descricao)}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(b.lote || "—")}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right">${Number(b.quantidade ?? 0).toLocaleString("pt-BR")}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right">R$ ${formatBRL(Number(b.valor_total ?? 0))}</td>
      <td style="padding:6px 8px;font-size:12px">${esc(b.motivo?.descricao ?? "—")}</td>
      <td style="padding:6px 8px;font-size:12px">${esc(b.id_local ?? "—")}</td>
      <td style="padding:6px 8px;font-size:12px">${esc(b.observacao || "—")}</td>
    </tr>`).join("");

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
    <h2 style="margin:0 0 8px">Baixa Operacional Aprovada — Req #${esc(opts.solicitacaoId)}</h2>
    <p style="font-size:13px;color:#374151;margin:0 0 12px">As duas assinaturas foram concluídas. Segue o detalhamento da baixa.</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
      <thead><tr style="background:#111827;color:#fff">
        <th style="padding:8px;font-size:12px;text-align:left">Código</th>
        <th style="padding:8px;font-size:12px;text-align:left">Descrição</th>
        <th style="padding:8px;font-size:12px;text-align:left">Lote</th>
        <th style="padding:8px;font-size:12px;text-align:right">Qtd</th>
        <th style="padding:8px;font-size:12px;text-align:right">Valor</th>
        <th style="padding:8px;font-size:12px;text-align:left">Motivo</th>
        <th style="padding:8px;font-size:12px;text-align:left">Almox.</th>
        <th style="padding:8px;font-size:12px;text-align:left">Observação</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="margin-top:16px;font-size:14px;font-weight:700">Valor Total da Baixa: R$ ${formatBRL(total)}</p>
    <h3 style="font-size:13px;margin:20px 0 6px">Assinaturas</h3>
    <p style="font-size:12px;color:#374151;margin:0">
      Diretor de Operações: <b>${esc(opts.nomeDiretor)}</b> — ${esc(dt(opts.dtDiretor))}<br/>
      Coordenador Financeiro: <b>${esc(opts.nomeFinanceiro)}</b> — ${esc(dt(opts.dtFinanceiro))}
    </p>
    ${opts.link
      ? `<p style="margin-top:16px"><a href="${esc(opts.link)}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:13px">Abrir documento de aprovação (PDF)</a></p>
         <p style="font-size:11px;color:#6b7280">Link válido por 7 dias.</p>`
      : ""}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="font-size:11px;color:#6b7280">Enviado automaticamente pelo Sistema de Baixas Operacionais.</p>
  </body></html>`;
}

export async function enviarEmailAprovacao(
  admin: SupabaseClient<any>,
  args: { solicitacaoId: string | number; documentoPath: string | null; userId: string },
): Promise<{ ok: boolean; code?: string; error?: string; destinatarios?: string[] }> {
  let { data: dests } = await admin
    .from("cadastro_emails").select("email")
    .eq("finalidade", FINALIDADE_APROVACAO).eq("ativo", true);

  // Fallback: reaproveita os destinatários de Baixa Fiscal quando não há
  // cadastro específico para aprovação.
  if (!dests || dests.length === 0) {
    const r = await admin
      .from("cadastro_emails").select("email")
      .eq("finalidade", "Baixa Fiscal").eq("ativo", true);
    dests = r.data ?? null;
  }

  if (!dests || dests.length === 0) {
    await admin.from("audit_logs").insert({
      usuario: args.userId, acao: "BAIXA_APROVACAO_EMAIL_FALHA",
      entidade: "solicitacoes_baixa", entidade_id: String(args.solicitacaoId),
      payload: { erro: `Nenhum destinatário ativo com finalidade '${FINALIDADE_APROVACAO}'` },
    });
    return {
      ok: false, code: "MISSING_APROVACAO_RECIPIENTS",
      error: `Cadastre destinatários com a finalidade '${FINALIDADE_APROVACAO}' em Cadastro de E-mails.`,
    };
  }

  const { data: itens } = await admin
    .from("baixa_operacional")
    .select("codigo_produto, descricao, lote, quantidade, valor_total, id_local, observacao, aprovado_diretor_operacoes_por, aprovado_diretor_operacoes_em, aprovado_coordenador_financeiro_por, aprovado_coordenador_financeiro_em, motivo:motivo_baixa(descricao)")
    .eq("solicitacao_id", args.solicitacaoId);

  if (!itens || itens.length === 0) return { ok: false, code: "NO_ITEMS", error: "Requisição sem itens" };

  const ref = itens[0] as any;
  const nomes = new Map<string, string>();
  const ids = [ref.aprovado_diretor_operacoes_por, ref.aprovado_coordenador_financeiro_por].filter(Boolean);
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, nome, email").in("id", ids as string[]);
    for (const p of (profs ?? []) as any[]) nomes.set(p.id, p.nome || p.email || p.id);
  }

  let link: string | null = null;
  if (args.documentoPath) {
    const { data: signed } = await admin.storage
      .from("documentos-baixa").createSignedUrl(args.documentoPath, 60 * 60 * 24 * 7);
    link = signed?.signedUrl ?? null;
  }

  const { data: cfgFrom } = await admin
    .from("app_config").select("valor").eq("chave", "resend_from").maybeSingle();
  const from = (cfgFrom as any)?.valor ? String((cfgFrom as any).valor).replace(/^"|"$/g, "") : null;
  const to = (dests as any[]).map((d) => d.email);

  const html = htmlAprovacao({
    solicitacaoId: args.solicitacaoId,
    itens: itens as any[],
    nomeDiretor: nomes.get(ref.aprovado_diretor_operacoes_por) ?? "—",
    nomeFinanceiro: nomes.get(ref.aprovado_coordenador_financeiro_por) ?? "—",
    dtDiretor: ref.aprovado_diretor_operacoes_em,
    dtFinanceiro: ref.aprovado_coordenador_financeiro_em,
    link,
  });

  const r = await sendViaGmail(buildRawEmail({
    from, to, subject: `Baixa Operacional Aprovada — Req #${args.solicitacaoId}`, html,
  }));

  await admin.from("audit_logs").insert({
    usuario: args.userId,
    acao: r.ok ? "BAIXA_APROVACAO_EMAIL_ENVIADO" : "BAIXA_APROVACAO_EMAIL_FALHA",
    entidade: "solicitacoes_baixa",
    entidade_id: String(args.solicitacaoId),
    payload: {
      destinatarios: to,
      documento: args.documentoPath,
      erro: r.ok ? null : `${r.status}: ${r.body.slice(0, 400)}`,
    },
  });

  if (!r.ok) return { ok: false, code: "GMAIL_ERROR", error: `Gmail HTTP ${r.status}`, destinatarios: to };
  return { ok: true, destinatarios: to };
}
