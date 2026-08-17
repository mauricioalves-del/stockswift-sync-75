/**
 * Exportação "estilo Power BI" do dashboard de Dispersão de Lote.
 *
 * Diferente do snapshot estático (export-html.ts), aqui os DADOS são embarcados
 * no arquivo em JSON e todo o dashboard é recalculado no próprio HTML:
 * filtros ativos, KPIs, gráficos (SVG desenhados via JS), tabelas ordenáveis,
 * drill-down por barra e exportação CSV — tudo offline, sem banco e sem CDN.
 */

export type LinhaBI = {
  data: string | null;
  mes: string;
  ano: string;
  id_op: string;
  produto: string | null;
  desc_produto: string | null;
  material: string;
  desc_material: string | null;
  um: string | null;
  qtd_previsto: number;
  qtd_consumo: number;
  qtd_dif: number;
  custo: number;
  impacto: number;
  pct: number | null;
  cls: string;
  tem_furo: boolean;
  linha_origem: string | null;
};

export type ExportarBIParams = {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaBI[];
  limFreq: number;
  limImpacto: number;
  usuario?: string;
  filtrosIniciais?: {
    dtDe?: string;
    dtAte?: string;
    produto?: string;
    material?: string;
    linha?: string;
    classificacao?: string;
    granularidade?: string;
  };
};

const CORES = {
  perda: "#E57373",
  economia: "#81C784",
  primaria: "#4FC3F7",
  destaque: "#FFB74D",
  grade: "#334155",
};

