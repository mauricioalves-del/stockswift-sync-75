/**
 * Exporta o painel Investimento Operacional como HTML autocontido e interativo.
 * O arquivo nasce com os filtros ativos da tela e mantém a interação cruzada
 * entre gráficos (clicar em motivo, mês, área/operação refiltra tudo).
 */
export type LinhaExport = {
  data: string; sku: string; descricao: string; motivo: string; contexto: string;
  almox: string; responsavel: string; qtd: number; valor: number;
};

export function exportarInvestimentoHtml(opts: {
  titulo: string;
  de: string;
  ate: string;
  motivos: string[];
  motivosAtivos: string[];
  paleta: Record<string, string>;
  linhas: LinhaExport[];
}) {
  const dados = { ...opts, geradoEm: new Date().toLocaleString("pt-BR") };
  const json = JSON.stringify(dados).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.titulo}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#e9e4da;color:#1e293b;padding:24px}
h1{font-size:26px;margin:0 0 4px}.sub{color:#64748b;font-size:13px;margin:0 0 14px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center}
.chip{font-size:12px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #cbd5e1}
.chip.x{cursor:pointer;background:#1e293b;color:#fff;border-color:#1e293b}
.grid{display:grid;gap:14px;margin-bottom:14px}.g5{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.g3{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.card{background:#fff;border:1px solid #d6d0c4;border-radius:14px;padding:14px}
.kpi{cursor:pointer;user-select:none}.kpi.off{opacity:.35}.kpi .l{font-size:11px;color:#64748b}.kpi .v{font-size:20px;font-weight:700}.kpi .q{font-size:11px;color:#64748b}
.dark{background:#1b2230;color:#e2e8f0;border-color:#1b2230;border-radius:14px;padding:14px}
.dark h2{font-size:13px;text-align:center;margin:0 0 8px}
svg text{font-family:inherit}.clk{cursor:pointer}.dim{opacity:.25}
.leg{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;font-size:11px;margin-top:6px}
.leg span{cursor:pointer}.leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
th{color:#64748b;font-size:11px;cursor:pointer}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
td.m{font-family:monospace}h3{font-size:14px;margin:0 0 8px}
input[type=text]{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;min-width:260px}
.tip{position:fixed;display:none;pointer-events:none;background:#0f172a;color:#fff;font-size:12px;padding:6px 10px;border-radius:8px;z-index:9}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
</style></head><body>
<h1 id="t"></h1><p class="sub" id="s"></p>
<div class="chips" id="chips"></div>
<div class="grid g5" id="kpis"></div>
<div class="dark" style="margin-bottom:14px"><h2>Tendência mensal por motivo — análise MoM <span style="font-weight:400;color:#94a3b8">(clique numa coluna para filtrar o mês)</span></h2><div id="trend"></div><div class="leg" id="legT"></div></div>
<div class="grid g3">
 <div class="dark"><h2>Valor por motivo</h2><div id="bars"></div></div>
 <div class="dark"><h2>Cortesia — Área que solicitou</h2><div id="donut"></div><div class="leg" id="legD"></div></div>
 <div class="dark"><h2>Degustação — Operação</h2><div id="funnel"></div><div class="leg" id="legF"></div></div>
</div>
<div class="grid g3" id="tops"></div>
<div class="card"><div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><h3 style="margin:0">Lançamentos</h3><input type="text" id="busca" placeholder="Buscar SKU, produto, contexto, responsável..."/><span id="cnt" style="font-size:12px;color:#64748b;margin-left:auto"></span></div>
<div style="overflow-x:auto"><table><thead><tr><th data-k="data">Data</th><th data-k="sku">SKU</th><th data-k="descricao">Produto</th><th data-k="motivo">Motivo</th><th data-k="contexto">Contexto</th><th data-k="almox">Almox.</th><th data-k="responsavel">Responsável</th><th data-k="qtd" class="n">Qtd</th><th data-k="valor" class="n">Valor</th></tr></thead><tbody id="tb"></tbody></table></div>
<p style="font-size:11px;color:#64748b">Arquivo offline. Clique em KPIs, barras, fatias, faixas do funil ou colunas do mês para refiltrar todo o painel.</p></div>
<div class="tip" id="tip"></div>
<script id="d" type="application/json">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('d').textContent);var P=D.paleta;
var CTX=['#4FC3F7','#81C784','#BA68C8','#FFB74D','#F06292','#4DB6AC','#90A4AE','#FFD54F'];
var st={ativos:{},mes:null,ctx:null,busca:'',ord:{k:'data',d:-1}};
D.motivos.forEach(function(m){st.ativos[m]=D.motivosAtivos.indexOf(m)>=0});
function $(i){return document.getElementById(i)}
function brl(v){return 'R$ '+(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function k(v){return v>=1000?'R$ '+(v/1000).toFixed(1)+'k':'R$ '+v.toFixed(0)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function br(d){return d.split('-').reverse().join('/')}
var MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function fm(mk){var p=mk.split('-');return MES[+p[1]-1]+'/'+p[0].slice(2)}
$('t').textContent=D.titulo;$('s').textContent='Período '+br(D.de)+' a '+br(D.ate)+' · gerado em '+D.geradoEm;
function filt(ign){var t=st.busca.trim().toLowerCase();return D.linhas.filter(function(l){
 if(!st.ativos[l.motivo])return false;
 if(ign!=='mes'&&st.mes&&l.data.slice(0,7)!==st.mes)return false;
 if(ign!=='ctx'&&st.ctx&&(l.contexto||'Não informado')!==st.ctx)return false;
 if(t&&![l.sku,l.descricao,l.contexto,l.almox,l.responsavel].some(function(v){return String(v||'').toLowerCase().indexOf(t)>=0}))return false;
 return true})}
var tip=$('tip');function bindTips(root){root.querySelectorAll('[data-tip]').forEach(function(e){e.addEventListener('mousemove',function(ev){tip.textContent=e.getAttribute('data-tip');tip.style.display='block';tip.style.left=ev.clientX+12+'px';tip.style.top=ev.clientY+12+'px'});e.addEventListener('mouseleave',function(){tip.style.display='none'})})}
function chips(){var h='<span class="chip"><b>Período:</b> '+br(D.de)+' a '+br(D.ate)+'</span>';
 var a=D.motivos.filter(function(m){return st.ativos[m]});h+='<span class="chip"><b>Motivo:</b> '+(a.length===D.motivos.length?'Todos':esc(a.join(', ')||'Nenhum'))+'</span>';
 if(st.mes)h+='<span class="chip x" data-c="mes">Mês: '+fm(st.mes)+' ✕</span>';
 if(st.ctx)h+='<span class="chip x" data-c="ctx">Contexto: '+esc(st.ctx)+' ✕</span>';
 if(st.busca)h+='<span class="chip x" data-c="busca">Busca: '+esc(st.busca)+' ✕</span>';
 $('chips').innerHTML=h;$('chips').querySelectorAll('[data-c]').forEach(function(e){e.onclick=function(){var c=e.getAttribute('data-c');if(c==='busca'){st.busca='';$('busca').value=''}else st[c]=null;R()}})}
function kpis(L){var pm={},tot=0;D.motivos.forEach(function(m){pm[m]={v:0,q:0}});L.forEach(function(l){pm[l.motivo].v+=l.valor;pm[l.motivo].q++;tot+=l.valor});
 var h='<div class="card kpi"><div class="l">Total investido no período</div><div class="v">'+brl(tot)+'</div></div>';
 D.motivos.forEach(function(m){h+='<div class="card kpi'+(st.ativos[m]?'':' off')+'" data-m="'+esc(m)+'" style="border-left:4px solid '+P[m]+'"><div class="l">'+esc(m)+'</div><div class="v">'+brl(pm[m].v)+'</div><div class="q">'+pm[m].q+' baixa(s)</div></div>'});
 $('kpis').innerHTML=h;$('kpis').querySelectorAll('[data-m]').forEach(function(e){e.onclick=function(){var m=e.getAttribute('data-m');st.ativos[m]=!st.ativos[m];R()}});return pm}
function trend(){var L=filt('mes'),meses={};L.forEach(function(l){var mk=l.data.slice(0,7);if(!meses[mk]){meses[mk]={t:0};D.motivos.forEach(function(m){meses[mk][m]=0})}meses[mk][l.motivo]+=l.valor;meses[mk].t+=l.valor});
 var ks=Object.keys(meses).sort();var W=1000,H=300,pl=60,pr=50,pt=24,pb=30;if(!ks.length){$('trend').innerHTML='<p style="text-align:center;color:#94a3b8">Sem dados</p>';return}
 var max=Math.max.apply(null,ks.map(function(x){return meses[x].t}))||1;var cw=(W-pl-pr)/ks.length,bw=cw*0.7;
 var mom=ks.map(function(x,i){if(!i)return null;var a=meses[ks[i-1]].t;return a===0?(meses[x].t>0?100:0):(meses[x].t-a)/a*100});
 var mm=mom.filter(function(v){return v!=null});var mmax=Math.max(10,Math.max.apply(null,mm.concat([0]).map(Math.abs)));
 var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%">';
 for(var g=0;g<=4;g++){var y=pt+(H-pt-pb)*g/4;s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y+'" y2="'+y+'" stroke="#334155" stroke-dasharray="3 3"/><text x="'+(pl-6)+'" y="'+(y+4)+'" fill="#94a3b8" font-size="10" text-anchor="end">'+k(max*(4-g)/4)+'</text>'}
 var pts=[];ks.forEach(function(x,i){var cx=pl+cw*i+cw/2,y0=H-pb,dim=st.mes&&st.mes!==x?' class="clk dim"':' class="clk"';s+='<g data-mes="'+x+'"'+dim+'>';
  D.motivos.forEach(function(m){var v=meses[x][m];if(!v)return;var h=v/max*(H-pt-pb);y0-=h;s+='<rect x="'+(cx-bw/2)+'" y="'+y0+'" width="'+bw+'" height="'+h+'" fill="'+P[m]+'" data-tip="'+fm(x)+' · '+esc(m)+': '+brl(v)+'"/>'});
  s+='<text x="'+cx+'" y="'+(y0-6)+'" fill="#fff" font-size="11" font-weight="700" text-anchor="middle">'+brl(meses[x].t)+'</text><text x="'+cx+'" y="'+(H-12)+'" fill="#94a3b8" font-size="11" text-anchor="middle">'+fm(x)+'</text></g>';
  if(mom[i]!=null)pts.push([cx,pt+(H-pt-pb)*(1-(mom[i]+mmax)/(2*mmax)),mom[i]])});
 if(pts.length>1)s+='<polyline fill="none" stroke="#FFB74D" stroke-width="2" points="'+pts.map(function(p){return p[0]+','+p[1]}).join(' ')+'"/>';
 pts.forEach(function(p){s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#FFB74D" data-tip="MoM '+p[2].toFixed(1)+'%"/><text x="'+(p[0]+8)+'" y="'+(p[1]-6)+'" fill="'+(p[2]>=0?'#81C784':'#F06292')+'" font-size="10">'+(p[2]>=0?'▲':'▼')+Math.abs(p[2]).toFixed(1)+'%</text>'});
 s+='</svg>';$('trend').innerHTML=s;bindTips($('trend'));
 $('trend').querySelectorAll('[data-mes]').forEach(function(e){e.onclick=function(){var m=e.getAttribute('data-mes');st.mes=st.mes===m?null:m;R()}});
 $('legT').innerHTML=D.motivos.map(function(m){return '<span data-m="'+esc(m)+'" style="opacity:'+(st.ativos[m]?1:.35)+'"><i style="background:'+P[m]+'"></i>'+esc(m)+'</span>'}).join('')+'<span><i style="background:#FFB74D;height:2px"></i>MoM %</span>';
 $('legT').querySelectorAll('[data-m]').forEach(function(e){e.onclick=function(){var m=e.getAttribute('data-m');st.ativos[m]=!st.ativos[m];R()}})}
function bars(pm){var it=D.motivos.map(function(m){return{m:m,v:pm[m].v}}).sort(function(a,b){return a.v-b.v});var max=Math.max.apply(null,it.map(function(x){return x.v}))||1;
 var s='<svg viewBox="0 0 420 220" width="100%">';it.forEach(function(x,i){var y=15+i*50,w=x.v/max*220;s+='<g class="clk'+(st.ativos[x.m]?'':' dim')+'" data-m="'+esc(x.m)+'"><text x="110" y="'+(y+15)+'" fill="#e2e8f0" font-size="11" text-anchor="end">'+esc(x.m)+'</text><rect x="116" y="'+y+'" width="'+Math.max(2,w)+'" height="22" rx="4" fill="'+P[x.m]+'" data-tip="'+esc(x.m)+': '+brl(x.v)+'"/><text x="'+(120+w)+'" y="'+(y+15)+'" fill="#fff" font-size="10">'+brl(x.v)+'</text></g>'});
 $('bars').innerHTML=s+'</svg>';bindTips($('bars'));$('bars').querySelectorAll('[data-m]').forEach(function(e){e.onclick=function(){var m=e.getAttribute('data-m');st.ativos[m]=!st.ativos[m];R()}})}
function ctxs(mot){var L=filt('ctx').filter(function(l){return l.motivo===mot}),m={};L.forEach(function(l){var c=l.contexto||'Não informado';m[c]=(m[c]||0)+l.valor});return Object.keys(m).map(function(c){return{c:c,v:m[c]}}).sort(function(a,b){return b.v-a.v})}
function bindCtx(el){el.querySelectorAll('[data-ctx]').forEach(function(e){e.onclick=function(){var c=e.getAttribute('data-ctx');st.ctx=st.ctx===c?null:c;R()}})}
function legend(id,it){$(id).innerHTML=it.map(function(x,i){return '<span data-ctx="'+esc(x.c)+'" style="opacity:'+(st.ctx&&st.ctx!==x.c?.35:1)+'"><i style="background:'+CTX[i%CTX.length]+'"></i>'+esc(x.c)+'</span>'}).join('');bindCtx($(id))}
function donut(){var it=ctxs('Cortesia'),tot=it.reduce(function(s,x){return s+x.v},0);if(!tot||!st.ativos['Cortesia']){$('donut').innerHTML='<p style="text-align:center;color:#94a3b8">Sem dados</p>';$('legD').innerHTML='';return}
 var cx=200,cy=110,R1=80,R0=52,a=-Math.PI/2,s='<svg viewBox="0 0 400 220" width="100%">';
 it.forEach(function(x,i){var f=x.v/tot,b=a+f*2*Math.PI;if(f>=0.9999)b=a+2*Math.PI-0.0001;var lg=b-a>Math.PI?1:0;
  function p(r,t){return(cx+r*Math.cos(t)).toFixed(2)+' '+(cy+r*Math.sin(t)).toFixed(2)}
  s+='<path class="clk'+(st.ctx&&st.ctx!==x.c?' dim':'')+'" data-ctx="'+esc(x.c)+'" data-tip="'+esc(x.c)+': '+brl(x.v)+' ('+(f*100).toFixed(1)+'%)" fill="'+CTX[i%CTX.length]+'" d="M'+p(R1,a)+' A'+R1+' '+R1+' 0 '+lg+' 1 '+p(R1,b)+' L'+p(R0,b)+' A'+R0+' '+R0+' 0 '+lg+' 0 '+p(R0,a)+'Z"/>';
  var m=(a+b)/2,lx=cx+(R1+14)*Math.cos(m),ly=cy+(R1+14)*Math.sin(m);s+='<text x="'+lx+'" y="'+ly+'" fill="#fff" font-size="10" text-anchor="'+(Math.cos(m)>=0?'start':'end')+'">'+brl(x.v)+'</text>';a=b});
 $('donut').innerHTML=s+'</svg>';bindTips($('donut'));bindCtx($('donut'));legend('legD',it)}
function funnel(){var it=ctxs('Degustação');if(!it.length||!st.ativos['Degustação']){$('funnel').innerHTML='<p style="text-align:center;color:#94a3b8">Sem dados</p>';$('legF').innerHTML='';return}
 var max=it[0].v||1,h=Math.min(36,190/it.length),s='<svg viewBox="0 0 400 '+(it.length*h+20)+'" width="100%">';
 it.forEach(function(x,i){var w1=360*(x.v/max),nx=it[i+1]?360*(it[i+1].v/max):w1*0.8,y=10+i*h;w1=Math.max(w1,40);nx=Math.max(nx,30);
  s+='<g class="clk'+(st.ctx&&st.ctx!==x.c?' dim':'')+'" data-ctx="'+esc(x.c)+'"><path fill="'+CTX[i%CTX.length]+'" data-tip="'+esc(x.c)+': '+brl(x.v)+'" d="M'+(200-w1/2)+' '+y+' L'+(200+w1/2)+' '+y+' L'+(200+nx/2)+' '+(y+h-2)+' L'+(200-nx/2)+' '+(y+h-2)+'Z"/><text x="200" y="'+(y+h/2+3)+'" fill="#0f172a" font-size="10" font-weight="700" text-anchor="middle">'+brl(x.v)+'</text></g>'});
 $('funnel').innerHTML=s+'</svg>';bindTips($('funnel'));bindCtx($('funnel'));legend('legF',it)}
function tops(L){var defs=[['Top 10 — Degustações',['Degustação']],['Top 10 — Cortesias',['Cortesia']],['Top 10 — Outros (Sensorial e Uso e Consumo)',['Sensorial/Inovações','Uso e Consumo']]];
 $('tops').innerHTML=defs.map(function(d){var m={};L.forEach(function(l){if(d[1].indexOf(l.motivo)<0)return;var r=m[l.sku]||(m[l.sku]={sku:l.sku,desc:l.descricao,q:0,v:0});r.q+=l.qtd;r.v+=l.valor});
  var rows=Object.keys(m).map(function(x){return m[x]}).sort(function(a,b){return b.v-a.v}).slice(0,10);
  return '<div class="card"><h3>'+d[0]+'</h3><table><thead><tr><th>SKU</th><th>Produto</th><th class="n">Qtd</th><th class="n">Valor</th></tr></thead><tbody>'+(rows.map(function(r){return '<tr><td class="m">'+esc(r.sku)+'</td><td>'+esc(r.desc)+'</td><td class="n">'+r.q.toLocaleString('pt-BR')+'</td><td class="n">'+brl(r.v)+'</td></tr>'}).join('')||'<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem itens</td></tr>')+'</tbody></table></div>'}).join('')}
function tabela(L){var c=L.slice(),o=st.ord;c.sort(function(a,b){var x=a[o.k],y=b[o.k];if(o.k==='qtd'||o.k==='valor'){x=+x;y=+y}return x<y?-o.d:x>y?o.d:0});
 $('tb').innerHTML=c.slice(0,1000).map(function(l){return '<tr><td>'+br(l.data)+'</td><td class="m">'+esc(l.sku)+'</td><td>'+esc(l.descricao)+'</td><td><span class="badge" style="background:'+P[l.motivo]+'33">'+esc(l.motivo)+'</span></td><td>'+esc(l.contexto||'—')+'</td><td>'+esc(l.almox||'—')+'</td><td>'+esc(l.responsavel||'—')+'</td><td class="n">'+l.qtd+'</td><td class="n">'+brl(l.valor)+'</td></tr>'}).join('')||'<tr><td colspan="9" style="text-align:center;color:#94a3b8">Nenhum lançamento</td></tr>';
 $('cnt').textContent=c.length+' lançamento(s)'+(c.length>1000?' (mostrando 1000)':'')}
function R(){var L=filt();chips();var pm=kpis(L);trend();bars(pm);donut();funnel();tops(L);tabela(L)}
$('busca').addEventListener('input',function(e){st.busca=e.target.value;R()});
document.querySelectorAll('th[data-k]').forEach(function(th){th.onclick=function(){var k=th.getAttribute('data-k');if(st.ord.k===k)st.ord.d*=-1;else st.ord={k:k,d:1};R()}});
R();
})();
</script></body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investimento-operacional_${opts.de}_a_${opts.ate}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
