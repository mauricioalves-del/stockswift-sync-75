/**
 * Exportação de dashboard "BI ativo": gera um arquivo HTML autocontido com os
 * DADOS embarcados em JSON e todos os visuais recalculados no próprio arquivo.
 *
 * Diferente do snapshot (export-html.ts), aqui o HTML é interativo offline:
 * clicar em uma barra, fatia da pizza ou linha da tabela aplica um filtro
 * cruzado (cross-filter) que recalcula KPIs, gráficos e tabela — como no Power BI.
 * Sem CDN, sem banco, sem dependências externas.
 */

export type DimensaoBI = {
  /** chave do campo na linha */
  chave: string;
  /** rótulo exibido */
  rotulo: string;
  /** campo opcional com a descrição amigável do valor */
  chaveRotulo?: string;
  /** exibe como pizza em vez de barras */
  pizza?: boolean;
};

export type ColunaBI = {
  chave: string;
  rotulo: string;
  formato?: "texto" | "num" | "brl" | "data";
  alinhar?: "left" | "right";
};

export type ExportarBIInterativoParams = {
  titulo: string;
  subtitulo?: string;
  usuario?: string;
  /** dataset completo já achatado (uma linha = um registro) */
  linhas: Record<string, unknown>[];
  /** dimensões filtráveis / cross-filtráveis */
  dimensoes: DimensaoBI[];
  /** campo numérico principal (medida) */
  medida: { chave: string; rotulo: string; formato?: "brl" | "num" };
  /** medida secundária opcional (ex.: quantidade) */
  medidaSecundaria?: { chave: string; rotulo: string; formato?: "brl" | "num" };
  /** dimensão temporal usada na série e na análise MoM (valores ordenáveis: "2026-07") */
  serie?: { chave: string; rotulo: string };
  /** colunas da tabela de detalhe */
  colunas: ColunaBI[];
  /** filtros já aplicados na tela, apenas informativos */
  filtrosAtivos?: { label: string; valor: string }[];
};

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function exportarBIInterativo(params: ExportarBIInterativoParams) {
  const {
    titulo, subtitulo = "", usuario, linhas, dimensoes, medida,
    medidaSecundaria, serie, colunas, filtrosAtivos = [],
  } = params;

  const config = {
    titulo, subtitulo, usuario: usuario ?? "",
    geradoEm: new Date().toLocaleString("pt-BR"),
    dimensoes, medida, medidaSecundaria: medidaSecundaria ?? null,
    serie: serie ?? null, colunas, filtrosAtivos,
  };

  const json = JSON.stringify({ config, linhas }).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapar(titulo)}</title>
<style>${CSS}</style></head>
<body>
<header class="topo">
  <div>
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(subtitulo)}</p>
  </div>
  <div class="meta">
    <span>Gerado em ${escapar(config.geradoEm)}</span>
    ${usuario ? `<span>por ${escapar(usuario)}</span>` : ""}
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
<script id="dados" type="application/json">${json}</script>
<script>${JS}</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(titulo)}_${stamp(new Date())}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const CSS = `
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
th{position:sticky;top:0;background:#152banon;background:#16233c;text-align:left;padding:7px 8px;border-bottom:1px solid var(--linha);cursor:pointer;white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap}
tbody tr{cursor:pointer}
tbody tr:hover{background:rgba(79,195,247,.08)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.rodape{color:var(--mut);font-size:11px;margin-top:6px}
.vazio{color:var(--mut);text-align:center;padding:20px}
`;

const JS = String.raw`
(function(){
var P = JSON.parse(document.getElementById('dados').textContent);
var C = P.config, ROWS = P.linhas;
var CORES = ['#4FC3F7','#81C784','#FFB74D','#BA68C8','#E57373','#4DB6AC','#F06292','#9575CD','#AED581','#64B5F6'];
var filtros = {}; // dim -> array de valores
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
  var h = 26, alt = dados.length*h + 10, larg = 100;
  var sel = filtros[dim.chave]||[];
  var s = '<svg viewBox="0 0 '+larg+' '+alt+'" preserveAspectRatio="none" height="'+alt+'">';
  dados.forEach(function(d,i){
    var w = Math.max(0.5, d.v/max*62);
    var op = sel.length && sel.indexOf(d.k)<0 ? ' dim' : '';
    s += '<g class="bar'+op+'" onclick="__toggle(\''+dim.chave+'\',\''+String(d.k).replace(/'/g,"\\'")+'\')">'
      + '<rect x="0" y="'+(i*h+4)+'" width="'+w+'" height="16" rx="2" fill="'+CORES[i%CORES.length]+'"></rect>'
      + '<text x="0.6" y="'+(i*h+15.5)+'" font-size="8" fill="#0b1220" style="font-weight:600">'+esc(trunc(d.nome,42))+'</text>'
      + '<text x="'+(w+1)+'" y="'+(i*h+15.5)+'" font-size="8" fill="#e6edf7">'+esc(fmt(d.v,C.medida.formato||'brl'))+'</text>'
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
    var op = sel.length && sel.indexOf(d.k)<0 ? ' dim' : '';
    var clic = d.k==='__outros' ? '' : ' onclick="__toggle(\''+dim.chave+'\',\''+String(d.k).replace(/'/g,"\\'")+'\')"';
    s += '<path class="bar'+op+'"'+clic+' d="M'+cx+','+cy+' L'+x1.toFixed(2)+','+y1.toFixed(2)+' A'+r+','+r+' 0 '+big+',1 '+x2.toFixed(2)+','+y2.toFixed(2)+' Z" fill="'+CORES[i%CORES.length]+'" stroke="#111c30"><title>'+esc(d.nome)+' — '+esc(fmt(d.v,C.medida.formato||'brl'))+' ('+(d.v/total*100).toFixed(1)+'%)</title></path>';
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
    var v=m[k], hgt=v/max*140, x=i*(W/keys.length)+8, w=Math.max(10,(W/keys.length)-16);
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
