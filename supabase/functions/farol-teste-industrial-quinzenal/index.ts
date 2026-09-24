// Edge Function: Farol Quinzenal de Testes Industriais — Custo de Inovação
// (envio a cada 15 dias, todo dia 1 e 16 do mês). Traz o gasto com testes
// industriais (SKU/produtos genéricos sem Ficha Técnica estável, por isso
// sem métrica de furo/desvio — só custo) na última quinzena, além do
// acumulado do mês corrente.
//
// Fonte de dados: view `v_teste_industrial_consumo` (dedicada — não usa
// v_impacto_consumo, que exclui estes produtos da análise de Dispersão).
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
const FINALIDADE = "Farol de Testes Industriais";
const APP_URL = "https://stockswift-sync-75.lovable.app/producao/testes-industriais";

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

function kpiHtml(titulo: string, valor: string, sub?: string): string {
  return `<div style="display:inline-block;width:22%;min-width:150px;margin:0 1% 10px 0;vertical-align:top;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#F9FAFB">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280">${esc(titulo)}</div>
    <div style="font-size:18px;font-weight:700;color:#111827">${esc(valor)}</div>
    ${sub ? `<div style="font-size:10.5px;color:#6b7280;margin-top:2px">${esc(sub)}</div>` : ""}
  </div>`;
}

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_teste_industrial_cron_secret");
    const cronSecretRecebido = req.headers.get("x-cron-secret");
    if (!cronSecretEsperado || cronSecretRecebido !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const agoraFmt = sp.toLocaleString("pt-BR");
    const fmtISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Quinzena: últimos 15 dias corridos até hoje.
    const inicioQuinzena = new Date(sp);
    inicioQuinzena.setDate(sp.getDate() - 14);
    const inicioQuinzenaISO = fmtISO(inicioQuinzena);
    const hojeISO = fmtISO(sp);

    // Mês corrente: dia 1 até hoje (acumulado do mês).
    const inicioMes = new Date(sp.getFullYear(), sp.getMonth(), 1);
    const inicioMesISO = fmtISO(inicioMes);

    const cfgFrom = await getCfg(admin, "resend_from");
    const cfgReply = await getCfg(admin, "resend_reply_to");
    const FROM_HEADER = cfgFrom || null;
    const REPLY_TO = cfgReply || null;

    // ==== Linhas da quinzena e do mês corrente (um único fetch, cobre os dois) ====
    const pageSize = 1000;
    let linhasMes: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from("v_teste_industrial_consumo")
        .select("id, numero_op, sku_produto_final, desc_prod, material, desc_material, um, dt_producao, qtd_consumo, custo_unit_medio, empresa")
        .gte("dt_producao", inicioMesISO)
        .lte("dt_producao", hojeISO + "T23:59:59")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      linhasMes.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    const linhasQuinzena = linhasMes.filter((r) => String(r.dt_producao).slice(0, 10) >= inicioQuinzenaISO);
    const gastoLinha = (r: any) => (Number(r.qtd_consumo) || 0) * (Number(r.custo_unit_medio) || 0);

    const gastoQuinzena = linhasQuinzena.reduce((s, r) => s + gastoLinha(r), 0);
    const gastoMes = linhasMes.reduce((s, r) => s + gastoLinha(r), 0);
    const opsTestadas = new Set(linhasQuinzena.map((r) => r.numero_op)).size;
    const itensSemCusto = new Set(
      linhasQuinzena.filter((r) => !(Number(r.custo_unit_medio) > 0)).map((r) => r.material),
    ).size;

    // Ranking por matéria-prima na quinzena
    const porMaterial = new Map<string, { desc: string; gasto: number }>();
    linhasQuinzena.forEach((r) => {
      const chave = r.material || "—";
      const cur = porMaterial.get(chave) ?? { desc: r.desc_material || chave, gasto: 0 };
      cur.gasto += gastoLinha(r);
      porMaterial.set(chave, cur);
    });
    const rankingMaterial = [...porMaterial.entries()]
      .map(([material, v]) => ({ material, ...v }))
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 8);

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

    const kpisHtml = [
      kpiHtml("Gasto na quinzena", `R$ ${formatBRL(gastoQuinzena)}`, `${linhasQuinzena.length} linha(s)`),
      kpiHtml("Acumulado no mês", `R$ ${formatBRL(gastoMes)}`, `desde ${fmtDataBR(inicioMesISO)}`),
      kpiHtml("OPs testadas", String(opsTestadas), "na quinzena"),
      kpiHtml("Itens sem custo cadastrado", String(itensSemCusto), "afeta a precisão do gasto"),
    ].join("");

    const rankingRows = rankingMaterial.length
      ? rankingMaterial.map((r) =>
          `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(r.material)} — ${esc(r.desc)}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">R$ ${esc(formatBRL(r.gasto))}</td></tr>`,
        ).join("")
      : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#6b7280;font-size:12px">Nenhum lançamento na quinzena.</td></tr>`;

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol Quinzenal de Testes Industriais — ${esc(agoraFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Custo de inovação (SKUs genéricos sem Ficha Técnica estável — sem métrica de furo/desvio, só gasto). Quinzena de ${esc(fmtDataBR(inicioQuinzenaISO))} a ${esc(fmtDataBR(hojeISO))}.</p>

${kpisHtml}

<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Matérias-primas com maior gasto na quinzena</h3>
<table style="width:100%;border-collapse:collapse">${rankingRows}</table>

<p style="margin:20px 0">
  <a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Testes Industriais na plataforma →</a>
</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">Enviado automaticamente todo dia 1 e 16 pelo Controle Operacional.</p>
</body></html>`;

    const raw = buildRawEmail({
      from: FROM_HEADER,
      to: toList,
      replyTo: REPLY_TO,
      subject: `Farol Quinzenal de Testes Industriais — ${fmtDataBR(inicioQuinzenaISO)} a ${fmtDataBR(hojeISO)} (R$ ${formatBRL(gastoQuinzena)})`,
      html,
    });

    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_TESTE_INDUSTRIAL_ENVIADO" : "FAROL_TESTE_INDUSTRIAL_FALHA",
      entidade: "producao_consumo",
      payload: {
        gerado_em: agoraFmt,
        destinatarios: toList,
        quinzena: { inicio: inicioQuinzenaISO, fim: hojeISO },
        gasto_quinzena: gastoQuinzena,
        gasto_mes: gastoMes,
        ops_testadas: opsTestadas,
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
      quinzena: { inicio: inicioQuinzenaISO, fim: hojeISO },
      gasto_quinzena: gastoQuinzena,
      gasto_mes: gastoMes,
      ops_testadas: opsTestadas,
      destinatarios: toList,
      gmail_id: r.id ?? null,
    });
  } catch (err: any) {
    console.error("farol-teste-industrial-quinzenal", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
