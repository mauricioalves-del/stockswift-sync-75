/**
 * Exporta o Controle FEFO como HTML autocontido, com o mesmo layout do painel
 * (KPIs, transferências x quebras por dia, top produtos, destino e grupo),
 * os filtros ativos da tela e filtro cruzado entre todos os gráficos.
 */
export type LinhaFefoExport = {
  data: string; id_produto: string; descricao: string; grupo: string; destino: string;
  desc_movimento: string; lote_movimentado: string; lote_mais_antigo: string;
  status: string; situacao: string; qtd: number; quebra: boolean;
};

export function exportarFefoHtml(opts: {
  filtros: { label: string; valor: string }[];
  linhas: LinhaFefoExport[];
}) {
  const dados = { ...opts, geradoEm: new Date().toLocaleString("pt-BR") };
  const json = JSON.stringify(dados).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Controle FEFO</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#e9e4da;color:#1e293b;padding:24px}
h1{font-size:26px;margin:0 0 4px}.sub{color:#64748b;font-size:12px;margin:0 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.chip{font-size:12px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #cbd5e1}
.chip.x{cursor:pointer;background:#1e293b;color:#fff}
.grid{display:grid;gap:14px;margin-bottom:14px}.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.g2{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}
.card{background:#fff;border:1px solid #d6d0c4;border-radius:14px;padding:14px}
.kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}.kpi .v{font-size:22px;font-weight:700}.kpi .q{font-size:11px;color:#64748b}
.kpi.r{border-color:#dc2626}.kpi.r .v{color:#dc2626}.kpi.c{cursor:pointer}.kpi.on{outline:2px solid #1e293b}
h3{font-size:14px;margin:0 0 4px}.hint{font-size:11px;color:#64748b;margin:0 0 6px}
.clk{cursor:pointer}.dim{opacity:.25}.leg{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;font-size:12px;margin-top:6px}
.leg span{cursor:pointer}.leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{color:#64748b;font-size:11px;cursor:pointer}
td.n,th.n{text-align:right}td.m{font-family:monospace}
input{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;min-width:260px}
.tip{position:fixed;display:none;pointer-events:none;background:#0f172a;color:#fff;font-size:12px;padding:6px 10px;border-radius:8px;z-index:9}
.b{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;border:1px solid}
</style></head><body>
<h1>Controle FEFO</h1><p class="sub" id="s"></p>
<div class="chips" id="chips"></div>
<div class="grid g4" id="kpis"></div>
<div class="grid g2">
 <div class="card"><h3>Transferências e quebras por dia</h3><p class="hint">Clique num dia para filtrar.</p><div id="dia"></div><div class="leg"><span><i style="background:#4a7c80;border-radius:2px"></i>Transferências</span><span><i style="background:#dc2626;border-radius:2px"></i>Quebras</span></div></div>
 <div class="card"><h3>Top produtos com mais quebras</h3><p class="hint">Clique num produto para filtrar.</p><div id="top"></div></div>
 <div class="card"><h3>Transferências por destino</h3><p class="hint">Distribuição das transferências auditadas por destino.</p><div id="dest"></div><div class="leg" id="legDest"></div></div>
 <div class="card"><h3>Transferências por grupo de produto</h3><p class="hint">Distribuição das transferências auditadas por grupo.</p><div id="grp"></div><div class="leg" id="legGrp"></div></div>
</div>
<div class="card"><div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><h3 style="margin:0">Transferências auditadas</h3><input id="busca" placeholder="Código, descrição ou lote..."/><span id="cnt" style="margin-left:auto;font-size:12px;color:#64748b"></span></div>
<div style="overflow-x:auto"><table><thead><tr><th data-k="data">Data</th><th data-k="id_produto">Código</th><th data-k="descricao">Produto</th><th data-k="grupo">Grupo</th><th data-k="desc_movimento">Movimento</th><th data-k="destino">Destino</th><th data-k="lote_movimentado">Lote mov.</th><th data-k="lote_mais_antigo">Lote mais antigo</th><th data-k="qtd" class="n">Qtd</th><th data-k="status">Status</th></tr></thead><tbody id="tb"></tbody></table></div>
<p style="font-size:11px;color:#64748b">Arquivo offline. Clique em qualquer gráfico ou nos cards de Quebras/OK para refiltrar o painel inteiro.</p></div>
<div class="tip" id="tip"></div>
<script id="d" type="application/json">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('d').textContent);
var COR=['#4a7c80','#2f3a5f','#b4bfe0','#f5a623','#dc2626','#475569','#81C784','#BA68C8'];
var st={dia:null,prod:null,dest:null,grp:null,sit:null,busca:'',ord:{k:'data',d:-1}};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function br(d){return d.split('-').reverse().join('/')}
$('s').textContent='Checagem das transferências saindo da Fábrica · gerado em '+D.geradoEm;
var NOMES={dia:'Dia',prod:'Produto',dest:'Destino',grp:'Grupo',sit:'Situação'};
function filt(ign){var t=st.busca.trim().toLowerCase();return D.linhas.filter(function(l){
 if(ign!=='dia'&&st.dia&&l.data!==st.dia)return false;
 if(ign!=='prod'&&st.prod&&l.id_produto!==st.prod)return false;
 if(ign!=='dest'&&st.dest&&l.destino!==st.dest)return false;
 if(ign!=='grp'&&st.grp&&l.grupo!==st.grp)return false;
 if(ign!=='sit'&&st.sit&&l.situacao!==st.sit)return false;
 if(t&&(l.id_produto+' '+l.descricao+' '+l.lote_movimentado+' '+l.lote_mais_antigo).toLowerCase().indexOf(t)<0)return false;
 return true})}
var tip=$('tip');function tips(r){r.querySelectorAll('[data-tip]').forEach(function(e){e.onmousemove=function(ev){tip.textContent=e.getAttribute('data-tip');tip.style.display='block';tip.style.left=ev.clientX+12+'px';tip.style.top=ev.clientY+12+'px'};e.onmouseleave=function(){tip.style.display='none'}})}
function bind(r,key){r.querySelectorAll('[data-v]').forEach(function(e){e.onclick=function(){var v=e.getAttribute('data-v');st[key]=st[key]===v?null:v;R()}})}
function dim(key,v){return st[key]&&st[key]!==v?' dim':''}
function chips(){var h=D.filtros.map(function(f){return '<span class="chip"><b>'+esc(f.label)+':</b> '+esc(f.valor)+'</span>'}).join('');
 Object.keys(NOMES).forEach(function(k){if(st[k])h+='<span class="chip x" data-c="'+k+'">'+NOMES[k]+': '+esc(k==='dia'?br(st[k]):st[k])+' ✕</span>'});
 if(st.busca)h+='<span class="chip x" data-c="busca">Busca: '+esc(st.busca)+' ✕</span>';
 $('chips').innerHTML=h;$('chips').querySelectorAll('[data-c]').forEach(function(e){e.onclick=function(){var c=e.getAttribute('data-c');if(c==='busca'){st.busca='';$('busca').value=''}else st[c]=null;R()}})}
function kpis(L){var q=L.filter(function(l){return l.quebra}).length,ok=L.filter(function(l){return l.situacao==='OK'}).length,inc=L.filter(function(l){return l.situacao==='Inconclusivo'}).length;
 $('kpis').innerHTML='<div class="card kpi"><div class="l">Transferências auditadas</div><div class="v">'+L.length+'</div><div class="q">'+L.length+' linha(s) no filtro</div></div>'+
 '<div class="card kpi r c'+(st.sit==='Quebra de FEFO'?' on':'')+'" data-v="Quebra de FEFO"><div class="l">Quebras de FEFO</div><div class="v">'+q+'</div><div class="q">clique para filtrar</div></div>'+
 '<div class="card kpi r"><div class="l">Taxa de quebra</div><div class="v">'+(L.length?(q/L.length*100).toFixed(1):'0.0')+'%</div></div>'+
 '<div class="card kpi c'+(st.sit==='OK'?' on':'')+'" data-v="OK"><div class="l">OK / Inconclusivo</div><div class="v">'+ok+' / '+inc+'</div><div class="q">clique para filtrar OK</div></div>';bind($('kpis'),'sit')}
function dia(){var L=filt('dia'),m={};L.forEach(function(l){var e=m[l.data]||(m[l.data]={t:0,q:0});e.t++;if(l.quebra)e.q++});var ks=Object.keys(m).sort();
 if(!ks.length){$('dia').innerHTML='<p class="hint">Sem dados</p>';return}var W=900,H=260,pl=34,pb=40,pt=16,max=Math.max.apply(null,ks.map(function(k){return m[k].t}))||1,cw=(W-pl-10)/ks.length,bw=Math.min(22,cw*0.38);
 var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%">';for(var g=0;g<=4;g++){var y=pt+(H-pt-pb)*g/4;s+='<line x1="'+pl+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="'+(pl-4)+'" y="'+(y+3)+'" font-size="9" fill="#64748b" text-anchor="end">'+Math.round(max*(4-g)/4)+'</text>'}
 ks.forEach(function(k,i){var x=pl+cw*i+cw/2,h1=m[k].t/max*(H-pt-pb),h2=m[k].q/max*(H-pt-pb),y0=H-pb;
  s+='<g class="clk'+dim('dia',k)+'" data-v="'+k+'" data-tip="'+br(k)+': '+m[k].t+' transf., '+m[k].q+' quebras"><rect x="'+(x-cw/2)+'" y="'+pt+'" width="'+cw+'" height="'+(H-pt-pb)+'" fill="transparent"/><rect x="'+(x-bw)+'" y="'+(y0-h1)+'" width="'+bw+'" height="'+h1+'" fill="#4a7c80"/><rect x="'+x+'" y="'+(y0-h2)+'" width="'+bw+'" height="'+Math.max(h2,0)+'" fill="#dc2626"/>'+
  '<text x="'+(x-bw/2)+'" y="'+(y0-h1-3)+'" font-size="8" text-anchor="middle">'+m[k].t+'</text><text x="'+(x+bw/2)+'" y="'+(y0-h2-3)+'" font-size="8" text-anchor="middle">'+m[k].q+'</text><text x="'+x+'" y="'+(H-pb+14)+'" font-size="8" fill="#64748b" text-anchor="middle" transform="rotate(-30 '+x+' '+(H-pb+14)+')">'+k.slice(5)+'</text></g>'});
 $('dia').innerHTML=s+'</svg>';tips($('dia'));bind($('dia'),'dia')}
function top(){var L=filt('prod').filter(function(l){return l.quebra}),m={};L.forEach(function(l){var e=m[l.id_produto]||(m[l.id_produto]={n:l.id_produto+(l.descricao?' — '+l.descricao:''),q:0});e.q++});
 var it=Object.keys(m).map(function(k){return{k:k,n:m[k].n,q:m[k].q}}).sort(function(a,b){return b.q-a.q}).slice(0,10);if(!it.length){$('top').innerHTML='<p class="hint">Sem quebras</p>';return}
 var max=it[0].q,s='<svg viewBox="0 0 600 '+(it.length*26+10)+'" width="100%">';it.forEach(function(x,i){var y=5+i*26,w=x.q/max*340;
  s+='<g class="clk'+dim('prod',x.k)+'" data-v="'+esc(x.k)+'" data-tip="'+esc(x.n)+': '+x.q+' quebra(s)"><text x="226" y="'+(y+14)+'" font-size="9.5" text-anchor="end">'+esc(x.n.length>40?x.n.slice(0,39)+'…':x.n)+'</text><rect x="232" y="'+y+'" width="'+w+'" height="18" rx="3" fill="#dc2626"/><text x="'+(236+w)+'" y="'+(y+13)+'" font-size="10">'+x.q+'</text></g>'});
 $('top').innerHTML=s+'</svg>';tips($('top'));bind($('top'),'prod')}
function pie(id,legId,key,campo,donut){var L=filt(key),m={};L.forEach(function(l){m[l[campo]]=(m[l[campo]]||0)+1});var it=Object.keys(m).map(function(k){return{k:k,v:m[k]}}).sort(function(a,b){return b.v-a.v}),tot=L.length;
 if(!tot){$(id).innerHTML='<p class="hint">Sem dados</p>';$(legId).innerHTML='';return}
 var cx=260,cy=120,R1=90,R0=donut?55:0,a=-Math.PI/2,s='<svg viewBox="0 0 520 240" width="100%">';function p(r,t){return(cx+r*Math.cos(t)).toFixed(2)+' '+(cy+r*Math.sin(t)).toFixed(2)}
 it.forEach(function(x,i){var f=x.v/tot,b=a+f*2*Math.PI;if(f>0.9999)b=a+2*Math.PI-0.001;var lg=b-a>Math.PI?1:0,c=COR[i%COR.length];
  var d=R0?'M'+p(R1,a)+' A'+R1+' '+R1+' 0 '+lg+' 1 '+p(R1,b)+' L'+p(R0,b)+' A'+R0+' '+R0+' 0 '+lg+' 0 '+p(R0,a)+'Z':'M'+cx+' '+cy+' L'+p(R1,a)+' A'+R1+' '+R1+' 0 '+lg+' 1 '+p(R1,b)+'Z';
  var mm=(a+b)/2,lx=cx+(R1+12)*Math.cos(mm),ly=cy+(R1+12)*Math.sin(mm);
  s+='<g class="clk'+dim(key,x.k)+'" data-v="'+esc(x.k)+'" data-tip="'+esc(x.k)+': '+x.v+' ('+Math.round(f*100)+'%)"><path d="'+d+'" fill="'+c+'" stroke="#fff"/><text x="'+lx+'" y="'+ly+'" font-size="11" fill="'+c+'" text-anchor="'+(Math.cos(mm)>=0?'start':'end')+'">'+esc(x.k)+' '+x.v+' ('+Math.round(f*100)+'%)</text></g>';a=b});
 $(id).innerHTML=s+'</svg>';tips($(id));bind($(id),key);
 $(legId).innerHTML=it.map(function(x,i){return '<span class="'+dim(key,x.k)+'" data-v="'+esc(x.k)+'"><i style="background:'+COR[i%COR.length]+'"></i>'+esc(x.k)+'</span>'}).join('');bind($(legId),key)}
function tone(s){return s.indexOf('QUEBRA')>=0?'color:#dc2626;border-color:#fca5a5':s.indexOf('OK')===0?'color:#059669;border-color:#6ee7b7':'color:#d97706;border-color:#fcd34d'}
function tabela(L){var c=L.slice(),o=st.ord;c.sort(function(a,b){var x=a[o.k],y=b[o.k];if(o.k==='qtd'){x=+x;y=+y}return x<y?-o.d:x>y?o.d:0});
 $('tb').innerHTML=c.slice(0,1500).map(function(l){return '<tr><td>'+br(l.data)+'</td><td class="m">'+esc(l.id_produto)+'</td><td>'+esc(l.descricao)+'</td><td>'+esc(l.grupo)+'</td><td>'+esc(l.desc_movimento)+'</td><td>'+esc(l.destino)+'</td><td class="m">'+esc(l.lote_movimentado)+'</td><td class="m">'+esc(l.lote_mais_antigo||'—')+'</td><td class="n">'+l.qtd.toLocaleString('pt-BR')+'</td><td><span class="b" style="'+tone(l.status)+'">'+esc(l.status)+'</span></td></tr>'}).join('')||'<tr><td colspan="10" style="text-align:center;color:#94a3b8">Nenhuma linha</td></tr>';
 $('cnt').textContent=c.length+' linha(s)'+(c.length>1500?' (mostrando 1500)':'')}
function R(){var L=filt();chips();kpis(L);dia();top();pie('dest','legDest','dest','destino',false);pie('grp','legGrp','grp','grupo',true);tabela(L)}
$('busca').oninput=function(e){st.busca=e.target.value;R()};
document.querySelectorAll('th[data-k]').forEach(function(th){th.onclick=function(){var k=th.getAttribute('data-k');if(st.ord.k===k)st.ord.d*=-1;else st.ord={k:k,d:1};R()}});
R();
})();
</script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `controle-fefo_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
