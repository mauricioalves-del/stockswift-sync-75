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
const APP_URL = "https://stockswift-sync-75.lovable.app/shelf-life/premium";
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

function quebrar76(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}
function utf8ParaBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildRawEmail(opts: { from?: string | null; to: string[]; subject: string; html: string; replyTo?: string | null; anexo?: { nome: string; conteudo: string; mime: string } }): string {
  const headers: string[] = [];
  if (opts.from) headers.push(`From: ${opts.from}`);
  headers.push(`To: ${opts.to.join(", ")}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  const subj = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  headers.push(`Subject: ${subj}`);
  headers.push("MIME-Version: 1.0");
  if (!opts.anexo) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    return b64url(headers.join("\r\n") + "\r\n\r\n" + opts.html);
  }
  // Com anexo: multipart/mixed (corpo HTML + arquivo anexado), ambos em base64.
  const limite = "farolpremium_" + crypto.randomUUID().replace(/-/g, "");
  headers.push(`Content-Type: multipart/mixed; boundary="${limite}"`);
  const nome = opts.anexo.nome.replace(/[^A-Za-z0-9._-]/g, "_");
  const corpo = [
    `--${limite}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    quebrar76(utf8ParaBase64(opts.html)),
    `--${limite}`,
    `Content-Type: ${opts.anexo.mime}; charset="UTF-8"; name="${nome}"`,
    `Content-Disposition: attachment; filename="${nome}"`,
    "Content-Transfer-Encoding: base64",
    "",
    quebrar76(utf8ParaBase64(opts.anexo.conteudo)),
    `--${limite}--`,
    "",
  ].join("\r\n");
  return b64url(headers.join("\r\n") + "\r\n\r\n" + corpo);
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
<p style="margin:6px 0 14px"><a href="${APP_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">Abrir Dashboard Premium na plataforma →</a></p>
${semEstoqueTxt}
<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#6b7280">Custo por produto</h3>
<table style="width:100%;border-collapse:collapse"><thead><tr>${th("Produto")}${th("Faixa")}${th("Qtd", true)}${th("Custo", true)}${th("")}</tr></thead><tbody>${linhasCusto}</tbody></table>
${secoes}
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
<p style="font-size:11px;color:#6b7280">🟢 Shelf consumido abaixo de ${Math.round(lim.amarelo * 100)}% · 🟡 de ${Math.round(lim.amarelo * 100)}% a ${Math.round(lim.vermelho * 100)}% · 🔴 acima de ${Math.round(lim.vermelho * 100)}% ou vencido. Shelf = 1 − dias para vencer ÷ DOI (validade total do SKU). Custo = quantidade × custo unitário do sistema.</p>
<p style="font-size:11px;color:#6b7280">📎 Anexo: <strong>Dashboard_Premium_${hoje}.html</strong> — versão interativa do painel (filtros por prioridade e produto). Baixe o arquivo e abra no navegador; os filtros não funcionam dentro do e-mail.</p>
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

// ===== HTML interativo do Dashboard Premium (bloco compartilhado: tela e e-mail) =====
type PrioHtml = { id_produto: string; descricao: string | null; faixa: string; doi_dias: number };
type EstoqueHtml = {
  id_produto: string; origem: string | null; data_validade: string | null;
  quantidade: number | string | null; custo_unitario: number | string | null;
};
type DadosHtml = {
  geradoEm: string;
  hoje: string;
  limites: { amarelo: number; vermelho: number };
  filtro: { faixa: string; produtos: string[] };
  appUrl: string;
  skus: {
    id: string; descricao: string; emoji: string; faixa: string; doi: number;
    linhas: { origem: string; validade: string; qtd: number; custo: number }[];
  }[];
};

function emojiHtml(descricao: string): string {
  const d = descricao.toLowerCase();
  if (d.includes("mini ovos")) return "🐰";
  if (d.includes("ovo") || d.includes("bombons")) return "🍫";
  return "🎁";
}

function montarDadosHtml(
  prios: PrioHtml[], estoque: EstoqueHtml[], hoje: string, geradoEm: string,
  limites: { amarelo: number; vermelho: number }, filtro: { faixa: string; produtos: string[] }, appUrl: string,
): DadosHtml {
  const ordem = (f: string) => (f === "Atenção" ? 0 : 1);
  const skus = [...prios]
    .sort((a, b) => ordem(a.faixa) - ordem(b.faixa) || a.id_produto.localeCompare(b.id_produto))
    .map((p) => {
      const grupos = new Map<string, { origem: string; validade: string; qtd: number; custo: number }>();
      for (const e of estoque) {
        if (e.id_produto !== p.id_produto || !(Number(e.quantidade) > 0) || !e.data_validade) continue;
        const origem = e.origem ?? "—";
        const validade = String(e.data_validade).slice(0, 10);
        const qtd = Number(e.quantidade) || 0;
        const g = grupos.get(origem + "|" + validade) ?? { origem, validade, qtd: 0, custo: 0 };
        g.qtd += qtd;
        g.custo += qtd * (Number(e.custo_unitario) || 0);
        grupos.set(origem + "|" + validade, g);
      }
      const linhas = [...grupos.values()].sort((a, b) => a.validade.localeCompare(b.validade) || a.origem.localeCompare(b.origem));
      const descricao = p.descricao ?? p.id_produto;
      return { id: p.id_produto, descricao, emoji: emojiHtml(descricao), faixa: p.faixa, doi: p.doi_dias, linhas };
    });
  return { geradoEm, hoje, limites, filtro, appUrl, skus };
}

function gerarHtmlInterativo(d: DadosHtml): string {
  const dadosJson = JSON.stringify(d).replace(/</g, "\\u003c");
  const css = `
*{box-sizing:border-box}
body{margin:0;padding:20px;min-height:100vh;color:#fff;font-family:"Segoe UI",Arial,sans-serif;background:linear-gradient(135deg,#0a0a0a,#262626 55%,#1c1917)}
.topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
h1{margin:0;font-size:24px}
.sub{font-size:12px;color:rgba(255,255,255,.6);margin-top:2px}
.btn{display:inline-block;background:#fbbf24;color:#171717;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:999px}
.grade{display:grid;gap:12px;grid-template-columns:repeat(12,1fr);margin:16px 0}
.vidro{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);border-radius:12px;padding:12px}
.c3{grid-column:span 3}.c4{grid-column:span 4}.c2{grid-column:span 2}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.6);margin-bottom:8px}
.valor{font-size:28px;font-weight:700;margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{cursor:pointer;border:1px solid rgba(255,255,255,.25);background:transparent;color:rgba(255,255,255,.85);border-radius:999px;padding:4px 11px;font-size:12px}
.chip:hover{background:rgba(255,255,255,.1)}
.chip.on{background:#fbbf24;border-color:#fbbf24;color:#171717;font-weight:700}
h2{margin:0 0 8px;font-size:16px}
.leg{display:flex;gap:12px;font-size:11px;color:rgba(255,255,255,.7)}
.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
.barra{display:grid;grid-template-columns:minmax(120px,240px) 1fr auto;gap:10px;align-items:center;margin:6px 0;font-size:12px}
.barra b{font-weight:700}
.trilho{height:18px}
.trilho span{display:block;height:100%;border-radius:0 6px 6px 0}
.skus{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));margin-top:14px}
.sku h3{margin:0;font-size:14px;line-height:1.3}
.sku .cab{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px}
.tag{font-size:10px;border:1px solid;border-radius:999px;padding:1px 8px;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:10px;text-transform:uppercase;color:rgba(255,255,255,.6);text-align:left;padding:4px 6px 4px 0}
td{padding:4px 6px 4px 0;border-top:1px solid rgba(255,255,255,.1)}
.r{text-align:right}
.vd{color:#6ee7b7;font-weight:600}.am{color:#fcd34d;font-weight:600}.vm{color:#f87171;font-weight:600}
tr.tot td{border-top:1px solid rgba(255,255,255,.35);font-weight:700}
.vazio{font-size:12px;color:#fcd34d;padding:14px 0}
.rodape{margin-top:16px;font-size:11px;color:rgba(255,255,255,.5)}
@media(max-width:900px){.c3,.c4,.c2{grid-column:span 12}.barra{grid-template-columns:1fr}}
@media print{body{background:#fff;color:#000}.vidro{border-color:#ccc;background:#fff}.btn,.chips{display:none}}
`;
  const js = `
(function(){
var D=JSON.parse(document.getElementById('dados').textContent);
var LIM=D.limites,HOJE=D.hoje;
var estado={faixa:D.filtro.faixa||'Todas',produtos:(D.filtro.produtos||[]).slice()};
var COR={'Follow-up':'#5eead4','Atenção':'#fbbf24'};
function $(i){return document.getElementById(i);}
function ms(iso){var p=iso.split('-');return Date.UTC(+p[0],+p[1]-1,+p[2]);}
function dataBR(iso){var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
function brl(v){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function num(v){return v.toLocaleString('pt-BR',{maximumFractionDigits:2});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sem(dias,doi){var s=1-dias/doi;if(dias<0||s>LIM.vermelho)return{c:'vm',b:'🔴',s:s};if(s>=LIM.amarelo)return{c:'am',b:'🟡',s:s};return{c:'vd',b:'🟢',s:s};}
function shelfTxt(s){var p=Math.round(s*100);return p>100?'>100%':Math.max(p,0)+'%';}
function render(){
  var sel=D.skus.filter(function(s){return(estado.faixa==='Todas'||s.faixa===estado.faixa)&&(estado.produtos.length===0||estado.produtos.indexOf(s.id)>=0);});
  var dados=sel.map(function(s){
    var linhas=s.linhas.map(function(l){var dias=Math.round((ms(l.validade)-ms(HOJE))/86400000);var m=sem(dias,s.doi);return{origem:l.origem,validade:l.validade,qtd:l.qtd,custo:l.custo,dias:dias,c:m.c,b:m.b,s:m.s};});
    var qtd=0,custo=0;linhas.forEach(function(l){qtd+=l.qtd;custo+=l.custo;});
    return{s:s,linhas:linhas,qtd:qtd,custo:custo};
  });
  var totQ=0,totC=0;dados.forEach(function(x){totQ+=x.qtd;totC+=x.custo;});
  var h='';
  ['Todas','Follow-up','Atenção'].forEach(function(f){h+='<button class="chip'+(estado.faixa===f?' on':'')+'" data-faixa="'+f+'">'+f+'</button>';});
  $('chipsFaixa').innerHTML=h;
  h='<button class="chip'+(estado.produtos.length===0?' on':'')+'" data-prod="">Todos</button>';
  D.skus.forEach(function(s){h+='<button class="chip'+(estado.produtos.indexOf(s.id)>=0?' on':'')+'" data-prod="'+esc(s.id)+'">'+esc(s.descricao)+'</button>';});
  $('chipsProd').innerHTML=h;
  $('totQ').textContent=num(totQ);
  $('totC').textContent=brl(totC);
  var graf=dados.filter(function(x){return x.linhas.length>0;}).sort(function(a,b){return b.custo-a.custo;});
  var max=1;graf.forEach(function(x){if(x.custo>max)max=x.custo;});
  h='';
  graf.forEach(function(x){h+='<div class="barra"><b>'+esc(x.s.descricao)+'</b><div class="trilho"><span style="width:'+Math.round(x.custo/max*100)+'%;background:'+COR[x.s.faixa]+'"></span></div><span>'+brl(x.custo)+'</span></div>';});
  $('grafico').innerHTML=h||'<div class="vazio">Nenhum SKU com estoque no filtro atual.</div>';
  h='';
  dados.forEach(function(x){
    h+='<div class="vidro sku"><div class="cab"><h3>'+esc(x.s.descricao)+' '+x.s.emoji+'</h3><span class="tag" style="color:'+COR[x.s.faixa]+';border-color:'+COR[x.s.faixa]+'">'+esc(x.s.faixa)+'</span></div>';
    if(x.linhas.length===0){h+='<div class="vazio">⚠️ Sem estoque em nenhum almoxarifado.</div>';}
    else{
      h+='<table><thead><tr><th>Origem</th><th>Validade</th><th class="r">Qtd</th><th class="r">Dias p/ vencer</th><th class="r">Shelf</th></tr></thead><tbody>';
      x.linhas.forEach(function(l){h+='<tr><td>'+esc(l.origem)+'</td><td>'+dataBR(l.validade)+'</td><td class="r">'+num(l.qtd)+'</td><td class="r '+l.c+'">'+(l.dias<0?'vencido':l.dias)+'</td><td class="r '+l.c+'" style="white-space:nowrap">'+l.b+' '+shelfTxt(l.s)+'</td></tr>';});
      h+='<tr class="tot"><td colspan="2">Total</td><td class="r">'+num(x.qtd)+'</td><td class="r" colspan="2">'+brl(x.custo)+'</td></tr></tbody></table>';
    }
    h+='</div>';
  });
  $('skus').innerHTML=h||'<div class="vazio">Nenhum SKU encontrado para os filtros escolhidos.</div>';
}
document.addEventListener('click',function(e){
  var t=e.target;while(t&&t.tagName!=='BUTTON'){t=t.parentNode;}
  if(!t||t.tagName!=='BUTTON')return;
  if(t.hasAttribute('data-faixa')){estado.faixa=t.getAttribute('data-faixa');render();}
  else if(t.hasAttribute('data-prod')){
    var id=t.getAttribute('data-prod');
    if(id===''){estado.produtos=[];}
    else{var i=estado.produtos.indexOf(id);if(i>=0)estado.produtos.splice(i,1);else estado.produtos.push(id);}
    render();
  }
});
render();
})();
`;
  const lim = d.limites;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard Premium — ${d.geradoEm}</title><style>${css}</style></head><body>
<div class="topo"><div><h1>💎 Dashboard Premium</h1><div class="sub">SKUs top de linha: estoque, custo, validade e Shelf por almoxarifado · posição de ${d.geradoEm}</div></div><a class="btn" href="${d.appUrl}" target="_blank" rel="noopener">Abrir na plataforma →</a></div>
<div class="grade">
<div class="vidro c3"><div class="lbl">Prioridade</div><div class="chips" id="chipsFaixa"></div></div>
<div class="vidro c4"><div class="lbl">Produto</div><div class="chips" id="chipsProd"></div></div>
<div class="vidro c2"><div class="lbl">Total de Itens 🍫</div><div class="valor" id="totQ">—</div></div>
<div class="vidro c3"><div class="lbl">Custo Total 💸</div><div class="valor" id="totC">—</div></div>
</div>
<div class="vidro"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h2>Custo Operacional</h2><div class="leg"><span><i style="background:#fbbf24"></i>Atenção</span><span><i style="background:#5eead4"></i>Follow-up</span></div></div><div id="grafico"></div></div>
<div class="skus" id="skus"></div>
<div class="rodape">🟢 Shelf consumido abaixo de ${Math.round(lim.amarelo * 100)}% · 🟡 de ${Math.round(lim.amarelo * 100)}% a ${Math.round(lim.vermelho * 100)}% · 🔴 acima de ${Math.round(lim.vermelho * 100)}% ou vencido. Shelf = 1 − dias para vencer ÷ DOI. Dias para vencer calculados na data da posição (${d.geradoEm}). Custo = quantidade × custo unitário do estoque do sistema.</div>
<script type="application/json" id="dados">${dadosJson}</script>
<script>${js}</script>
</body></html>`;
}
// ===== fim do bloco compartilhado =====

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

    const htmlInterativo = gerarHtmlInterativo(
      montarDadosHtml(prios as PrioHtml[], (estoque ?? []) as EstoqueHtml[], hoje, agoraFmt, lim, { faixa: "Todas", produtos: [] }, APP_URL),
    );

    if (dryRun) return json({ ok: true, dry_run: true, data: hoje, resumo, html, html_interativo: htmlInterativo });

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
      anexo: { nome: "Dashboard_Premium_" + hoje + ".html", conteudo: htmlInterativo, mime: "text/html" },
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
