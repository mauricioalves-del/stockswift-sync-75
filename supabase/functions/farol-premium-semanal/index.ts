// Edge Function: Farol Premium (semanal).
// Disparada por pg_cron toda segunda-feira às 9h de Brasília. Controle apurado dos
// SKUs top de linha (premium) listados em `premium_prioridades`: estoque por
// almoxarifado e lote, validade, dias para vencer e Shelf (% da vida útil já
// consumida = 1 − dias/DOI), com semáforo por lote.
//
// Protegida por segredo compartilhado (header x-cron-secret). Aceita {"dry_run": true}
// no corpo para devolver o HTML sem enviar e-mail (usado para conferência).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";
const FINALIDADE = "Farol Premium";
// Limites padrão do semáforo (fração da vida útil consumida). Podem ser trocados sem
// reimplantar, em app_config: farol_premium_limite_amarelo / farol_premium_limite_vermelho (em %).
const LIMITE_AMARELO_PADRAO = 50;
const LIMITE_VERMELHO_PADRAO = 75;

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


// ======================= Cálculo e HTML (função pura) =======================

type Sem = "verde" | "amarelo" | "vermelho";
const COR: Record<Sem, string> = { verde: "#16A34A", amarelo: "#D97706", vermelho: "#DC2626" };
const BOLA: Record<Sem, string> = { verde: "🟢", amarelo: "🟡", vermelho: "🔴" };

type Prioridade = { id_produto: string; descricao: string | null; faixa: string; doi_dias: number };
type LinhaEstoque = {
  id_produto: string; descricao: string | null; origem: string | null; lote: string | null;
  quantidade: number | string | null; custo_unitario: number | string | null; data_validade: string | null;
};
type Limites = { amarelo: number; vermelho: number };

function diasAte(validadeISO: string, hojeISO: string): number {
  const u = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((u(validadeISO) - u(hojeISO)) / 86400000);
}

function classificar(dias: number, doi: number, lim: Limites): { sem: Sem; shelf: number } {
  const shelf = 1 - dias / doi;
  if (dias < 0 || shelf > lim.vermelho) return { sem: "vermelho", shelf };
  if (shelf >= lim.amarelo) return { sem: "amarelo", shelf };
  return { sem: "verde", shelf };
}

function pctTxt(shelf: number): string {
  const p = Math.round(shelf * 100);
  return p > 100 ? ">100%" : `${Math.max(p, 0)}%`;
}

