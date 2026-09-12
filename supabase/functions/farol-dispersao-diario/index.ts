// Edge Function: Farol Diário de Dispersão de Lote.
// Disparada por pg_cron (segunda a sexta) para montar e enviar por e-mail
// (Gmail via Lovable Connector Gateway) a tabela de dispersões identificadas
// no dia anterior (D-1), agrupadas por OP e ordenadas pelo maior desvio.
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
const FINALIDADE = "Farol Dispersão Diário";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

function buildRawEmail(opts: {
  from?: string | null; to: string[]; subject: string; html: string; replyTo?: string | null;
}): string {
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

// Data-alvo: último dia útil anterior, no fuso de São Paulo (YYYY-MM-DD).
// Às segundas-feiras, considera a sexta-feira anterior (não o domingo).
function dataAlvoSaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const diaSemana = sp.getDay(); // 0=domingo, 1=segunda, ...
  const voltar = diaSemana === 1 ? 3 : 1;
  sp.setDate(sp.getDate() - voltar);
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

    // Autenticação: segredo compartilhado (chamado pelo pg_cron, sem sessão de usuário).
    const cronSecretEsperado = await getCfg(admin, "farol_dispersao_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const dataAlvo: string = (body?.data as string | undefined) || dataAlvoSaoPaulo();
    const dataAlvoFmt = new Date(`${dataAlvo}T00:00:00`).toLocaleDateString("pt-BR");

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Dispersões identificadas no dia (mesmo critério do módulo: tipo_desvio <> 'OK') ====
    const { data: linhas, error: lerr } = await admin
      .from("v_impacto_consumo")
      .select("numero_op, sku_produto_final, desc_prod, material, desc_material, um, qtd_consumo, qtd_previsto, qtd_dif, impacto_rs, tipo_desvio, dt_producao")
      .eq("dt_producao", dataAlvo)
      .not("tipo_desvio", "eq", "OK");
    if (lerr) throw lerr;

    const itens = (linhas ?? []).filter((r: any) => (r.tipo_desvio ?? "OK") !== "OK");

    // Agrupa por OP e ordena pelo desvio total (maior para menor) — mesma regra da Lista Detalhada.
    const totalPorOp = new Map<string, number>();
    for (const r of itens) {
      const k = String(r.numero_op);
      totalPorOp.set(k, (totalPorOp.get(k) ?? 0) + Math.abs(Number(r.impacto_rs ?? 0)));
    }
    itens.sort((a: any, b: any) => {
      const ta = totalPorOp.get(String(a.numero_op)) ?? 0;
      const tb = totalPorOp.get(String(b.numero_op)) ?? 0;
      if (tb !== ta) return tb - ta;
      if (a.numero_op !== b.numero_op) return String(a.numero_op).localeCompare(String(b.numero_op));
      return Math.abs(Number(b.impacto_rs ?? 0)) - Math.abs(Number(a.impacto_rs ?? 0));
    });

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

    // ==== Corpo do e-mail ====
    let corpo: string;
    if (itens.length === 0) {
      corpo = `<p style="font-size:13px;color:#374151">Nenhuma dispersão identificada em ${esc(dataAlvoFmt)}.</p>`;
    } else {
      const linhasHtml = itens.map((r: any) => {
        const impacto = Number(r.impacto_rs ?? 0);
        const cor = impacto < 0 ? "#059669" : "#111827";
        return `
      <tr>
        <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(r.numero_op)}</td>
        <td style="padding:6px 8px;font-size:12px">${esc(r.sku_produto_final)}${r.desc_prod ? " — " + esc(r.desc_prod) : ""}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(r.material)}${r.desc_material ? " — " + esc(r.desc_material) : ""}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right">${Number(r.qtd_consumo ?? 0).toLocaleString("pt-BR")} ${esc(r.um ?? "")}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right">${Number(r.qtd_previsto ?? 0).toLocaleString("pt-BR")}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right">${Number(r.qtd_dif ?? 0).toLocaleString("pt-BR")}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right;color:${cor};font-weight:600">R$ ${formatBRL(Math.abs(impacto))}</td>
        <td style="padding:6px 8px;font-size:12px">${esc(r.tipo_desvio ?? "—")}</td>
      </tr>`;
      }).join("");

      const totalGeral = itens.reduce((s: number, r: any) => s + Math.abs(Number(r.impacto_rs ?? 0)), 0);
      const qtdOps = totalPorOp.size;

      corpo = `
    <p style="font-size:13px;color:#374151;margin:0 0 12px">
      ${itens.length} desvio(s) identificado(s) em ${qtdOps} ordem(ns) de produção, no dia ${esc(dataAlvoFmt)}.
    </p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#111827;color:#fff">
          <th style="padding:8px;font-size:12px;text-align:left">OP</th>
          <th style="padding:8px;font-size:12px;text-align:left">Produto</th>
          <th style="padding:8px;font-size:12px;text-align:left">Material</th>
          <th style="padding:8px;font-size:12px;text-align:right">Consumo</th>
          <th style="padding:8px;font-size:12px;text-align:right">Previsto</th>
          <th style="padding:8px;font-size:12px;text-align:right">Dif</th>
          <th style="padding:8px;font-size:12px;text-align:right">Custo Desvio</th>
          <th style="padding:8px;font-size:12px;text-align:left">Tipo</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>
    <p style="margin-top:16px;font-size:14px;font-weight:700">Impacto Total do Dia: R$ ${formatBRL(totalGeral)}</p>`;
    }

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 8px">Farol de Dispersão de Lote — ${esc(dataAlvoFmt)}</h2>
${corpo}
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente todo dia útil pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol de Dispersão de Lote — ${dataAlvoFmt}${itens.length ? ` (${itens.length} desvio(s))` : ""}`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_DISPERSAO_ENVIADO" : "FAROL_DISPERSAO_FALHA",
      entidade: "v_impacto_consumo",
      payload: {
        data_alvo: dataAlvo,
        destinatarios: toList,
        qtd_itens: itens.length,
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

    return json({ ok: true, data_alvo: dataAlvo, qtd_itens: itens.length, destinatarios: toList, gmail_id: r.id ?? null });
  } catch (err: any) {
    console.error("farol-dispersao-diario", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
