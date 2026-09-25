// Edge Function: Farol de Transferências (Fábrica → Loja).
// Disparada por pg_cron de segunda a sexta às 17h de Brasília, para montar e
// enviar por e-mail (Gmail via Lovable Connector Gateway) o resumo das
// transferências de estoque da Fábrica para a Loja no dia corrente.
//
// Fonte de dados: view `v_transferencias_fabrica_loja` (dedicada, baseada na
// mesma tabela `checagens_fefo` usada pelo Farol FEFO Diário — filtrada só
// pela rota Fábrica → Loja).
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
const FINALIDADE = "Farol de Transferências";
const APP_URL = "https://stockswift-sync-75.lovable.app/quebras-fefo";

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

function formatNum(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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

function kpiHtml(titulo: string, valor: string, cor?: string): string {
  return `<div style="display:inline-block;width:23%;min-width:150px;margin:0 1% 10px 0;vertical-align:top;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#F9FAFB;border-left:3px solid ${cor || "#111827"}">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280">${esc(titulo)}</div>
    <div style="font-size:18px;font-weight:700;color:#111827">${esc(valor)}</div>
  </div>`;
}

function dataHojeSaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const y = sp.getFullYear();
  const m = String(sp.getMonth() + 1).padStart(2, "0");
  const d = String(sp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_transferencias_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const dataAlvo: string = (body?.data as string | undefined) || dataHojeSaoPaulo();
    const dataAlvoFmt = new Date(`${dataAlvo}T00:00:00`).toLocaleDateString("pt-BR");

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Transferências Fábrica → Loja do dia ====
    const { data: linhas, error: lerr } = await admin
      .from("v_transferencias_fabrica_loja")
      .select("id_produto, descricao, numero_requisicao, lote_movimentado, qtd_movimentado, validade_movimentado, quebra")
      .eq("data", dataAlvo)
      .order("numero_requisicao", { ascending: true });
    if (lerr) throw lerr;

    const todas = linhas ?? [];
    const requisicoes = new Set(todas.map((r: any) => r.numero_requisicao));
    const qtdTotal = todas.reduce((s: number, r: any) => s + (Number(r.qtd_movimentado) || 0), 0);
    const quebras = todas.filter((r: any) => r.quebra === true);

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

    const kpis = [
      kpiHtml("Requisições no dia", String(requisicoes.size)),
      kpiHtml("Itens transferidos", String(todas.length)),
      kpiHtml("Quantidade total", formatNum(qtdTotal)),
      kpiHtml("Quebras de FEFO", String(quebras.length), quebras.length > 0 ? "#DC2626" : "#16A34A"),
    ].join("");

    const linhasHtml = todas.length
      ? todas.map((r: any) => {
          const cor = r.quebra ? "#DC2626" : "#111827";
          return `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.numero_requisicao)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-family:monospace">${esc(r.id_produto)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.descricao)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-family:monospace">${esc(r.lote_movimentado)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">${esc(formatNum(Number(r.qtd_movimentado) || 0))}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;color:${cor};font-weight:${r.quebra ? "700" : "400"}">${r.quebra ? "⚠ quebra" : "ok"}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="6" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Nenhuma transferência Fábrica → Loja em ${esc(dataAlvoFmt)}.</td></tr>`;

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol de Transferências — Fábrica → Loja — ${esc(dataAlvoFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Resumo das transferências de estoque da Fábrica para a Loja no dia, com sinalização de quebras da regra FEFO.</p>

${kpis}

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Transferências do dia</h3>
<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">Requisição</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">SKU</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">Produto</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">Lote</th>
      <th style="padding:4px 8px;text-align:right;font-size:10.5px;color:#6b7280;text-transform:uppercase">Qtd</th>
      <th style="padding:4px 8px;text-align:center;font-size:10.5px;color:#6b7280;text-transform:uppercase">FEFO</th>
    </tr>
  </thead>
  <tbody>${linhasHtml}</tbody>
</table>

<p style="margin:20px 0">
  <a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Controle FEFO na plataforma →</a>
</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente de segunda a sexta, às 17h, pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol de Transferências — Fábrica → Loja — ${dataAlvoFmt} (${todas.length} item(ns)${quebras.length ? `, ${quebras.length} quebra(s)` : ""})`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_TRANSFERENCIAS_ENVIADO" : "FAROL_TRANSFERENCIAS_FALHA",
      entidade: "checagens_fefo",
      payload: {
        data: dataAlvo,
        destinatarios: toList,
        qtd_requisicoes: requisicoes.size,
        qtd_itens: todas.length,
        qtd_total: qtdTotal,
        qtd_quebras: quebras.length,
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
      data: dataAlvo,
      qtd_requisicoes: requisicoes.size,
      qtd_itens: todas.length,
      qtd_total: qtdTotal,
      qtd_quebras: quebras.length,
      destinatarios: toList,
      gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("farol-transferencias", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