function montarRelatorio(prios: Prioridade[], estoque: LinhaEstoque[], hoje: string, lim: Limites, agoraFmt: string) {
  const ordemFaixa = (f: string) => (f === "Atenção" ? 0 : 1);
  const skus = [...prios]
    .sort((a, b) => ordemFaixa(a.faixa) - ordemFaixa(b.faixa) || a.id_produto.localeCompare(b.id_produto))
    .map((p) => {
      const lotes = estoque
        .filter((e) => e.id_produto === p.id_produto && Number(e.quantidade) > 0 && e.data_validade)
        .map((e) => {
          const qtd = Number(e.quantidade) || 0;
          const custoUnit = Number(e.custo_unitario) || 0;
          const dias = diasAte(String(e.data_validade).slice(0, 10), hoje);
          const c = classificar(dias, p.doi_dias, lim);
          return { origem: e.origem ?? "—", lote: e.lote ?? "", validade: String(e.data_validade).slice(0, 10), qtd, custoUnit, custo: qtd * custoUnit, dias, shelf: c.shelf, sem: c.sem };
        })
        .sort((a, b) => a.validade.localeCompare(b.validade) || a.origem.localeCompare(b.origem));
      const qtd = lotes.reduce((s, l) => s + l.qtd, 0);
      const custo = lotes.reduce((s, l) => s + l.custo, 0);
      return { p, lotes, qtd, custo };
    });

  const todosLotes = skus.flatMap((s) => s.lotes);
  const totalCusto = skus.reduce((s, x) => s + x.custo, 0);
  const nVerm = todosLotes.filter((l) => l.sem === "vermelho").length;
  const nAmar = todosLotes.filter((l) => l.sem === "amarelo").length;
  const semEstoque = skus.filter((s) => s.lotes.length === 0);

  const th = (t: string, right = false) =>
    `<th style="padding:4px 8px;text-align:${right ? "right" : "left"};font-size:10.5px;color:#6b7280;text-transform:uppercase">${esc(t)}</th>`;
  const td = (t: string, extra = "") =>
    `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;${extra}">${t}</td>`;

  const corAlerta: Sem = nVerm > 0 ? "vermelho" : nAmar > 0 ? "amarelo" : "verde";
  const kpis = [
    kpiHtml("Estoque premium (R$)", formatBRL(totalCusto)),
    kpiHtml("Lotes em estoque", String(todosLotes.length)),
    kpiHtml("SKUs sem estoque", `${semEstoque.length} de ${skus.length}`, semEstoque.length > 0 ? COR.amarelo : COR.verde),
    kpiHtml("Lotes em alerta", `${nVerm} 🔴 · ${nAmar} 🟡`, COR[corAlerta]),
  ].join("");

  const maxCusto = Math.max(1, ...skus.map((s) => s.custo));
  const linhasCusto = [...skus].sort((a, b) => b.custo - a.custo).map((s) =>
    `<tr>${td(esc(s.p.descricao ?? s.p.id_produto))}${td(esc(s.p.faixa))}${td(esc(formatNum(s.qtd)), "text-align:right")}${td(esc(formatBRL(s.custo)), "text-align:right;font-weight:600")}` +
    `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;width:30%"><div style="background:#111827;height:10px;border-radius:3px;width:${Math.round((s.custo / maxCusto) * 100)}%"></div></td></tr>`).join("");

  let secoes = "";
  for (const faixa of ["Atenção", "Follow-up"]) {
    const grupo = skus.filter((s) => s.p.faixa === faixa);
    if (grupo.length === 0) continue;
    secoes += `<h3 style="margin:24px 0 6px;font-size:14px;color:#111827;border-bottom:2px solid #111827;padding-bottom:4px">${esc(faixa)}</h3>`;
    for (const s of grupo) {
      const cab = `<div style="margin:14px 0 4px"><strong style="font-size:13px">${esc(s.p.descricao ?? s.p.id_produto)}</strong> <span style="font-size:11px;color:#6b7280">${esc(s.p.id_produto)} · DOI ${s.p.doi_dias} dias · ${esc(formatNum(s.qtd))} un · ${esc(formatBRL(s.custo))}</span></div>`;
      if (s.lotes.length === 0) {
        secoes += cab + `<p style="margin:2px 0 0;font-size:12px;color:${COR.amarelo}">⚠️ Sem estoque em nenhum almoxarifado.</p>`;
        continue;
      }
      const linhas = s.lotes.map((l) =>
        `<tr>${td(esc(l.origem))}${td(`<span style="font-family:monospace;font-size:11px">${esc(l.lote)}</span>`)}${td(esc(fmtDataBR(l.validade)))}` +
        `${td(esc(formatNum(l.qtd)), "text-align:right")}${td(l.dias < 0 ? "vencido" : String(l.dias), `text-align:right;color:${COR[l.sem]};font-weight:700`)}` +
        `${td(pctTxt(l.shelf), `text-align:right;color:${COR[l.sem]};font-weight:700`)}${td(esc(formatBRL(l.custo)), "text-align:right")}${td(BOLA[l.sem], "text-align:center")}</tr>`).join("");
      secoes += cab + `<table style="width:100%;border-collapse:collapse"><thead><tr>${th("Almoxarifado")}${th("Lote")}${th("Validade")}${th("Qtd", true)}${th("Dias p/ vencer", true)}${th("Shelf", true)}${th("Custo", true)}${th("")}</tr></thead><tbody>${linhas}</tbody></table>`;
    }
  }

  const semEstoqueTxt = semEstoque.length
    ? `<p style="font-size:12px;color:${COR.amarelo};margin:12px 0 0">⚠️ Sem estoque: ${semEstoque.map((s) => esc(s.p.descricao ?? s.p.id_produto)).join("; ")}.</p>` : "";

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
<h2 style="margin:0 0 4px">Farol Premium — ${esc(agoraFmt)}</h2>
<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Controle semanal dos SKUs top de linha: estoque por almoxarifado e lote, validade e Shelf (parte da vida útil já consumida).</p>
${kpis}
${semEstoqueTxt}
<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Custo por produto</h3>
<table style="width:100%;border-collapse:collapse"><thead><tr>${th("Produto")}${th("Faixa")}${th("Qtd", true)}${th("Custo", true)}${th("")}</tr></thead><tbody>${linhasCusto}</tbody></table>
${secoes}
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">🟢 Shelf consumido abaixo de ${Math.round(lim.amarelo * 100)}% · 🟡 de ${Math.round(lim.amarelo * 100)}% a ${Math.round(lim.vermelho * 100)}% · 🔴 acima de ${Math.round(lim.vermelho * 100)}% ou vencido. Shelf = 1 − dias para vencer ÷ DOI (validade total do SKU). Custo = quantidade × custo unitário do sistema.</p>
<p style="font-size:11px;color:#6b7280">Enviado automaticamente toda segunda-feira, às 9h, pelo Controle Operacional.</p>
</body></html>`;

  return {
    html,
    resumo: {
      custo_total: totalCusto, lotes: todosLotes.length, lotes_vermelho: nVerm, lotes_amarelo: nAmar,
      skus_sem_estoque: semEstoque.map((s) => s.p.id_produto), skus: skus.length,
    },
  };
}

function lerLimite(v: string | null, padrao: number): number {
  const n = v == null ? NaN : Number(String(v).replace(",", "."));
  return (Number.isFinite(n) && n > 0 && n <= 200 ? n : padrao) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const cronSecretEsperado = await getCfg(admin, "farol_premium_cron_secret");
    if (!cronSecretEsperado || req.headers.get("x-cron-secret") !== cronSecretEsperado) {
      return json({ ok: false, code: "FORBIDDEN", error: "Segredo de agendamento inválido ou ausente" }, 403);
    }

    let dryRun = false;
    try { const b = await req.json(); dryRun = b?.dry_run === true; } catch { /* corpo vazio */ }

    const hoje = dataHojeSaoPaulo();
    const agoraFmt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const lim: Limites = {
      amarelo: lerLimite(await getCfg(admin, "farol_premium_limite_amarelo"), LIMITE_AMARELO_PADRAO),
      vermelho: lerLimite(await getCfg(admin, "farol_premium_limite_vermelho"), LIMITE_VERMELHO_PADRAO),
    };

    const { data: prios, error: perr } = await admin
      .from("premium_prioridades").select("id_produto, descricao, faixa, doi_dias").eq("ativo", true);
    if (perr) throw perr;
    if (!prios || prios.length === 0) {
      return json({ ok: false, code: "NO_PRIORITIES", error: "Nenhum SKU ativo em premium_prioridades." });
    }

    const { data: estoque, error: eerr } = await admin
      .from("estoque_sistemico")
      .select("id_produto, descricao, origem, lote, quantidade, custo_unitario, data_validade")
      .in("id_produto", prios.map((p: any) => p.id_produto))
      .gt("quantidade", 0)
      .limit(5000);
    if (eerr) throw eerr;

    const { html, resumo } = montarRelatorio(prios as Prioridade[], (estoque ?? []) as LinhaEstoque[], hoje, lim, agoraFmt);

    if (dryRun) return json({ ok: true, dry_run: true, data: hoje, resumo, html });

    const { data: dests, error: derr } = await admin
      .from("cadastro_emails").select("email").eq("finalidade", FINALIDADE).eq("ativo", true);
    if (derr) throw derr;
    if (!dests || dests.length === 0) {
      return json({
        ok: false, code: "MISSING_RECIPIENTS",
        error: `Nenhum destinatário ativo cadastrado para '${FINALIDADE}'. Cadastre ao menos um e-mail em Cadastro de E-mails.`,
      });
    }
    const toList = dests.map((d: any) => d.email);

    const raw = buildRawEmail({
      from: (await getCfg(admin, "resend_from")) || null,
      to: toList,
      replyTo: (await getCfg(admin, "resend_reply_to")) || null,
      subject: `Farol Premium — ${fmtDataBR(hoje)} (${formatBRL(resumo.custo_total)} em estoque${resumo.lotes_vermelho > 0 ? `, ${resumo.lotes_vermelho} lote(s) crítico(s)` : ""})`,
      html,
    });
    const r = await sendViaGmail(raw);

    await admin.from("audit_logs").insert({
      usuario: null,
      acao: r.ok ? "FAROL_PREMIUM_ENVIADO" : "FAROL_PREMIUM_FALHA",
      entidade: "premium_prioridades",
      payload: { data: hoje, destinatarios: toList, ...resumo, erro: r.ok ? null : `${r.status}: ${r.body.slice(0, 400)}` },
    });

    if (!r.ok) {
      return json({ ok: false, code: r.status === 401 || r.status === 403 ? "GMAIL_AUTH_ERROR" : "GMAIL_ERROR", error: `Gmail HTTP ${r.status}: ${r.body.slice(0, 500)}` });
    }
    return json({ ok: true, data: hoje, ...resumo, destinatarios: toList, gmail_id: r.id ?? null });
  } catch (err: any) {
    console.error("farol-premium-semanal", err);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: err.message ?? String(err) }, 500);
  }
});
