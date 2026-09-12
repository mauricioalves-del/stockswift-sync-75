// Edge Function: Farol Diário de Controle FEFO.
// Disparada por pg_cron (segunda a sexta) para montar e enviar por e-mail
// (Gmail via Lovable Connector Gateway) as quebras de FEFO identificadas no
// dia anterior (D-1) nas transferências entre almoxarifados.
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
const FINALIDADE = "Farol FEFO Diário";
const NAO_AUDITADO = "Destino (não auditado)";

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

// Base64 padrão (RFC 2045), quebrado em linhas de 76 colunas — para anexos.
function b64attach(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const flat = btoa(bin);
  const lines: string[] = [];
  for (let i = 0; i < flat.length; i += 76) lines.push(flat.slice(i, i + 76));
  return lines.join("\r\n");
}

function buildRawEmail(opts: {
    from?: string | null; to: string[]; subject: string; html: string; replyTo?: string | null;
    attachment?: { filename: string; content: string; mimeType: string };
}): string {
    const headers: string[] = [];
    if (opts.from) headers.push(`From: ${opts.from}`);
    headers.push(`To: ${opts.to.join(", ")}`);
    if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
    const subj = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
    headers.push(`Subject: ${subj}`);
    headers.push("MIME-Version: 1.0");

    if (!opts.attachment) {
      headers.push('Content-Type: text/html; charset="UTF-8"');
      const msg = headers.join("\r\n") + "\r\n\r\n" + opts.html;
      return b64url(msg);
    }

    const boundary = "----=_farol_fefo_" + crypto.randomUUID().replace(/-/g, "");
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const bodyPart = `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${opts.html}\r\n`;
    const attB64 = b64attach(opts.attachment.content);
    const attPart =
      `--${boundary}\r\n` +
      `Content-Type: ${opts.attachment.mimeType}; name="${opts.attachment.filename}"\r\n` +
      `Content-Disposition: attachment; filename="${opts.attachment.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n${attB64}\r\n`;
    const msg = headers.join("\r\n") + "\r\n\r\n" + bodyPart + attPart + `--${boundary}--`;
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

// Data de HOJE no fuso de São Paulo, no formato YYYY-MM-DD.
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

      // Autenticação: segredo compartilhado (chamado pelo pg_cron, sem sessão de usuário).
      const cronSecretEsperado = await getCfg(admin, "farol_fefo_cron_secret");
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

      // ==== Checagens do dia (D-1) ====
      const { data: linhas, error: lerr } = await admin
                     .from("checagens_fefo")
                     .select("id_produto, descricao, desc_movimento, desc_almox, destino, doc, lote_movimentado, qtd_movimentado, validade_movimentado, quebra, status, lote_mais_antigo, qtd_lote_mais_antigo, validade_mais_antiga")
                     .eq("data", dataAlvo);
                   if (lerr) throw lerr;

      const todas = linhas ?? [];
                   const auditadas = todas.filter((r: any) => (r.status ?? "") !== NAO_AUDITADO);
                   const quebras = auditadas.filter((r: any) => r.quebra === true)
                     .sort((a: any, b: any) => String(a.destino ?? "").localeCompare(String(b.destino ?? "")));

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

      const taxa = auditadas.length ? (quebras.length / auditadas.length) * 100 : 0;

      // ==== Corpo do e-mail ====
      let corpo: string;
                   if (auditadas.length === 0) {
                           corpo = `<p style="font-size:13px;color:#374151">Nenhuma transferência auditada em ${esc(dataAlvoFmt)}.</p>`;
                   } else if (quebras.length === 0) {
                           corpo = `<p style="font-size:13px;color:#374151">${auditadas.length} transferência(s) auditada(s) em ${esc(dataAlvoFmt)} — nenhuma quebra de FEFO identificada. 🎉</p>`;
                   } else {
                           const linhasHtml = quebras.map((r: any) => `
                                 <tr>
                                         <td style="padding:6px 8px;font-size:12px">${esc(r.id_produto)}${r.descricao ? " — " + esc(r.descricao) : ""}</td>
                                                 <td style="padding:6px 8px;font-size:12px">${esc(r.desc_movimento)}</td>
                                                         <td style="padding:6px 8px;font-size:12px">${esc(r.destino)}</td>
                                                                 <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(r.lote_movimentado)}</td>
                                                                         <td style="padding:6px 8px;font-size:12px;text-align:right">${Number(r.qtd_movimentado ?? 0).toLocaleString("pt-BR")}</td>
                                                                                 <td style="padding:6px 8px;font-size:12px">${r.lote_mais_antigo ? `${esc(r.lote_mais_antigo)} · ${Number(r.qtd_lote_mais_antigo ?? 0).toLocaleString("pt-BR")} em saldo · val. ${esc(r.validade_mais_antiga ?? "—")}` : "—"}</td>
                                                                                         <td style="padding:6px 8px;font-size:12px">${esc(r.status)}</td>
                                                                                               </tr>`).join("");

                     corpo = `
                         <p style="font-size:13px;color:#374151;margin:0 0 12px">
                               ${quebras.length} quebra(s) de FEFO em ${auditadas.length} transferência(s) auditada(s) — taxa de ${taxa.toFixed(1)}%, no dia ${esc(dataAlvoFmt)}.
                                   </p>
                                       <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
                                             <thead>
                                                     <tr style="background:#111827;color:#fff">
                                                               <th style="padding:8px;font-size:12px;text-align:left">Produto</th>
                                                                         <th style="padding:8px;font-size:12px;text-align:left">Movimento</th>
                                                                                   <th style="padding:8px;font-size:12px;text-align:left">Destino</th>
                                                                                             <th style="padding:8px;font-size:12px;text-align:left">Lote mov.</th>
                                                                                                       <th style="padding:8px;font-size:12px;text-align:right">Qtd</th>
                                                                                                                 <th style="padding:8px;font-size:12px;text-align:left">Lote mais antigo</th>
                                                                                                                           <th style="padding:8px;font-size:12px;text-align:left">Status</th>
                                                                                                                                   </tr>
                                                                                                                                         </thead>
                                                                                                                                               <tbody>${linhasHtml}</tbody>
                                                                                                                                                   </table>`;
                   }

      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
      <h2 style="margin:0 0 8px">Farol de Controle FEFO — ${esc(dataAlvoFmt)}</h2>
      ${corpo}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:11px;color:#6b7280">Enviado automaticamente todo dia útil pelo Controle Operacional.</p>
      </body></html>`;

      const raw = buildRawEmail({
              from: FROM_HEADER,
              to: toList,
              replyTo: REPLY_TO,
              subject: `Farol de Controle FEFO — ${dataAlvoFmt}${quebras.length ? ` (${quebras.length} quebra(s))` : ""}`,
              html,
      });

      const r = await sendViaGmail(raw);

      await admin.from("audit_logs").insert({
              usuario: null,
              acao: r.ok ? "FAROL_FEFO_ENVIADO" : "FAROL_FEFO_FALHA",
              entidade: "checagens_fefo",
              payload: {
                        data_alvo: dataAlvo,
                        destinatarios: toList,
                        qtd_auditadas: auditadas.length,
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

      return json({ ok: true, data_alvo: dataAlvo, qtd_auditadas: auditadas.length, qtd_quebras: quebras.length, destinatarios: toList, gmail_id: r.id ?? null });
             } catch (err: any) {
    console.error("farol-fefo-diario", err);
                   return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
             }
});
