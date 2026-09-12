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

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ==== HTML interativo (BI ativo) — mesma lógica de src/lib/export-bi-interativo.ts ====
type DimensaoBI = { chave: string; rotulo: string; chaveRotulo?: string; pizza?: boolean };
type ColunaBI = { chave: string; rotulo: string; formato?: "texto" | "num" | "brl" | "data"; alinhar?: "left" | "right" };

function montarHtmlInterativo(params: {
  titulo: string; subtitulo?: string; linhas: Record<string, unknown>[];
  dimensoes: DimensaoBI[]; medida: { chave: string; rotulo: string; formato?: "brl" | "num" };
  medidaSecundaria?: { chave: string; rotulo: string; formato?: "brl" | "num" };
  serie?: { chave: string; rotulo: string }; colunas: ColunaBI[];
  filtrosAtivos?: { label: string; valor: string }[];
}): string {
  const { titulo, subtitulo = "", linhas, dimensoes, medida, medidaSecundaria, serie, colunas, filtrosAtivos = [] } = params;
  const config = {
    titulo, subtitulo, usuario: "",
    geradoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    dimensoes, medida, medidaSecundaria: medidaSecundaria ?? null,
    serie: serie ?? null, colunas, filtrosAtivos,
  };
  const dadosJson = JSON.stringify({ config, linhas }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titulo)}</title>
<style>${CSS_BI}</style></head>
<body>
<header class="topo">
  <div>
    <h1>${esc(titulo)}</h1>
    <p>${esc(subtitulo)}</p>
  </div>
  <div class="meta">
    <span>Gerado em ${esc(config.geradoEm)}</span>
    <span id="contador"></span>
  </div>
</header>
<div class="barra">
  <div id="chips" class="chips"></div>
  <input id="busca" placeholder="Buscar em todo o painel…" />
  <button id="limpar" class="btn">Limpar filtros</button>
  <button id="csv" class="btn">Baixar CSV</button>
</div>
<div class="dica">Clique em qualquer barra, fatia ou linha da tabela para filtrar todos os demais visuais. Clique de novo para remover.</div>
<section id="kpis" class="kpis"></section>
<section id="serie" class="painel"></section>
<section id="visuais" class="grid"></section>
<section class="painel">
  <h2>Detalhamento</h2>
  <div class="tabela-wrap"><table id="detalhe"></table></div>
  <div id="maisInfo" class="rodape"></div>
