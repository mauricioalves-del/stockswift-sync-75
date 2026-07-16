// Edge Function: monta e envia por e-mail (Gmail via Lovable Connector Gateway)
// a solicitação de Baixa Fiscal com todos os itens pendentes na fila de
// aprovação, agrupados por Almoxarifado e por Motivo. Restrito a Administrador.
// Registra em audit_logs.
//
// Também suporta modo de teste: { test: true, test_to?: string } — envia um
// e-mail simples para validar a conexão com o Gmail.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";
const STATUS_FILA = ["PENDENTE", "ANALISE", "AJUSTE_SOLICITADO"];

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
  from?: string | null;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string | null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new Error("Não autenticado");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userRes.user) throw new Error("Não autenticado");
    const userId = userRes.user.id;

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "ADMINISTRADOR" });
    if (!isAdmin) {
      return json({ ok: false, code: "FORBIDDEN", error: "Apenas Administrador pode disparar esta ação" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const isTest: boolean = body?.test === true;

    // Parâmetros opcionais em app_config (chaves antigas continuam válidas)
    const cfgFrom = await getCfg(admin, "resend_from"); // ex.: "Baixas <fiscal@empresa.com>"
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const cfgPrefix = await getCfg(admin, "resend_subject_prefix");
    const FROM_HEADER = cfgFrom || Deno.env.get("BAIXA_FISCAL_FROM") || null;
    const REPLY_TO = cfgReply || Deno.env.get("BAIXA_FISCAL_REPLY_TO") || null;
    const SUBJECT_PREFIX = cfgPrefix || "";

    const dataHoje = new Date().toLocaleDateString("pt-BR");

    // ==== MODO TESTE ====
    if (isTest) {
      const testTo = (body?.test_to as string | undefined)?.trim() || userRes.user.email;
      if (!testTo) throw new Error("Informe um destinatário de teste (test_to)");

      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:16px">
        <h2>Teste de envio — Baixa Fiscal (Gmail)</h2>
        <p>E-mail de teste enviado pela conta Gmail conectada ao projeto.</p>
        <ul style="font-size:12px;color:#374151">
          <li><b>From (cabeçalho):</b> ${esc(FROM_HEADER ?? "(conta Gmail conectada)")}</li>
          <li><b>Reply-To:</b> ${esc(REPLY_TO ?? "(nenhum)")}</li>
          <li><b>Prefixo de assunto:</b> ${esc(SUBJECT_PREFIX || "(nenhum)")}</li>
          <li><b>Data:</b> ${esc(dataHoje)}</li>
        </ul>
        <p style="font-size:11px;color:#6b7280">Observação: o Gmail sempre envia a partir do endereço da conta autenticada, ignorando o cabeçalho From quando este não corresponde a um alias verificado.</p>
      </body></html>`;

      const raw = buildRawEmail({
        from: FROM_HEADER,
        to: [testTo],
        replyTo: REPLY_TO,
        subject: `${SUBJECT_PREFIX}[TESTE] Baixa Fiscal — ${dataHoje}`,
        html,
      });

      const r = await sendViaGmail(raw);
      if (!r.ok) {
        return json({
          ok: false,
          code: r.status === 401 || r.status === 403 ? "GMAIL_AUTH_ERROR" : "GMAIL_ERROR",
          error: `Gmail HTTP ${r.status}: ${r.body.slice(0, 500)}`,
        });
      }
      await admin.from("audit_logs").insert({
        usuario: userId, acao: "BAIXA_FISCAL_TESTE", entidade: "gmail",
        payload: { destinatario: testTo, from: FROM_HEADER, gmail_id: r.id ?? null },
      });
      return json({ ok: true, test: true, destinatario: testTo, from: FROM_HEADER, gmail_id: r.id ?? null });
    }

    // ==== ENVIO REAL ====
    const { data: dests, error: derr } = await admin
      .from("cadastro_emails")
      .select("email, nome_contato")
      .eq("finalidade", "Baixa Fiscal")
      .eq("ativo", true);
    if (derr) throw derr;
    if (!dests || dests.length === 0) {
      return json({
        ok: false,
        code: "MISSING_BAIXA_FISCAL_RECIPIENTS",
        error: "Nenhum destinatário ativo cadastrado para 'Baixa Fiscal'. Cadastre ao menos um e-mail em Cadastros → E-mails.",
      });
    }

    const { data: itens, error: ierr } = await admin
      .from("baixa_operacional")
      .select("id, codigo_produto, descricao, unidade, lote, quantidade, custo_unitario, valor_total, id_local, motivo:motivo_baixa(descricao)")
      .in("status_fluxo", STATUS_FILA)
      .order("id_local", { ascending: true })
      .order("created_at", { ascending: true });
    if (ierr) throw ierr;
    if (!itens || itens.length === 0) {
      return json({ ok: false, code: "NO_PENDING_ITEMS", error: "Não há itens pendentes na fila de aprovação" });
    }

    const porAlmox = new Map<string, any[]>();
    for (const it of itens) {
      const k = it.id_local ?? "—";
      if (!porAlmox.has(k)) porAlmox.set(k, []);
      porAlmox.get(k)!.push(it);
    }

    let totalGeral = 0;
    let semCustoGeral = 0;

    const seccoes: string[] = [];
    for (const [almox, lista] of porAlmox) {
      const porMotivo = new Map<string, any[]>();
      for (const it of lista) {
        const m = it.motivo?.descricao ?? "—";
        if (!porMotivo.has(m)) porMotivo.set(m, []);
        porMotivo.get(m)!.push(it);
      }

      let subtotal = 0;
      const linhas: string[] = [];
      for (const [motivo, its] of porMotivo) {
        linhas.push(
          `<tr style="background:#f3f4f6"><td colspan="7" style="padding:6px 8px;font-weight:600;font-size:12px;color:#374151">Motivo: ${esc(motivo)}</td></tr>`,
        );
        for (const it of its) {
          const qtd = Number(it.quantidade ?? 0);
          const cu = Number(it.custo_unitario ?? 0);
          const semCusto = cu <= 0;
          const custoLinha = semCusto ? 0 : (Number(it.valor_total ?? 0) || qtd * cu);
          if (semCusto) semCustoGeral++;
          else subtotal += custoLinha;

          linhas.push(`
            <tr>
              <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(it.codigo_produto)}</td>
              <td style="padding:6px 8px;font-size:12px">${esc(it.descricao)}</td>
              <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(it.lote || "—")}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${qtd.toLocaleString("pt-BR")}${it.unidade ? " " + esc(it.unidade) : ""}</td>
              <td style="padding:6px 8px;font-size:12px">${esc(motivo)}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${semCusto ? "N/D" : "R$ " + formatBRL(cu)}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${semCusto ? "N/D" : "R$ " + formatBRL(custoLinha)}</td>
            </tr>`);
        }
      }
      totalGeral += subtotal;

      seccoes.push(`
        <h3 style="margin:20px 0 6px;font-size:14px;color:#111827">Almoxarifado: ${esc(almox)}</h3>
        <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#111827;color:#fff">
              <th style="padding:8px;font-size:12px;text-align:left">Código</th>
              <th style="padding:8px;font-size:12px;text-align:left">Descrição</th>
              <th style="padding:8px;font-size:12px;text-align:left">Lote</th>
              <th style="padding:8px;font-size:12px;text-align:right">Quantidade</th>
              <th style="padding:8px;font-size:12px;text-align:left">Motivo</th>
              <th style="padding:8px;font-size:12px;text-align:right">Custo Unit.</th>
              <th style="padding:8px;font-size:12px;text-align:right">Custo Total</th>
            </tr>
          </thead>
          <tbody>${linhas.join("")}</tbody>
          <tfoot>
            <tr style="background:#f9fafb">
              <td colspan="6" style="padding:8px;font-size:12px;font-weight:600;text-align:right">Subtotal ${esc(almox)}:</td>
              <td style="padding:8px;font-size:12px;font-weight:600;text-align:right">R$ ${formatBRL(subtotal)}</td>
            </tr>
          </tfoot>
        </table>`);
    }

    const rodapeSemCusto = semCustoGeral > 0
      ? `<p style="font-size:11px;color:#b45309;margin-top:8px"><em>* ${semCustoGeral} item(ns) sem custo apurado — exibidos como "N/D" e não somados ao total.</em></p>`
      : "";

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
      <h2 style="margin:0 0 4px">Solicitação de Baixa Fiscal — ${esc(dataHoje)}</h2>
      <p style="font-size:13px;color:#374151;margin:0 0 12px">
        Segue relação de itens pendentes de baixa fiscal, organizados por almoxarifado e motivo.
        Total de ${itens.length} item(ns) na fila de aprovação.
      </p>
      ${seccoes.join("")}
      <p style="margin-top:20px;font-size:14px;font-weight:700;color:#111827">
        Custo Total Geral: R$ ${formatBRL(totalGeral)}
      </p>
      ${rodapeSemCusto}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:11px;color:#6b7280">Enviado automaticamente pelo Sistema de Baixas Operacionais.</p>
    </body></html>`;

    const toList = dests.map((d: any) => d.email);

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `${SUBJECT_PREFIX}Solicitação de Baixa Fiscal — ${dataHoje}`,
      html,
    });

    const r = await sendViaGmail(raw);
    if (!r.ok) {
      const errMsg = `Gmail HTTP ${r.status}: ${r.body.slice(0, 400)}`;
      await admin.from("audit_logs").insert({
        usuario: userId, acao: "BAIXA_FISCAL_FALHA", entidade: "baixa_operacional",
        payload: { erro: errMsg, destinatarios: toList, qtd_itens: itens.length },
      });
      return json({
        ok: false,
        code: r.status === 401 || r.status === 403 ? "GMAIL_AUTH_ERROR" : "GMAIL_ERROR",
        error: errMsg,
      });
    }

    await admin.from("audit_logs").insert({
      usuario: userId,
      acao: "BAIXA_FISCAL_ENVIADA",
      entidade: "baixa_operacional",
      payload: {
        destinatarios: toList,
        qtd_itens: itens.length,
        custo_total: totalGeral,
        itens_sem_custo: semCustoGeral,
        gmail_id: r.id ?? null,
      },
    });

    return json({
      ok: true, qtd_itens: itens.length, destinatarios: toList, custo_total: totalGeral, gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("solicitar-baixa-fiscal", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