function escapar(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function exportarDispersaoBI({
  titulo,
  subtitulo = "Ficha Técnica × Consumo real por Ordem de Produção",
  linhas,
  limFreq,
  limImpacto,
  usuario,
  filtrosIniciais = {},
}: ExportarBIParams) {
  const agora = new Date();
  const payload = {
    geradoEm: agora.toLocaleString("pt-BR"),
    usuario: usuario ?? "",
    limFreq,
    limImpacto,
    filtros: filtrosIniciais,
    cores: CORES,
    linhas,
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapar(titulo)} — ${payload.geradoEm}</title>
<style>${CSS}</style>
</head>
<body>
<header class="hd">
  <div>
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(subtitulo)}</p>
  </div>
  <div class="hd-meta">
    <div>Gerado em ${escapar(payload.geradoEm)}${usuario ? ` · ${escapar(usuario)}` : ""}</div>
    <div class="hd-btns">
      <button id="btn-reset" class="btn">Limpar filtros</button>
      <button id="btn-csv" class="btn btn-p">Baixar CSV</button>
    </div>
  </div>
</header>

<section class="card filtros">
  <div class="f"><label>Data inicial</label><input type="date" id="f-de" /></div>
  <div class="f"><label>Data final</label><input type="date" id="f-ate" /></div>
  <div class="f"><label>Mês</label><select id="f-mes"></select></div>
  <div class="f"><label>Linha / Origem</label><select id="f-linha"></select></div>
  <div class="f"><label>Classificação</label><select id="f-cls"></select></div>
  <div class="f"><label>Produto</label><input type="search" id="f-prod" placeholder="SKU ou descrição" /></div>
  <div class="f"><label>Material</label><input type="search" id="f-mat" placeholder="Código ou descrição" /></div>
  <div class="f"><label>Granularidade</label>
    <div class="seg" id="f-granul">
      <button data-v="dia">Dia</button><button data-v="mes" class="on">Mês</button><button data-v="ano">Ano</button>
    </div>
  </div>
</section>

<section class="kpis" id="kpis"></section>

<section class="card">
  <div class="card-h"><h2>Tendência financeira</h2><span class="hint" id="hint-tend">Clique numa barra para filtrar o período</span></div>
  <div id="ch-tend" class="chart"></div>
</section>

<div class="grid2">
  <section class="card">
    <div class="card-h"><h2>Impacto por linha / origem</h2></div>
    <div id="ch-linha" class="chart"></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Matriz de criticidade (freq × impacto)</h2></div>
    <div id="ch-matriz" class="chart"></div>
  </section>
</div>

<div class="grid2">
  <section class="card">
    <div class="card-h"><h2>Top 10 perda</h2></div>
    <div id="tb-perda"></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Top 10 economia</h2></div>
    <div id="tb-economia"></div>
  </section>
</div>

<section class="card">
  <div class="card-h"><h2>Detalhamento</h2><span class="hint" id="cont-linhas"></span></div>
  <input type="search" id="f-busca" class="busca" placeholder="Buscar no detalhamento..." />
  <div class="tw"><table id="tb-det"><thead></thead><tbody></tbody></table></div>
  <div class="pager"><button class="btn" id="pg-prev">Anterior</button><span id="pg-info"></span><button class="btn" id="pg-next">Próxima</button></div>
</section>

<div id="tip" class="tip"></div>
<footer class="ft">Relatório interativo — dados embarcados no arquivo, recalculados localmente.</footer>
<script id="dados" type="application/json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>
<script>${RUNTIME}</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(titulo)}_interativo_${stamp(agora)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:20px;background:#0f172a;color:#e2e8f0;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
h1{margin:0;font-size:24px}h2{margin:0;font-size:15px;font-weight:600}
p{margin:4px 0 0;color:#94a3b8;font-size:13px}
.hd{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.hd-meta{font-size:12px;color:#94a3b8;text-align:right}
.hd-btns{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}
.btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer}
.btn:hover{background:#293548}.btn-p{background:#4FC3F7;color:#0b1220;border-color:#4FC3F7;font-weight:600}
.card{background:#111c33;border:1px solid #24334d;border-radius:14px;padding:14px;margin-bottom:14px}
.card-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.hint{font-size:12px;color:#94a3b8}
.filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.f label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;margin-bottom:4px}
.f input,.f select{width:100%;font:inherit;font-size:13px;padding:7px 9px;border-radius:8px;border:1px solid #334155;background:#0f1a2e;color:#e2e8f0}
.seg{display:flex;border:1px solid #334155;border-radius:8px;overflow:hidden}
.seg button{flex:1;font:inherit;font-size:13px;padding:7px 0;background:#0f1a2e;color:#cbd5e1;border:0;cursor:pointer}
.seg button.on{background:#4FC3F7;color:#0b1220;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px}
.kpi{background:#111c33;border:1px solid #24334d;border-radius:14px;padding:12px 14px}
.kpi .l{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8}
.kpi .v{font-size:21px;font-weight:700;margin-top:4px}
.kpi .s{font-size:11px;color:#94a3b8;margin-top:2px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
.chart{width:100%;overflow-x:auto}
svg text{fill:#cbd5e1;font-size:10px}
.tw{overflow:auto;max-height:520px;border:1px solid #24334d;border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{position:sticky;top:0;background:#16233d;padding:8px;text-align:left;cursor:pointer;white-space:nowrap;border-bottom:1px solid #24334d}
thead th:hover{color:#4FC3F7}
tbody td{padding:7px 8px;border-bottom:1px solid #1c2942;white-space:nowrap}
tbody tr:hover{background:#16233d}
.num{text-align:right}
.busca{width:min(340px,100%);font:inherit;font-size:13px;padding:7px 9px;border-radius:8px;border:1px solid #334155;background:#0f1a2e;color:#e2e8f0;margin-bottom:8px}
.pager{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:8px;font-size:12px;color:#94a3b8}
.tip{position:fixed;display:none;z-index:99;pointer-events:none;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:12px;box-shadow:0 8px 24px -10px #000}
.ft{margin-top:16px;font-size:11px;color:#64748b}
.tag{padding:2px 7px;border-radius:999px;font-size:11px;font-weight:600}
`;

const RUNTIME = String.raw`
(function(){
var D = JSON.parse(document.getElementById('dados').textContent);
var L = D.linhas, C = D.cores;
var brl = function(v){ return (v<0?'-':'')+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
var comp = function(v){ var a=Math.abs(v); if(a>=1e6) return (v/1e6).toFixed(1)+'M'; if(a>=1e3) return (v/1e3).toFixed(1)+'k'; return v.toFixed(0); };
var num = function(v,d){ return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); };
var el = function(id){ return document.getElementById(id); };
var tip = el('tip');
function showTip(e,html){ tip.innerHTML=html; tip.style.display='block'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+14)+'px'; }
function hideTip(){ tip.style.display='none'; }

var st = {
  de: D.filtros.dtDe||'', ate: D.filtros.dtAte||'', mes:'todos', linha:'todas', cls:'todas',
  prod: D.filtros.produto||'', mat: D.filtros.material||'', granul: D.filtros.granularidade||'mes',
  busca:'', pagina:0, ordem:{campo:'impacto',asc:false}
};
if(D.filtros.linha && D.filtros.linha!=='todas') st.linha=D.filtros.linha;
if(D.filtros.classificacao && D.filtros.classificacao!=='todas') st.cls=D.filtros.classificacao;

// ---- opções dos selects
function ops(sel, valores, rotuloTodos){
  var h='<option value="'+(rotuloTodos.v)+'">'+rotuloTodos.l+'</option>';
  valores.forEach(function(v){ h+='<option value="'+v.v+'">'+v.l+'</option>'; });
  sel.innerHTML=h;
}
var MES_N=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function labelMes(k){ var p=k.split('-'); return MES_N[Number(p[1])-1]+'/'+p[0].slice(2); }
var meses = Array.from(new Set(L.map(function(r){return r.mes;}))).filter(function(m){return m!=='SEM_DATA';}).sort().reverse();
var linhasOrigem = Array.from(new Set(L.map(function(r){return r.linha_origem;}).filter(Boolean))).sort();
var classes = Array.from(new Set(L.map(function(r){return r.cls;}).filter(Boolean))).sort();
ops(el('f-mes'), meses.map(function(m){return {v:m,l:labelMes(m)};}), {v:'todos',l:'Todos'});
ops(el('f-linha'), linhasOrigem.map(function(m){return {v:m,l:m};}), {v:'todas',l:'Todas'});
ops(el('f-cls'), classes.map(function(m){return {v:m,l:m};}), {v:'todas',l:'Todas'});

function sincronizarControles(){
  el('f-de').value=st.de; el('f-ate').value=st.ate; el('f-mes').value=st.mes;
  el('f-linha').value=st.linha; el('f-cls').value=st.cls;
  el('f-prod').value=st.prod; el('f-mat').value=st.mat; el('f-busca').value=st.busca;
  Array.prototype.forEach.call(el('f-granul').children,function(b){ b.classList.toggle('on', b.dataset.v===st.granul); });
}

function filtrar(){
  var p=st.prod.toLowerCase(), m=st.mat.toLowerCase(), b=st.busca.toLowerCase();
  return L.filter(function(r){
    if(st.mes!=='todos' && r.mes!==st.mes) return false;
    if(st.de && (!r.data || r.data<st.de)) return false;
    if(st.ate && (!r.data || r.data>st.ate)) return false;
    if(st.linha!=='todas' && r.linha_origem!==st.linha) return false;
    if(st.cls!=='todas' && r.cls!==st.cls) return false;
    if(p && (String(r.produto||'')+' '+String(r.desc_produto||'')).toLowerCase().indexOf(p)===-1) return false;
    if(m && (String(r.material||'')+' '+String(r.desc_material||'')).toLowerCase().indexOf(m)===-1) return false;
    if(b && (r.id_op+' '+r.material+' '+(r.desc_material||'')+' '+(r.produto||'')+' '+(r.desc_produto||'')).toLowerCase().indexOf(b)===-1) return false;
    return true;
  });
}

function agregarMatriz(rows){
  var map={};
  rows.forEach(function(r){
    if(!r.tem_furo) return;
    var c=map[r.material]||(map[r.material]={material:r.material,desc:r.desc_material||r.material,ops:{},liq:0,abs:0});
    c.ops[r.id_op]=1; c.liq+=r.impacto; c.abs+=Math.abs(r.impacto);
  });
  return Object.keys(map).map(function(k){
    var m=map[k], freq=Object.keys(m.ops).length;
    var q = freq>=D.limFreq && m.abs>=D.limImpacto ? 'Crítico recorrente'
      : freq<D.limFreq && m.abs>=D.limImpacto ? 'Pontual'
      : freq>=D.limFreq ? 'Crônico' : 'Controle';
    return {material:m.material,desc:m.desc,freq:freq,liq:m.liq,abs:m.abs,quad:q};
  }).sort(function(a,b){return b.abs-a.abs;});
}

function renderKpis(rows,matriz){
  var ops={},opsFuro={},opsCrit={},perda=0,economia=0;
  rows.forEach(function(r){
    ops[r.id_op]=1; if(r.tem_furo) opsFuro[r.id_op]=1;
    if(r.impacto>0) perda+=r.impacto; else economia+=-r.impacto;
    if(r.cls==='CRITICO') opsCrit[r.id_op]=1;
  });
  var nOps=Object.keys(ops).length, nFuro=Object.keys(opsFuro).length;
  var totalAbs=matriz.reduce(function(s,m){return s+m.abs;},0);
  var top20=matriz.slice(0,20).reduce(function(s,m){return s+m.abs;},0);
  var cronicos=matriz.filter(function(m){return m.freq>=D.limFreq;}).length;
  var cards=[
    {l:'OPs analisadas',v:num(nOps),s:nFuro+' com furo'},
    {l:'Taxa de furo',v:(nOps?(100*nFuro/nOps):0).toFixed(1)+'%',s:'OPs com desvio'},
    {l:'Perda',v:brl(perda),s:'impacto positivo',c:C.perda},
    {l:'Economia',v:brl(economia),s:'impacto negativo',c:C.economia},
    {l:'Impacto líquido',v:brl(perda-economia),s:'perda − economia',c:(perda-economia)>0?C.perda:C.economia},
    {l:'Materiais crônicos',v:num(cronicos),s:'≥ '+D.limFreq+' OPs'},
    {l:'OPs críticas',v:num(Object.keys(opsCrit).length),s:'classificação crítica'},
    {l:'Concentração Top 20',v:(totalAbs?(100*top20/totalAbs):0).toFixed(1)+'%',s:'do impacto absoluto'}
  ];
  el('kpis').innerHTML = cards.map(function(k){
    return '<div class="kpi"><div class="l">'+k.l+'</div><div class="v"'+(k.c?' style="color:'+k.c+'"':'')+'>'+k.v+'</div><div class="s">'+k.s+'</div></div>';
  }).join('');
}

function svgWrap(w,h,inner){ return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" preserveAspectRatio="xMinYMid meet">'+inner+'</svg>'; }

function eixoY(x0,y0,h,max,w){
  var s='',n=4;
  for(var i=0;i<=n;i++){
    var v=max*i/n, y=y0-(h*i/n);
    s+='<line x1="'+x0+'" x2="'+(x0+w)+'" y1="'+y+'" y2="'+y+'" stroke="'+C.grade+'" stroke-opacity=".5"/>';
    s+='<text x="'+(x0-6)+'" y="'+(y+3)+'" text-anchor="end">'+comp(v)+'</text>';
  }
  return s;
}

function renderTendencia(rows){
  var map={};
  rows.forEach(function(r){
    if(!r.data) return;
    var k = st.granul==='dia'? r.data : st.granul==='ano'? r.ano : r.mes;
    var c=map[k]||(map[k]={k:k,perda:0,economia:0});
    if(r.impacto>0) c.perda+=r.impacto; else c.economia+=-r.impacto;
  });
  var dados=Object.keys(map).sort().map(function(k){return map[k];});
  if(!dados.length){ el('ch-tend').innerHTML='<p>Sem dados no filtro atual.</p>'; return; }
  var lbl=function(k){ if(st.granul==='ano') return k; if(st.granul==='mes') return labelMes(k); var p=k.split('-'); return p[2]+'/'+p[1]; };
  var w=Math.max(760, dados.length*64), h=300, x0=60, y0=250, gw=w-x0-20;
  var max=Math.max(1,Math.max.apply(null,dados.map(function(d){return Math.max(d.perda,d.economia);})));
  var bw=gw/dados.length, inner=eixoY(x0,y0,200,max,gw);
  dados.forEach(function(d,i){
    var cx=x0+bw*i+bw*0.12, bl=bw*0.34;
    [['perda',C.perda,0],['economia',C.economia,bl+2]].forEach(function(cfg){
      var v=d[cfg[0]], bh=200*v/max;
      if(v>0){
        inner+='<rect class="bar" data-k="'+d.k+'" x="'+(cx+cfg[2])+'" y="'+(y0-bh)+'" width="'+bl+'" height="'+bh+'" fill="'+cfg[1]+'" rx="3" style="cursor:pointer"'+
          ' data-tip="<b>'+lbl(d.k)+'</b><br>'+(cfg[0]==='perda'?'Perda':'Economia')+': '+brl(v)+'"/>';
        inner+='<text x="'+(cx+cfg[2]+bl/2)+'" y="'+(y0-bh-4)+'" text-anchor="middle">'+comp(v)+'</text>';
      }
    });
    inner+='<text x="'+(x0+bw*i+bw/2)+'" y="'+(y0+16)+'" text-anchor="middle">'+lbl(d.k)+'</text>';
  });
  inner+='<line x1="'+x0+'" x2="'+(x0+gw)+'" y1="'+y0+'" y2="'+y0+'" stroke="'+C.grade+'"/>';
  inner+='<rect x="'+x0+'" y="275" width="10" height="10" fill="'+C.perda+'"/><text x="'+(x0+16)+'" y="284">Perda</text>';
  inner+='<rect x="'+(x0+70)+'" y="275" width="10" height="10" fill="'+C.economia+'"/><text x="'+(x0+86)+'" y="284">Economia</text>';
  el('ch-tend').innerHTML=svgWrap(w,h,inner);
  el('ch-tend').querySelectorAll('rect.bar').forEach(function(b){
    b.addEventListener('mousemove',function(e){ showTip(e,b.dataset.tip); });
    b.addEventListener('mouseleave',hideTip);
    b.addEventListener('click',function(){
      var k=b.dataset.k;
      if(st.granul==='dia'){ st.de=k; st.ate=k; st.mes='todos'; }
      else if(st.granul==='mes'){ st.mes=(st.mes===k?'todos':k); st.de=''; st.ate=''; }
      else { st.de=k+'-01-01'; st.ate=k+'-12-31'; st.mes='todos'; }
      st.pagina=0; sincronizarControles(); render();
    });
  });
}

function renderLinha(rows){
  var map={};
  rows.forEach(function(r){ if(!r.linha_origem) return; map[r.linha_origem]=(map[r.linha_origem]||0)+Math.abs(r.impacto); });
  var dados=Object.keys(map).map(function(k){return {k:k,v:map[k]};}).sort(function(a,b){return b.v-a.v;}).slice(0,12);
  if(!dados.length){ el('ch-linha').innerHTML='<p>Sem linha/origem no filtro atual.</p>'; return; }
  var h=Math.max(160,dados.length*30+30), w=720, x0=170;
  var max=Math.max.apply(null,dados.map(function(d){return d.v;}));
  var inner='';
  dados.forEach(function(d,i){
    var y=14+i*30, bw=(w-x0-90)*d.v/max;
    inner+='<text x="'+(x0-8)+'" y="'+(y+14)+'" text-anchor="end">'+d.k.slice(0,26)+'</text>';
    inner+='<rect x="'+x0+'" y="'+y+'" width="'+Math.max(2,bw)+'" height="20" rx="4" fill="'+C.destaque+'" style="cursor:pointer" data-l="'+d.k+'" data-tip="<b>'+d.k+'</b><br>'+brl(d.v)+'"/>';
    inner+='<text x="'+(x0+bw+8)+'" y="'+(y+14)+'">'+brl(d.v)+'</text>';
  });
  el('ch-linha').innerHTML=svgWrap(w,h,inner);
  el('ch-linha').querySelectorAll('rect').forEach(function(b){
    b.addEventListener('mousemove',function(e){ showTip(e,b.dataset.tip); });
    b.addEventListener('mouseleave',hideTip);
    b.addEventListener('click',function(){ st.linha=(st.linha===b.dataset.l?'todas':b.dataset.l); st.pagina=0; sincronizarControles(); render(); });
  });
}

function renderMatriz(matriz){
  var w=720,h=320,x0=50,y0=270;
  if(!matriz.length){ el('ch-matriz').innerHTML='<p>Sem materiais com furo no filtro atual.</p>'; return; }
  var maxX=Math.max(D.limFreq*2, Math.max.apply(null,matriz.map(function(m){return m.freq;})));
  var maxY=Math.max(D.limImpacto*2, Math.max.apply(null,matriz.map(function(m){return m.abs;})));
  var gw=w-x0-20, gh=y0-20;
  var inner=eixoY(x0,y0,gh,maxY,gw);
  var lx=x0+gw*D.limFreq/maxX, ly=y0-gh*D.limImpacto/maxY;
  inner+='<line x1="'+lx+'" x2="'+lx+'" y1="20" y2="'+y0+'" stroke="'+C.primaria+'" stroke-dasharray="4 4" stroke-opacity=".7"/>';
  inner+='<line x1="'+x0+'" x2="'+(x0+gw)+'" y1="'+ly+'" y2="'+ly+'" stroke="'+C.primaria+'" stroke-dasharray="4 4" stroke-opacity=".7"/>';
  matriz.forEach(function(m){
    var cx=x0+gw*Math.min(m.freq,maxX)/maxX, cy=y0-gh*Math.min(m.abs,maxY)/maxY;
    var cor = m.quad==='Crítico recorrente'?C.perda:m.quad==='Pontual'?C.destaque:m.quad==='Crônico'?C.primaria:C.economia;
    inner+='<circle cx="'+cx+'" cy="'+cy+'" r="5" fill="'+cor+'" fill-opacity=".85" style="cursor:pointer" data-m="'+m.material+'" data-tip="<b>'+m.material+'</b><br>'+m.desc+'<br>OPs: '+m.freq+'<br>Impacto: '+brl(m.abs)+'<br>'+m.quad+'"/>';
  });
  inner+='<text x="'+(x0+gw/2)+'" y="'+(y0+26)+'" text-anchor="middle">Frequência (nº de OPs)</text>';
  el('ch-matriz').innerHTML=svgWrap(w,h+10,inner);
  el('ch-matriz').querySelectorAll('circle').forEach(function(c){
    c.addEventListener('mousemove',function(e){ showTip(e,c.dataset.tip); });
    c.addEventListener('mouseleave',hideTip);
    c.addEventListener('click',function(){ st.mat=c.dataset.m; st.pagina=0; sincronizarControles(); render(); });
  });
}

function tabelaTop(id,dados,cor){
  if(!dados.length){ el(id).innerHTML='<p>Sem dados.</p>'; return; }
  var h='<div class="tw"><table><thead><tr><th>Material</th><th>Descrição</th><th class="num">OPs</th><th class="num">Impacto</th></tr></thead><tbody>';
  dados.forEach(function(m){
    h+='<tr><td>'+m.material+'</td><td>'+(m.desc||'')+'</td><td class="num">'+m.freq+'</td><td class="num" style="color:'+cor+'">'+brl(m.liq)+'</td></tr>';
  });
  el(id).innerHTML=h+'</tbody></table></div>';
}

var COLS=[
  {c:'data',l:'Data',f:function(r){return r.data? r.data.split('-').reverse().join('/'):'—';}},
  {c:'id_op',l:'OP'},{c:'produto',l:'Produto'},{c:'desc_produto',l:'Descrição produto'},
  {c:'material',l:'Material'},{c:'desc_material',l:'Descrição material'},{c:'um',l:'UM'},
  {c:'qtd_previsto',l:'Previsto',n:1},{c:'qtd_consumo',l:'Consumo',n:1},{c:'qtd_dif',l:'Diferença',n:1},
  {c:'pct',l:'% Disp.',f:function(r){return r.pct==null?'—':Number(r.pct).toFixed(1)+'%';},n:1},
  {c:'custo',l:'Custo unit.',f:function(r){return brl(r.custo);},n:1},
  {c:'impacto',l:'Impacto',f:function(r){return brl(r.impacto);},n:1},
  {c:'cls',l:'Classificação'},{c:'linha_origem',l:'Linha/Origem'}
];
var POR_PAGINA=100;

function renderTabela(rows){
  var o=st.ordem;
  var ord=rows.slice().sort(function(a,b){
    var x=a[o.campo], y=b[o.campo];
    if(typeof x==='number'||typeof y==='number'){ return (o.asc?1:-1)*((x||0)-(y||0)); }
    return (o.asc?1:-1)*String(x||'').localeCompare(String(y||''),'pt-BR');
  });
  var total=Math.max(1,Math.ceil(ord.length/POR_PAGINA));
  if(st.pagina>=total) st.pagina=total-1;
  var pag=ord.slice(st.pagina*POR_PAGINA,(st.pagina+1)*POR_PAGINA);
  var t=el('tb-det');
  t.querySelector('thead').innerHTML='<tr>'+COLS.map(function(c){
    var seta=o.campo===c.c?(o.asc?' ▲':' ▼'):'';
    return '<th data-c="'+c.c+'"'+(c.n?' class="num"':'')+'>'+c.l+seta+'</th>';
  }).join('')+'</tr>';
  t.querySelector('tbody').innerHTML=pag.map(function(r){
    return '<tr>'+COLS.map(function(c){
      var v=c.f?c.f(r):(r[c.c]==null?'—':(typeof r[c.c]==='number'?num(r[c.c],2):r[c.c]));
      var cor = c.c==='impacto' ? (r.impacto>0?C.perda:r.impacto<0?C.economia:'') : '';
      return '<td'+(c.n?' class="num"':'')+(cor?' style="color:'+cor+'"':'')+'>'+v+'</td>';
    }).join('')+'</tr>';
  }).join('');
  t.querySelectorAll('thead th').forEach(function(th){
    th.addEventListener('click',function(){
      var c=th.dataset.c;
      st.ordem = st.ordem.campo===c ? {campo:c,asc:!st.ordem.asc} : {campo:c,asc:true};
      renderTabela(rows);
    });
  });
  el('cont-linhas').textContent=num(rows.length)+' linhas filtradas de '+num(L.length);
  el('pg-info').textContent='Página '+(st.pagina+1)+' de '+total;
  window.__rowsFiltradas=ord;
}

function render(){
  var rows=filtrar();
  var matriz=agregarMatriz(rows);
  renderKpis(rows,matriz);
  renderTendencia(rows);
  renderLinha(rows);
  renderMatriz(matriz);
  tabelaTop('tb-perda', matriz.filter(function(m){return m.liq>0;}).sort(function(a,b){return b.liq-a.liq;}).slice(0,10), C.perda);
  tabelaTop('tb-economia', matriz.filter(function(m){return m.liq<0;}).sort(function(a,b){return a.liq-b.liq;}).slice(0,10), C.economia);
  renderTabela(rows);
}

function bindInput(id,campo,evt){
  el(id).addEventListener(evt||'input',function(){ st[campo]=el(id).value; st.pagina=0; render(); });
}
bindInput('f-de','de','change'); bindInput('f-ate','ate','change');
bindInput('f-mes','mes','change'); bindInput('f-linha','linha','change'); bindInput('f-cls','cls','change');
bindInput('f-prod','prod'); bindInput('f-mat','mat'); bindInput('f-busca','busca');
Array.prototype.forEach.call(el('f-granul').children,function(b){
  b.addEventListener('click',function(){ st.granul=b.dataset.v; sincronizarControles(); render(); });
});
el('btn-reset').addEventListener('click',function(){
  st.de='';st.ate='';st.mes='todos';st.linha='todas';st.cls='todas';st.prod='';st.mat='';st.busca='';st.pagina=0;
  sincronizarControles(); render();
});
el('pg-prev').addEventListener('click',function(){ if(st.pagina>0){ st.pagina--; render(); } });
el('pg-next').addEventListener('click',function(){ st.pagina++; render(); });
el('btn-csv').addEventListener('click',function(){
  var rows=window.__rowsFiltradas||[];
  var csv=[COLS.map(function(c){return c.l;}).join(';')].concat(rows.map(function(r){
    return COLS.map(function(c){ var v=r[c.c]; return typeof v==='number'? String(v).replace('.',',') : String(v==null?'':v).replace(/;/g,','); }).join(';');
  })).join('\n');
  var b=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='dispersao_filtrado.csv'; a.click();
});

sincronizarControles();
render();
})();
`;