</section>
<script id="dados" type="application/json">${dadosJson}</script>
<script>${JS_BI}</script>
</body></html>`;
}

const CSS_BI = `
:root{--bg:#0b1220;--card:#111c30;--linha:#1e2c47;--txt:#e6edf7;--mut:#8ea3c2;--pri:#4FC3F7;--ok:#81C784;--bad:#E57373;--warn:#FFB74D}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.45 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
h1{font-size:18px;margin:0}h2{font-size:13px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
p{margin:2px 0 0;color:var(--mut);font-size:12px}
.topo{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--card);border-bottom:1px solid var(--linha);flex-wrap:wrap}
.meta{display:flex;gap:12px;color:var(--mut);font-size:11px;flex-wrap:wrap}
.barra{display:flex;gap:8px;align-items:center;padding:10px 18px;flex-wrap:wrap}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:color-mix(in srgb,var(--pri) 20%,transparent);border:1px solid var(--pri);color:var(--txt);border-radius:999px;padding:2px 10px;font-size:11px;cursor:pointer}
.chip:hover{background:color-mix(in srgb,var(--bad) 25%,transparent);border-color:var(--bad)}
input{background:var(--card);border:1px solid var(--linha);color:var(--txt);border-radius:8px;padding:6px 10px;min-width:220px;flex:1}
.btn{background:var(--card);border:1px solid var(--linha);color:var(--txt);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px}
.btn:hover{border-color:var(--pri)}
.dica{padding:0 18px 8px;color:var(--mut);font-size:11px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;padding:0 18px}
.kpi{background:var(--card);border:1px solid var(--linha);border-left:3px solid var(--pri);border-radius:10px;padding:10px 12px}
.kpi .t{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.kpi .v{font-size:20px;font-weight:700;margin-top:2px}
.kpi .h{font-size:11px;color:var(--mut)}
.painel{background:var(--card);border:1px solid var(--linha);border-radius:12px;margin:12px 18px;padding:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px;margin:0 18px 12px}
.grid .painel{margin:0}
svg{width:100%;display:block;overflow:visible}
.bar{cursor:pointer}
.bar:hover{opacity:.85}
.dim{opacity:.25}
.tabela-wrap{max-height:520px;overflow:auto;border:1px solid var(--linha);border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{position:sticky;top:0;background:#16233c;text-align:left;padding:7px 8px;border-bottom:1px solid var(--linha);cursor:pointer;white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap}
tbody tr{cursor:pointer}
tbody tr:hover{background:rgba(79,195,247,.08)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.rodape{color:var(--mut);font-size:11px;margin-top:6px}
.vazio{color:var(--mut);text-align:center;padding:20px}
`;

const JS_BI = String.raw`
(function(){
var P = JSON.parse(document.getElementById('dados').textContent);
var C = P.config, ROWS = P.linhas;
var CORES = ['#4FC3F7','#81C784','#FFB74D','#BA68C8','#E57373','#4DB6AC','#F06292','#9575CD','#AED581','#64B5F6'];
var filtros = {};
var busca = '';
var ordem = { col: C.medida.chave, dir: -1 };

function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function fmt(v, f){
  if(f==='brl') return num(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  if(f==='num') return num(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
  return v==null||v==='' ? '—' : String(v);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function compact(n){ var a=Math.abs(n); if(a>=1e6) return (n/1e6).toFixed(1)+'M'; if(a>=1e3) return (n/1e3).toFixed(1)+'k'; return n.toFixed(0); }
function rotuloDim(d, r){ var v = r[d.chave]; var t = d.chaveRotulo ? r[d.chaveRotulo] : null; return t ? (String(v)+' — '+String(t)) : String(v==null||v===''?'—':v); }

function passa(r, exceto){
  for(var k in filtros){
    if(k===exceto) continue;
    var vals = filtros[k]; if(!vals.length) continue;
    if(vals.indexOf(String(r[k]==null?'':r[k]))<0) return false;
  }
  if(busca){
    var hay=''; for(var c in r) hay += ' '+String(r[c]==null?'':r[c]);
    if(hay.toLowerCase().indexOf(busca)<0) return false;
  }
  return true;
}
function filtradas(exceto){ return ROWS.filter(function(r){return passa(r,exceto);}); }

function agregar(rows, dim){
  var m = {};
  rows.forEach(function(r){
    var k = String(r[dim.chave]==null?'':r[dim.chave]);
    if(!m[k]) m[k] = { k:k, nome: rotuloDim(dim,r), v:0 };
    m[k].v += num(r[C.medida.chave]);
  });
  return Object.keys(m).map(function(k){return m[k];}).sort(function(a,b){return b.v-a.v;});
}

function toggle(dim, valor){
  var cur = filtros[dim] || [];
  var i = cur.indexOf(valor);
  if(i>=0) cur.splice(i,1); else cur.push(valor);
  if(cur.length) filtros[dim]=cur; else delete filtros[dim];
  render();
}
window.__toggle = toggle;

function chips(){
  var el = document.getElementById('chips'); el.innerHTML='';
  (C.filtrosAtivos||[]).forEach(function(f){
    var s=document.createElement('span'); s.className='chip'; s.style.cursor='default';
    s.textContent = f.label+': '+f.valor; el.appendChild(s);
  });
  Object.keys(filtros).forEach(function(k){
    var d = C.dimensoes.filter(function(x){return x.chave===k;})[0];
    filtros[k].forEach(function(v){
      var s=document.createElement('span'); s.className='chip';
      s.textContent = (d?d.rotulo:k)+': '+(v||'—')+' ✕';
      s.onclick=function(){ toggle(k,v); };
      el.appendChild(s);
    });
  });
}

function kpis(rows){
  var total = rows.reduce(function(s,r){return s+num(r[C.medida.chave]);},0);
  var out = [];
  out.push(kpiHtml(C.medida.rotulo, fmt(total, C.medida.formato||'brl'), rows.length+' linha(s)'));
  if(C.medidaSecundaria){
    var t2 = rows.reduce(function(s,r){return s+num(r[C.medidaSecundaria.chave]);},0);
    out.push(kpiHtml(C.medidaSecundaria.rotulo, fmt(t2, C.medidaSecundaria.formato||'num'), ''));
  }
  C.dimensoes.slice(0,2).forEach(function(d){
    var s={}; rows.forEach(function(r){ s[String(r[d.chave])]=1; });
    out.push(kpiHtml(d.rotulo+' distintos', String(Object.keys(s).length), ''));
  });
  var ag = C.dimensoes.length ? agregar(rows, C.dimensoes[0]) : [];
  if(ag.length && total>0){
    out.push(kpiHtml('Maior concentração — '+C.dimensoes[0].rotulo, (ag[0].v/total*100).toFixed(0)+'%', ag[0].nome));
  }
  document.getElementById('kpis').innerHTML = out.join('');
}
function kpiHtml(t,v,h){ return '<div class="kpi"><div class="t">'+esc(t)+'</div><div class="v">'+esc(v)+'</div><div class="h">'+esc(h)+'</div></div>'; }

function barras(rows, dim, alvo, maxN){
  var dados = agregar(rows, dim).slice(0, maxN||10);
  var max = Math.max.apply(null, dados.map(function(d){return d.v;}).concat([1]));
  var h = 30, alt = dados.length*h + 8, W = 620;
  var sel = filtros[dim.chave]||[];
  var s = '<svg viewBox="0 0 '+W+' '+alt+'" height="'+alt+'">';
  dados.forEach(function(d,i){
    var w = Math.max(3, d.v/max*(W*0.62));
    var op = sel.length && sel.indexOf(d.k)<0 ? ' dim' : '';
    s += '<g class="bar'+op+'" onclick="__toggle(\'' + dim.chave + '\',\'' + String(d.k).replace(/'/g,"\\'") + '\')">'
      + '<rect x="0" y="'+(i*h+4)+'" width="'+w.toFixed(1)+'" height="20" rx="3" fill="'+CORES[i%CORES.length]+'"></rect>'
      + '<text x="6" y="'+(i*h+18)+'" font-size="11" fill="#0b1220" style="font-weight:600">'+esc(trunc(d.nome,46))+'</text>'
      + '<text x="'+(w+6).toFixed(1)+'" y="'+(i*h+18)+'" font-size="11" fill="#e6edf7">'+esc(fmt(d.v,C.medida.formato||'brl'))+'</text>'
      + '<title>'+esc(d.nome)+' — '+esc(fmt(d.v,C.medida.formato||'brl'))+'</title></g>';
  });
  s += '</svg>';
  alvo.innerHTML = dados.length ? s : '<div class="vazio">Sem dados</div>';
}
function trunc(s,n){ s=String(s); return s.length>n ? s.slice(0,n-1)+'…' : s; }

function pizza(rows, dim, alvo){
  var dados = agregar(rows, dim), total = dados.reduce(function(s,d){return s+d.v;},0);
  if(!total){ alvo.innerHTML='<div class="vazio">Sem dados</div>'; return; }
  var top = dados.slice(0,6), resto = dados.slice(6).reduce(function(s,d){return s+d.v;},0);
  if(resto>0) top.push({k:'__outros', nome:'Outros', v:resto});
  var cx=90, cy=90, r=72, ang=-Math.PI/2, sel=filtros[dim.chave]||[];
  var s='<svg viewBox="0 0 320 185" height="185">';
  top.forEach(function(d,i){
    var a2 = ang + (d.v/total)*Math.PI*2;
    var x1=cx+r*Math.cos(ang), y1=cy+r*Math.sin(ang), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    var big = (a2-ang)>Math.PI?1:0;
    var cheio = (d.v/total) > 0.9999;
    var op = sel.length && sel.indexOf(d.k)<0 ? ' dim' : '';
    var clic = d.k==='__outros' ? '' : ' onclick="__toggle(\''+dim.chave+'\',\''+String(d.k).replace(/'/g,"\\'")+'\')"';
    s += cheio
      ? '<circle class="bar'+op+'"'+clic+' cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+CORES[i%CORES.length]+'"><title>'+esc(d.nome)+' — '+esc(fmt(d.v,C.medida.formato||'brl'))+' (100%)</title></circle>'
      : '<path class="bar'+op+'"'+clic+' d="M'+cx+','+cy+' L'+x1.toFixed(2)+','+y1.toFixed(2)+' A'+r+','+r+' 0 '+big+',1 '+x2.toFixed(2)+','+y2.toFixed(2)+' Z" fill="'+CORES[i%CORES.length]+'" stroke="#111c30"><title>'+esc(d.nome)+' — '+esc(fmt(d.v,C.medida.formato||'brl'))+' ('+(d.v/total*100).toFixed(1)+'%)</title></path>';
    s += '<g transform="translate(180,'+(18+i*22)+')"><rect width="10" height="10" rx="2" fill="'+CORES[i%CORES.length]+'"></rect><text x="15" y="9" font-size="10" fill="#e6edf7">'+esc(trunc(d.nome,20))+' · '+(d.v/total*100).toFixed(0)+'%</text></g>';
    ang = a2;
  });
  s+='</svg>';
  alvo.innerHTML = s;
}

function serieChart(rows){
  var el = document.getElementById('serie');
  if(!C.serie){ el.style.display='none'; return; }
  var dim = { chave: C.serie.chave, rotulo: C.serie.rotulo };
  var m = {};
  rows.forEach(function(r){ var k=String(r[dim.chave]==null?'':r[dim.chave]); m[k]=(m[k]||0)+num(r[C.medida.chave]); });
  var keys = Object.keys(m).sort();
  var max = Math.max.apply(null, keys.map(function(k){return m[k];}).concat([1]));
  var W = Math.max(keys.length*70, 420), H=210, base=170, sel=filtros[dim.chave]||[];
  var s='<h2>'+esc(C.serie.rotulo)+' — '+esc(C.medida.rotulo)+' (clique para filtrar) </h2>';
  s+='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'">';
  [0,.25,.5,.75,1].forEach(function(f){ var y=base-f*140; s+='<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'" stroke="#1e2c47"></line><text x="2" y="'+(y-3)+'" font-size="9" fill="#8ea3c2">'+compact(max*f)+'</text>'; });
  var pontos=[];
  keys.forEach(function(k,i){
    var v=m[k], hgt=v/max*140, x=i*(W/keys.length)+8, w=Math.min(90,Math.max(10,(W/keys.length)-16));
    var ant = i>0 ? m[keys[i-1]] : null;
    var varp = ant && ant>0 ? ((v-ant)/ant*100) : null;
    var op = sel.length && sel.indexOf(k)<0 ? ' dim' : '';
    s+='<g class="bar'+op+'" onclick="__toggle(\''+dim.chave+'\',\''+k.replace(/'/g,"\\'")+'\')">'
     + '<rect x="'+x+'" y="'+(base-hgt)+'" width="'+w+'" height="'+hgt+'" rx="3" fill="#4FC3F7"></rect>'
     + '<text x="'+(x+w/2)+'" y="'+(base-hgt-4)+'" font-size="9" text-anchor="middle" fill="#e6edf7">'+compact(v)+'</text>'
     + '<text x="'+(x+w/2)+'" y="'+(base+14)+'" font-size="9" text-anchor="middle" fill="#8ea3c2">'+esc(k)+'</text>'
     + (varp===null?'':'<text x="'+(x+w/2)+'" y="'+(base+27)+'" font-size="9" text-anchor="middle" fill="'+(varp>0?'#E57373':'#81C784')+'">'+(varp>0?'+':'')+varp.toFixed(0)+'%</text>')
     + '<title>'+esc(k)+' — '+esc(fmt(v,C.medida.formato||'brl'))+'</title></g>';
    pontos.push([x+w/2, base-hgt]);
  });
  s+='<polyline fill="none" stroke="#FFB74D" stroke-width="1.5" points="'+pontos.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ')+'"></polyline>';
  s+='</svg>';
  el.innerHTML=s;
}

function visuais(rows){
  var cont = document.getElementById('visuais'); cont.innerHTML='';
  C.dimensoes.forEach(function(d){
    var p=document.createElement('section'); p.className='painel';
    p.innerHTML='<h2>Top 10 · '+esc(d.rotulo)+'</h2><div></div>';
    cont.appendChild(p);
    var alvo=p.querySelector('div');
    if(d.pizza) pizza(rows,d,alvo); else barras(rows,d,alvo,10);
  });
}

function tabela(rows){
  var dados = rows.slice().sort(function(a,b){
    var x=a[ordem.col], y=b[ordem.col];
    if(typeof x==='number'||typeof y==='number') return (num(x)-num(y))*ordem.dir;
    return String(x==null?'':x).localeCompare(String(y==null?'':y))*ordem.dir;
  });
  var lim = dados.slice(0,500);
  var th = C.colunas.map(function(c){
    return '<th data-col="'+esc(c.chave)+'" class="'+((c.formato==='brl'||c.formato==='num')?'num':'')+'">'+esc(c.rotulo)+(ordem.col===c.chave?(ordem.dir<0?' ▼':' ▲'):'')+'</th>';
  }).join('');
  var tb = lim.map(function(r,i){
    return '<tr data-i="'+i+'">'+C.colunas.map(function(c){
      var cls=(c.formato==='brl'||c.formato==='num')?' class="num"':'';
      return '<td'+cls+'>'+esc(fmt(r[c.chave], c.formato))+'</td>';
    }).join('')+'</tr>';
  }).join('');
  var t = document.getElementById('detalhe');
  t.innerHTML = '<thead><tr>'+th+'</tr></thead><tbody>'+(tb||'<tr><td class="vazio" colspan="'+C.colunas.length+'">Sem dados</td></tr>')+'</tbody>';
  t.querySelectorAll('th').forEach(function(h){
    h.onclick=function(){ var c=h.getAttribute('data-col'); ordem = { col:c, dir: ordem.col===c ? -ordem.dir : -1 }; render(); };
  });
  t.querySelectorAll('tbody tr[data-i]').forEach(function(tr){
    tr.onclick=function(){
      var r = lim[Number(tr.getAttribute('data-i'))];
      var d = C.dimensoes[0]; if(!d) return;
      toggle(d.chave, String(r[d.chave]==null?'':r[d.chave]));
    };
  });
  document.getElementById('maisInfo').textContent = dados.length>lim.length
    ? ('Exibindo as 500 primeiras de '+dados.length+' linhas. Use os filtros ou baixe o CSV para o conjunto completo.')
    : (dados.length+' linha(s).');
  window.__atual = dados;
}

function render(){
  var rows = filtradas(null);
  chips(); kpis(rows); serieChart(rows); visuais(rows); tabela(rows);
  document.getElementById('contador').textContent = rows.length+' de '+ROWS.length+' linhas';
}

document.getElementById('limpar').onclick=function(){ filtros={}; busca=''; document.getElementById('busca').value=''; render(); };
var tmr; document.getElementById('busca').oninput=function(e){ clearTimeout(tmr); var v=e.target.value.toLowerCase(); tmr=setTimeout(function(){ busca=v; render(); },200); };
document.getElementById('csv').onclick=function(){
  var rows = window.__atual||[];
  var head = C.colunas.map(function(c){return '"'+c.rotulo+'"';}).join(';');
  var body = rows.map(function(r){ return C.colunas.map(function(c){ return '"'+String(r[c.chave]==null?'':r[c.chave]).replace(/"/g,'""')+'"'; }).join(';'); }).join('\n');
  var blob = new Blob(['\ufeff'+head+'\n'+body], {type:'text/csv;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='detalhe.csv'; a.click();
};
render();
})();
`;


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
