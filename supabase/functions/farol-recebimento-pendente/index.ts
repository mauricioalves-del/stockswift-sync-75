// Edge Function: Farol de Recebimento Pendente de Transferências.
// Disparada por pg_cron toda terça e quinta-feira às 9h de Brasília, para
// montar e enviar por e-mail (Gmail via Lovable Connector Gateway) o resumo
// das notas fiscais de transferência emitidas ainda sem recebimento
// confirmado, com os dias úteis em aberto.
//
// Fonte de dados: tabela `notas_transferencia_recebimento`, alimentada pela
// importação periódica da planilha "Transferência" (Suprimentos → Farol de
// Recebimento Pendente → Importar Transferências).
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
const FINALIDADE = "Farol de Recebimento Pendente";
const APP_URL = "https://stockswift-sync-75.lovable.app/suprimentos/farol-recebimento";

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
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNum(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
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

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function dataHojeSaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const y = sp.getFullYear();
  const m = String(sp.getMonth() + 1).padStart(2, "0");
  const d = String(sp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dias úteis (seg-sex) entre duas datas ISO, exclusive a data inicial. */
function diasUteisEntre(inicioISO: string, fimISO: string): number {
  const inicio = new Date(`${inicioISO}T00:00:00`);
  const fim = new Date(`${fimISO}T00:00:00`);
  if (fim <= inicio) return 0;
  let dias = 0;
  const cursor = new Date(inicio);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= fim) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_recebimento_pendente_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const hoje = dataHojeSaoPaulo();
    const agoraFmt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Notas pendentes de recebimento ====
    const pageSize = 1000;
    let linhasRaw: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("notas_transferencia_recebimento")
        .select("nr_nf, dt_emissao, empresa, almox, estado, qtd, vt_total_item, nota_cancelada")
        .eq("recebimento", "Pendente")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      linhasRaw.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    const linhas = linhasRaw.filter((r) => r.nota_cancelada !== "S");

    const porNF = new Map<string, { nr_nf: string; dt_emissao: string; empresa: string; almox: string; estado: string | null; itens: number; qtd: number; valor: number }>();
    linhas.forEach((r: any) => {
      const cur = porNF.get(r.nr_nf) ?? {
        nr_nf: r.nr_nf, dt_emissao: r.dt_emissao, empresa: r.empresa, almox: r.almox, estado: r.estado,
        itens: 0, qtd: 0, valor: 0,
      };
      cur.itens += 1;
      cur.qtd += Number(r.qtd) || 0;
      cur.valor += Number(r.vt_total_item) || 0;
      if (r.dt_emissao < cur.dt_emissao) cur.dt_emissao = r.dt_emissao;
      porNF.set(r.nr_nf, cur);
    });

    const notas = [...porNF.values()]
      .map((r) => ({ ...r, diasUteis: diasUteisEntre(r.dt_emissao, hoje) }))
      .sort((a, b) => b.diasUteis - a.diasUteis);

    const totalGeral = notas.reduce((s, r) => s + r.valor, 0);
    const totalItens = notas.reduce((s, r) => s + r.itens, 0);
    const maiorAtraso = notas.length ? Math.max(...notas.map((r) => r.diasUteis)) : 0;

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
      kpiHtml("Notas pendentes", String(notas.length)),
      kpiHtml("Itens pendentes", String(totalItens)),
      kpiHtml("Valor total pendente", formatBRL(totalGeral)),
      kpiHtml("Maior atraso (dias úteis)", String(maiorAtraso), maiorAtraso > 5 ? "#DC2626" : maiorAtraso > 2 ? "#D97706" : "#16A34A"),
    ].join("");

    const linhasHtml = notas.length
      ? notas.map((r) => {
          const cor = r.diasUteis > 5 ? "#DC2626" : r.diasUteis > 2 ? "#D97706" : "#111827";
          return `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.estado || "—")}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-family:monospace">${esc(r.nr_nf)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(fmtDataBR(r.dt_emissao))}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;color:${cor};font-weight:700">${r.diasUteis}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.empresa)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.almox)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">${r.itens}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">${esc(formatNum(r.qtd))}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">${esc(formatBRL(r.valor))}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="9" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Nenhuma nota pendente de recebimento — tudo em dia. 🎉</td></tr>`;

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol de Recebimento Pendente — ${esc(agoraFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Notas fiscais de transferência emitidas ainda sem recebimento confirmado, com os dias úteis em aberto desde a emissão.</p>

${kpis}

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Notas pendentes</h3>
<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">Estado</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">NF</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">Dt. Emissão</th>
      <th style="padding:4px 8px;text-align:right;font-size:10.5px;color:#6b7280;text-transform:uppercase">Dias Úteis</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">DE</th>
      <th style="padding:4px 8px;text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase">PARA (Almox)</th>
      <th style="padding:4px 8px;text-align:right;font-size:10.5px;color:#6b7280;text-transform:uppercase">Itens</th>
      <th style="padding:4px 8px;text-align:right;font-size:10.5px;color:#6b7280;text-transform:uppercase">Qtde</th>
      <th style="padding:4px 8px;text-align:right;font-size:10.5px;color:#6b7280;text-transform:uppercase">Valor Total</th>
    </tr>
  </thead>
  <tbody>${linhasHtml}</tbody>
</table>

<p style="margin:20px 0">
  <a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Farol de Recebimento na plataforma →</a>
</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente toda terça e quinta-feira, às 9h, pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol de Recebimento Pendente — ${fmtDataBR(hoje)} (${notas.length} nota(s)${maiorAtraso > 5 ? `, atraso de até ${maiorAtraso} dias úteis` : ""})`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_RECEBIMENTO_PENDENTE_ENVIADO" : "FAROL_RECEBIMENTO_PENDENTE_FALHA",
      entidade: "notas_transferencia_recebimento",
      payload: {
        data: hoje,
        destinatarios: toList,
        qtd_notas: notas.length,
        qtd_itens: totalItens,
        valor_total: totalGeral,
        maior_atraso: maiorAtraso,
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
      data: hoje,
      qtd_notas: notas.length,
      qtd_itens: totalItens,
      valor_total: totalGeral,
      maior_atraso: maiorAtraso,
      destinatarios: toList,
      gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("farol-recebimento-pendente", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
