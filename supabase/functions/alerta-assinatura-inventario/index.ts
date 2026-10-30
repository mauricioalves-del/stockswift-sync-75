// Edge Function: Alerta diário de assinatura do fechamento de inventário.
// Disparada por pg_cron todos os dias às 12h de Brasília (15h UTC). Para cada fechamento em aberto (sem aprovação
// manual e sem as três ciências), descobre quem deve assinar cada papel pendente — cadastro de responsáveis por
// almoxarifado, depois "todos os almoxarifados", depois o perfil do usuário — e envia um e-mail por responsável
// (Gmail via Lovable Connector Gateway, como os farois). Pendências sem responsável vão aos administradores.
// Também mantém as tarefas no sino ("Minhas Tarefas"). Repete todo dia até a assinatura ser registrada.
//
// Protegida por segredo compartilhado (header x-cron-secret = app_config.alerta_assinatura_cron_secret).
// Corpo opcional: { "dry_run": true } monta os envios sem enviar; { "force": true } reenvia mesmo se já enviado hoje.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { assunto, html, montarEnvios, type Pendencia } from "./logica.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";
const APP_URL = "https://stockswift-sync-75.lovable.app";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function getCfg(admin: any, chave: string): Promise<string | null> {
  const { data } = await admin.from("app_config").select("valor").eq("chave", chave).maybeSingle();
  const v = data?.valor;
  if (v == null || v === "") return null;
  return typeof v === "string" ? v : String(v);
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function rawEmail(o: { from: string | null; to: string; subject: string; html: string; replyTo: string | null }): string {
  const h: string[] = [];
  if (o.from) h.push(`From: ${o.from}`);
  h.push(`To: ${o.to}`);
  if (o.replyTo) h.push(`Reply-To: ${o.replyTo}`);
  h.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(o.subject)))}?=`);
  h.push("MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"');
  return b64url(h.join("\r\n") + "\r\n\r\n" + o.html);
}

async function enviarGmail(raw: string): Promise<{ ok: boolean; erro?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY"), GMAIL_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GMAIL_KEY) return { ok: false, erro: "Credenciais do Gmail (connector) ausentes no ambiente" };
  const r = await fetch(GMAIL_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GMAIL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  return r.ok ? { ok: true } : { ok: false, erro: `${r.status}: ${(await r.text()).slice(0, 500)}` };
}

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const esperado = await getCfg(admin, "alerta_assinatura_cron_secret");
    if (!esperado || req.headers.get("x-cron-secret") !== esperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }
    let corpo: { dry_run?: boolean; force?: boolean } = {};
    try { corpo = await req.json(); } catch { /* sem corpo */ }

    // Tarefas no sino (abre as que faltam, conclui as já assinadas).
    const tarefas = await admin.rpc("sincronizar_tarefas_assinatura");

    const { data: pend, error } = await admin.rpc("pendencias_assinatura_inventario");
    if (error) throw error;
    const pendencias = (pend ?? []) as Pendencia[];
    if (!pendencias.length) return json({ ok: true, enviados: 0, mensagem: "Nenhuma assinatura pendente.", tarefas_novas: tarefas.data ?? null });

    const { data: adms, error: e2 } = await admin.from("user_roles").select("user_id").eq("role", "ADMINISTRADOR");
    if (e2) throw e2;
    const ids = [...new Set((adms ?? []).map((a: any) => a.user_id))];
    const { data: perfis, error: e3 } = ids.length
      ? await admin.from("profiles").select("id, email, nome").in("id", ids).eq("aprovado", true)
      : { data: [], error: null };
    if (e3) throw e3;
    const admins = (perfis ?? []).filter((p: any) => p.email).map((p: any) => ({ user_id: p.id, email: p.email, nome: p.nome }));

    const envios = montarEnvios(pendencias, admins);
    const hoje = hojeSP();
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    if (corpo.dry_run) {
      return json({ ok: true, dry_run: true, envios: envios.map((e) => ({ tipo: e.tipo, email: e.email, fechamentos: [...new Set(e.itens.map((i) => i.fechamento_id))], assunto: assunto(e) })) });
    }

    const { data: jaEnviados } = await admin.from("alertas_assinatura_envios").select("email").eq("data_ref", hoje).eq("ok", true);
    const ja = new Set((jaEnviados ?? []).map((r: any) => String(r.email).toLowerCase()));
    const from = await getCfg(admin, "resend_from"), replyTo = await getCfg(admin, "resend_reply_to");

    const resultado: { email: string; ok: boolean; erro?: string; pulado?: boolean }[] = [];
    for (const e of envios) {
      if (!corpo.force && ja.has(e.email.toLowerCase())) { resultado.push({ email: e.email, ok: true, pulado: true }); continue; }
      const r = await enviarGmail(rawEmail({ from, to: e.email, subject: assunto(e), html: html(e, APP_URL, quando), replyTo }));
      await admin.from("alertas_assinatura_envios").insert({
        data_ref: hoje, user_id: e.user_id, email: e.email, tipo: e.tipo,
        fechamentos: [...new Set(e.itens.map((i) => i.fechamento_id))], ok: r.ok, erro: r.erro ?? null,
      });
      resultado.push({ email: e.email, ok: r.ok, erro: r.erro });
    }
    return json({ ok: resultado.every((r) => r.ok), enviados: resultado.filter((r) => r.ok && !r.pulado).length, resultado, tarefas_novas: tarefas.data ?? null });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
