// Edge Function: Farol de Investimento Operacional (envio semanal, toda
// sexta-feira). Traz a visão executiva da semana (segunda a hoje) das baixas
// por Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo — motivos que
// não representam perda, mas custo operacional enxergado como investimento —
// além do valor acumulado do indicador no mês corrente.
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
const FINALIDADE = "Farol de Investimento Operacional";
const APP_URL = "https://stockswift-sync-75.lovable.app/baixas/investimento-operacional";

const MOTIVOS_ALVO = ["Cortesia", "Degustação", "Sensorial/Inovações", "Uso e Consumo"];
const PALETTE: Record<string, string> = {
  "Cortesia": "#4FC3F7",
  "Degustação": "#81C784",
  "Sensorial/Inovações": "#BA68C8",
  "Uso e Consumo": "#FFB74D",
};

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

function kpiHtml(titulo: string, valor: string, cor?: string): string {
  return `<div style="display:inline-block;width:22%;min-width:150px;margin:0 1% 10px 0;vertical-align:top;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#F9FAFB;border-left:3px solid ${cor || "#111827"}">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280">${esc(titulo)}</div>
    <div style="font-size:18px;font-weight:700;color:#111827">${esc(valor)}</div>
  </div>`;
}

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function rankingHtml(titulo: string, itens: { chave: string; valor: number }[]): string {
  if (!itens.length) {
    return `<p style="font-size:12px;color:#6b7280;margin:4px 0 16px">${esc(titulo)}: nenhum lançamento na semana.</p>`;
  }
  const linhas = itens.slice(0, 5).map((it) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(it.chave)}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">R$ ${esc(formatBRL(it.valor))}</td></tr>`
  ).join("");
  return `<div style="margin:0 0 16px">
    <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:4px">${esc(titulo)}</div>
    <table style="width:100%;border-collapse:collapse">${linhas}</table>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_investimento_operacional_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const agoraFmt = sp.toLocaleString("pt-BR");
    const fmtISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Semana: segunda-feira desta semana até hoje (a função roda toda sexta).
    const diaSemana = sp.getDay(); // 0=domingo .. 5=sexta
    const inicioSemana = new Date(sp);
    inicioSemana.setDate(sp.getDate() - ((diaSemana + 6) % 7)); // volta até a segunda-feira
    const inicioSemanaISO = fmtISO(inicioSemana);
    const hojeISO = fmtISO(sp);

    // Mês corrente: dia 1 até hoje (valor acumulado do indicador).
    const inicioMes = new Date(sp.getFullYear(), sp.getMonth(), 1);
    const inicioMesISO = fmtISO(inicioMes);

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Motivos-alvo ====
    const { data: motivos, error: motErr } = await admin.from("motivo_baixa").select("id, descricao");
    if (motErr) throw motErr;
    const idsAlvo = (motivos ?? []).filter((m: any) => MOTIVOS_ALVO.includes(m.descricao)).map((m: any) => m.id);
    const motivoNome = new Map((motivos ?? []).map((m: any) => [m.id, m.descricao]));

    // ==== Baixas do mês corrente (cobre semana + acumulado num único fetch) ====
    let linhasRaw: any[] = [];
    if (idsAlvo.length) {
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin
          .from("baixa_operacional")
          .select("id, motivo_baixa_id, contexto_baixa, valor_total, data_solicitacao, status_fluxo")
          .in("motivo_baixa_id", idsAlvo)
          .neq("status_fluxo", "REPROVADA")
          .gte("data_solicitacao", inicioMesISO)
          .lte("data_solicitacao", hojeISO + "T23:59:59")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        linhasRaw.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
    }

    const linhasSemana = linhasRaw.filter((r) => String(r.data_solicitacao).slice(0, 10) >= inicioSemanaISO);
    const linhasMes = linhasRaw; // já filtradas por inicioMesISO na query

    const somaPorMotivo = (linhas: any[]) => {
      const m = new Map<string, number>();
      for (const nome of MOTIVOS_ALVO) m.set(nome, 0);
      linhas.forEach((r) => {
        const nome = motivoNome.get(r.motivo_baixa_id) ?? "—";
        m.set(nome, (m.get(nome) ?? 0) + (Number(r.valor_total) || 0));
      });
      return m;
    };
    const totalSemanaPorMotivo = somaPorMotivo(linhasSemana);
    const totalMesPorMotivo = somaPorMotivo(linhasMes);
    const totalSemana = [...totalSemanaPorMotivo.values()].reduce((s, v) => s + v, 0);
    const totalMes = [...totalMesPorMotivo.values()].reduce((s, v) => s + v, 0);

    const ranking = (linhas: any[], motivoAlvo: string) => {
      const m = new Map<string, number>();
      linhas.forEach((r) => {
        if (motivoNome.get(r.motivo_baixa_id) !== motivoAlvo) return;
        const chave = r.contexto_baixa || "Não informado";
        m.set(chave, (m.get(chave) ?? 0) + (Number(r.valor_total) || 0));
      });
      return [...m.entries()].map(([chave, valor]) => ({ chave, valor })).sort((a, b) => b.valor - a.valor);
    };
    const rankingAreaCortesia = ranking(linhasSemana, "Cortesia");
    const rankingOperacaoDegustacao = ranking(linhasSemana, "Degustação");

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

    const kpisSemana = MOTIVOS_ALVO.map((nome) => kpiHtml(nome, `R$ ${formatBRL(totalSemanaPorMotivo.get(nome) ?? 0)}`, PALETTE[nome])).join("");
    const kpisMes = MOTIVOS_ALVO.map((nome) => kpiHtml(nome, `R$ ${formatBRL(totalMesPorMotivo.get(nome) ?? 0)}`, PALETTE[nome])).join("");

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol de Investimento Operacional — ${esc(agoraFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo — tratados como investimento operacional, não perda. Semana de ${esc(fmtDataBR(inicioSemanaISO))} a ${esc(fmtDataBR(hojeISO))}.</p>

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Visão da semana — total R$ ${esc(formatBRL(totalSemana))}</h3>
${kpisSemana}

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Valor acumulado no mês (${esc(fmtDataBR(inicioMesISO))} a ${esc(fmtDataBR(hojeISO))}) — total R$ ${esc(formatBRL(totalMes))}</h3>
${kpisMes}

<div style="margin:20px 0">
  ${rankingHtml("Cortesia — Área que solicitou (semana)", rankingAreaCortesia)}
  ${rankingHtml("Degustação — Operação (semana)", rankingOperacaoDegustacao)}
</div>

<p style="margin:20px 0">
  <a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Investimento Operacional na plataforma →</a>
</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente toda sexta-feira pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol de Investimento Operacional — semana ${fmtDataBR(inicioSemanaISO)} a ${fmtDataBR(hojeISO)} (R$ ${formatBRL(totalSemana)})`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_INVESTIMENTO_OPERACIONAL_ENVIADO" : "FAROL_INVESTIMENTO_OPERACIONAL_FALHA",
      entidade: "baixa_operacional",
      payload: {
        gerado_em: agoraFmt,
        destinatarios: toList,
        semana: { inicio: inicioSemanaISO, fim: hojeISO },
        total_semana: totalSemana,
        total_mes: totalMes,
        por_motivo_semana: Object.fromEntries(totalSemanaPorMotivo),
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
      semana: { inicio: inicioSemanaISO, fim: hojeISO },
      total_semana: totalSemana,
      total_mes: totalMes,
      destinatarios: toList,
      gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("farol-investimento-operacional-semanal", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
