// Edge Function: Farol de Baixas Operacionais (envio diário, segunda a sexta, 15:00).
// Espelha a mesma lógica de status de src/lib/baixa-aprovacao.ts (statusAprovacao):
// PENDENTE (sem nenhuma assinatura), PARCIAL (uma assinatura feita) e
// AGUARDANDO_ADMIN (as duas assinaturas prontas, faltando o Administrador
// emitir a Baixa Fiscal). Destaca quantas assinaturas faltam do Diretor de
// Operações e do Coordenador Financeiro, e sinaliza claramente quando ambos
// já aprovaram e falta só o Administrador agir.
//
// Protegida por segredo compartilhado (header x-cron-secret), já que é
// disparada por um job agendado, sem sessão de usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";
const FINALIDADE = "Farol de Baixas Operacionais";
const APP_URL = "https://stockswift-sync-75.lovable.app/baixas";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getCfg(admin: any, chave: string): Promise<string | null> {
  const { data } = await admin.from("app_config").select("valor").eq("chave", chave).maybeSingle();
  const v = data?.valor;
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(opts: { from?: string | null; to: string[]; subject: string; html: string; replyTo?: string | null }): string {
  const headers: string[] = [];
  if (opts.from) headers.push(`From: ${opts.from}`);
  headers.push(`To: ${opts.to.join(", ")}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  const subj = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  headers.push(`Subject: ${subj}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/html; charset="UTF-8"');
  const msg = headers.join("\r\n") + "\r\n\r\n" + opts.html;
  return b64url(msg);
}

async function sendViaGmail(raw: string): Promise<{ ok: boolean; status: number; body: string; id?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GMAIL_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GMAIL_KEY) {
    return { ok: false, status: 0, body: "Credenciais do Gmail (connector) ausentes no ambiente" };
  }
  const r = await fetch(GMAIL_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GMAIL_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const body = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body };
  let parsed: any = {}; try { parsed = JSON.parse(body); } catch { /* noop */ }
  return { ok: true, status: r.status, body, id: parsed?.id };
}

function kpiHtml(titulo: string, valor: string, destaque = false): string {
  const cor = destaque ? "#B23A2E" : "#111827";
  const bg = destaque ? "#FEF2F2" : "#F9FAFB";
  return `<div style="display:inline-block;width:22%;min-width:150px;margin:0 1% 10px 0;vertical-align:top;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:${bg}">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280">${esc(titulo)}</div>
    <div style="font-size:18px;font-weight:700;color:${cor}">${esc(valor)}</div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_baixas_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const agoraFmt = sp.toLocaleString("pt-BR");

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Linhas em aberto (fora do fluxo terminal) ====
    const pageSize = 1000;
    const linhas: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("baixa_operacional")
        .select("id, codigo_produto, descricao, lote, quantidade, valor_total, id_local, solicitacao_id, solicitante_id, status_fluxo, aprovado_diretor_operacoes_por, aprovado_coordenador_financeiro_por, data_solicitacao")
        .not("status_fluxo", "in", '("REPROVADA","APROVADA","EXECUTADA")')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      linhas.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    // ==== Classificação (mesma lógica de src/lib/baixa-aprovacao.ts::statusAprovacao) ====
    let semAssinatura = 0, parcial = 0, aguardandoAdmin = 0;
    let pendentesDO = 0, pendentesCF = 0;
    let valorTotal = 0, valorAguardandoAdmin = 0;
    const reqsAbertas = new Set<string>();
    const reqsAguardandoAdmin = new Set<string>();

    for (const b of linhas) {
      const dor = !!b.aprovado_diretor_operacoes_por;
      const fin = !!b.aprovado_coordenador_financeiro_por;
      valorTotal += Number(b.valor_total) || 0;
      if (b.solicitacao_id != null) reqsAbertas.add(String(b.solicitacao_id));
      if (!dor) pendentesDO++;
      if (!fin) pendentesCF++;
      if (dor && fin) {
        aguardandoAdmin++;
        valorAguardandoAdmin += Number(b.valor_total) || 0;
        if (b.solicitacao_id != null) reqsAguardandoAdmin.add(String(b.solicitacao_id));
      } else if (dor || fin) {
        parcial++;
      } else {
        semAssinatura++;
      }
    }

    // ==== Destinatários ====
    const { data: dests, error: derr } = await admin
      .from("cadastro_emails")
      .select("email")
      .eq("finalidade", FINALIDADE)
      .eq("ativo", true);
    if (derr) throw derr;
    if (!dests || dests.length === 0) {
      return json({
        ok: false,
        code: "MISSING_RECIPIENTS",
        error: `Nenhum destinatário ativo cadastrado para '${FINALIDADE}'. Cadastre ao menos um e-mail em Cadastros → E-mails.`,
      });
    }
    const toList = dests.map((d: any) => d.email);

    const linhaAdminHtml = reqsAguardandoAdmin.size > 0
      ? `<div style="margin:16px 0;padding:14px;border:1px solid #FCA5A5;border-radius:8px;background:#FEF2F2">
          <strong style="color:#B23A2E">⚠ Ação necessária do Administrador:</strong>
          <span style="color:#111827"> ${reqsAguardandoAdmin.size} requisição(ões) já têm as duas assinaturas (Diretor de Operações e Coordenador Financeiro) e estão aguardando a aprovação final para emissão da Baixa Fiscal — ${aguardandoAdmin} item(ns), R$ ${esc(formatBRL(valorAguardandoAdmin))}.</span>
        </div>`
      : `<div style="margin:16px 0;padding:14px;border:1px solid #BBF7D0;border-radius:8px;background:#F0FDF4;color:#166534">
          Nenhuma requisição aguardando o Administrador no momento.
        </div>`;

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol de Baixas Operacionais — ${esc(agoraFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Resumo da Fila de Aprovação de baixas de estoque.</p>

${kpiHtml("Requisições em aberto", String(reqsAbertas.size))}
${kpiHtml("Itens pendentes", String(linhas.length))}
${kpiHtml("Valor total pendente", "R$ " + formatBRL(valorTotal))}
${kpiHtml("Sem nenhuma assinatura", String(semAssinatura))}
${kpiHtml("Aguardando 2ª assinatura", String(parcial))}

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Assinaturas pendentes por etapa</h3>
${kpiHtml("Faltam do Diretor de Operações", String(pendentesDO))}
${kpiHtml("Faltam do Coordenador Financeiro", String(pendentesCF))}
${kpiHtml("Aguardando Administrador (NF)", String(aguardandoAdmin), true)}

${linhaAdminHtml}

<p style="margin:20px 0">
  <a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Fila de Aprovação na plataforma →</a>
</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente de segunda a sexta, às 15h, pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol de Baixas Operacionais — ${agoraFmt.slice(0, 10)} (${linhas.length} pendente(s), ${aguardandoAdmin} aguardando Administrador)`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_BAIXAS_ENVIADO" : "FAROL_BAIXAS_FALHA",
      entidade: "baixa_operacional",
      payload: {
        gerado_em: agoraFmt,
        destinatarios: toList,
        itens_pendentes: linhas.length,
        requisicoes_abertas: reqsAbertas.size,
        valor_total_pendente: valorTotal,
        sem_assinatura: semAssinatura,
        parcial: parcial,
        aguardando_admin: aguardandoAdmin,
        pendentes_diretor_operacoes: pendentesDO,
        pendentes_coordenador_financeiro: pendentesCF,
        erro: r.ok ? null : `${r.status}: ${r.body.slice(0, 400)}`,
      },
    });

    if (!r.ok) {
      return json({
        ok: false,
        code: r.status === 401 || r.status === 403 ? "GMAIL_AUTH_ERROR" : "GMAIL_ERROR",
        error: `Gmail HTTP ${r.status}: ${r.body.slice(0, 500)}`,
      });
    }

    return json({
      ok: true,
      itens_pendentes: linhas.length,
      requisicoes_abertas: reqsAbertas.size,
      valor_total_pendente: valorTotal,
      sem_assinatura: semAssinatura,
      parcial: parcial,
      aguardando_admin: aguardandoAdmin,
      pendentes_diretor_operacoes: pendentesDO,
      pendentes_coordenador_financeiro: pendentesCF,
      destinatarios: toList,
      gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("farol-baixas-diario", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
