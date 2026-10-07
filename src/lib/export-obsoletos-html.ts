/**
 * Exporta o painel Risco Obsoletos como HTML autocontido e interativo:
 * KPIs, farol por faixa, risco por almoxarifado, custo por grupo e Top 10 por faixa,
 * com os filtros ativos da tela e filtro cruzado entre todos os gráficos.
 */
export type LinhaObsoletoExport = {
  id_produto: string; descricao: string; almoxarifado: string; grupo: string;
  empresa: string; lote: string; saldo: number; valor: number;
  dias: number | null; faixa: string;
};

export function exportarObsoletosHtml(opts: {
  filtros: { label: string; valor: string }[];
  linhas: LinhaObsoletoExport[];
}) {
  const dados = { ...opts, geradoEm: new Date().toLocaleString("pt-BR") };
  const json = JSON.stringify(dados).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Risco Obsoletos</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#e9e4da;color:#1e293b;padding:24px}
h1{font-size:28px;margin:0 0 4px}.sub{color:#64748b;font-size:12px;margin:0 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.chip{font-size:12px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #cbd5e1}
.chip.x{cursor:pointer;background:#1e293b;color:#fff}
.grid{display:grid;gap:14px;margin-bottom:14px}.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.g3{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.card{background:#fff;border:1px solid #d6d0c4;border-radius:14px;padding:14px}
.kpi{cursor:pointer}.kpi .l{font-size:11px;color:#64748b}.kpi .v{font-size:22px;font-weight:700}.kpi .q{font-size:11px;color:#64748b}.kpi.on{outline:2px solid #1e293b}
h3{font-size:15px;margin:0 0 6px}.hint{font-size:11px;color:#64748b;margin:0 0 6px}
.clk{cursor:pointer}.dim{opacity:.25}.leg{display:flex;gap:12px;justify-content:center;font-size:12px;margin-top:6px}.leg span{cursor:pointer}.leg i{display:inline-block;width:10px;height:10px;margin-right:4px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{color:#64748b;font-size:11px;cursor:pointer}
td.n,th.n{text-align:right}tr.clk:hover{background:#f8fafc}tr.sel{background:#fef3c7}
input{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;min-width:260px}
.tip{position:fixed;display:none;pointer-events:none;background:#0f172a;color:#fff;font-size:12px;padding:6px 10px;border-radius:8px;z-index:9}
.gb{margin-bottom:10px}.gb .h{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}.gb .bar{display:flex;height:14px;border-radius:4px;overflow:hidden;background:#f1f5f9}
.gb .bar div{font-size:9px;color:#fff;text-align:center;line-height:14px;overflow:hidden}
</style></head><body>
<h1>Risco Obsoletos</h1><p class="sub" id="s"></p>
<div class="chips" id="chips"></div>
<div class="grid g4" id="kpis"></div>
<div class="grid g3">
 <div class="card"><h3>Farol de Obsoletos</h3><p class="hint">Clique numa faixa para filtrar.</p><div id="farol"></div></div>
 <div class="card"><h3>Risco por Almoxarifado</h3><p class="hint">Clique num almoxarifado para filtrar.</p><div id="alm"></div><div class="leg" id="leg"></div></div>
 <div class="card"><h3>Custo Total por Grupo e Faixa</h3><p class="hint">Clique num grupo para filtrar.</p><div id="grp"></div></div>
</div>
<div class="grid g3" id="tops"></div>
<div class="card"><div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><h3 style="margin:0">Lista completa</h3><input id="busca" placeholder="Código, descrição ou lote..."/><span id="cnt" style="margin-left:auto;font-size:12px;color:#64748b"></span></div>
<div style="overflow-x:auto"><table><thead><tr><th data-k="id_produto">Código</th><th data-k="descricao">Descrição</th><th data-k="grupo">Grupo</th><th data-k="almoxarifado">Almoxarifado</th><th data-k="empresa">Empresa</th><th data-k="lote">Lote</th><th data-k="saldo" class="n">Saldo</th><th data-k="valor" class="n">Custo</th><th data-k="dias" class="n">Dias s/ mov.</th><th data-k="faixa">Faixa</th></tr></thead><tbody id="tb"></tbody></table></div>
<p style="font-size:11px;color:#64748b">Arquivo offline. Clique em gráficos, cards ou produtos do Top 10 para refiltrar o painel inteiro.</p></div>
<div class="tip" id="tip"></div>
<script id="d" type="application/json">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('d').textContent);
var FX=['30-60','61-90','+90'],FL={'30-60':'30 a 60 dias','61-90':'61 a 90 dias','+90':'Mais de 90 dias'},FC={'30-60':'#F2C14E','61-90':'#F1704B','+90':'#B23A2E'};
var st={faixa:null,alm:null,grp:null,prod:null,busca:'',ord:{k:'valor',d:-1}};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function brl(v){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function k(v){return v>=1000?Math.round(v/1000)+'k':Math.round(v)}
$('s').textContent='Itens em estoque sem movimentação sistêmica · gerado em '+D.geradoEm;
var NOMES={faixa:'Faixa',alm:'Almoxarifado',grp:'Grupo',prod:'Produto'};
function filt(ign){var t=st.busca.trim().toLowerCase();return D.linhas.filter(function(l){
 if(ign!=='faixa'&&st.faixa&&l.faixa!==st.faixa)return false;
 if(ign!=='alm'&&st.alm&&l.almoxarifado!==st.alm)return false;
 if(ign!=='grp'&&st.grp&&l.grupo!==st.grp)return false;
 if(ign!=='prod'&&st.prod&&l.id_produto!==st.prod)return false;
 if(t&&(l.id_produto+' '+l.descricao+' '+l.lote).toLowerCase().indexOf(t)<0)return false;
 return true})}
function soma(L){return L.reduce(function(a,l){return a+(l.valor||0)},0)}
var tip=$('tip');function tips(r){r.querySelectorAll('[data-tip]').forEach(function(e){e.onmousemove=function(ev){tip.textContent=e.getAttribute('data-tip');tip.style.display='block';tip.style.left=ev.clientX+12+'px';tip.style.top=ev.clientY+12+'px'};e.onmouseleave=function(){tip.style.display='none'}})}
function bind(r,key){r.querySelectorAll('[data-v]').forEach(function(e){e.onclick=function(){var v=e.getAttribute('data-v');st[key]=st[key]===v?null:v;R()}})}
function dim(key,v){return st[key]&&st[key]!==v?' dim':''}
function chips(){var h=D.filtros.map(function(f){return '<span class="chip"><b>'+esc(f.label)+':</b> '+esc(f.valor)+'</span>'}).join('');
 Object.keys(NOMES).forEach(function(c){if(st[c])h+='<span class="chip x" data-c="'+c+'">'+NOMES[c]+': '+esc(c==='faixa'?FL[st[c]]:st[c])+' ✕</span>'});
 if(st.busca)h+='<span class="chip x" data-c="busca">Busca: '+esc(st.busca)+' ✕</span>';
 $('chips').innerHTML=h;$('chips').querySelectorAll('[data-c]').forEach(function(e){e.onclick=function(){var c=e.getAttribute('data-c');if(c==='busca'){st.busca='';$('busca').value=''}else st[c]=null;R()}})}
function kpis(){var L=filt('faixa'),h='<div class="card kpi'+(st.faixa?'':' on')+'" data-v=""><div class="l">Itens em risco</div><div class="v" style="color:#dc2626">'+L.length+'</div><div class="q">'+brl(soma(L))+'</div></div>';
 FX.forEach(function(f){var x=L.filter(function(l){return l.faixa===f});h+='<div class="card kpi'+(st.faixa===f?' on':'')+'" data-v="'+f+'"><div class="l">'+FL[f]+'</div><div class="v"'+(f==='+90'?' style="color:#dc2626"':'')+'>'+x.length+'</div><div class="q">'+brl(soma(x))+'</div></div>'});
 $('kpis').innerHTML=h;$('kpis').querySelectorAll('[data-v]').forEach(function(e){e.onclick=function(){var v=e.getAttribute('data-v')||null;st.faixa=st.faixa===v?null:v;R()}})}
function farol(){var L=filt('faixa'),vs=FX.map(function(f){return soma(L.filter(function(l){return l.faixa===f}))}),max=Math.max.apply(null,vs)||1,W=520,H=240,pl=90;
 var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%">';FX.forEach(function(f,i){var y=10+i*75,w=vs[i]/max*(W-pl-110);
  s+='<g class="clk'+dim('faixa',f)+'" data-v="'+f+'" data-tip="'+FL[f]+': '+brl(vs[i])+'"><text x="'+(pl-6)+'" y="'+(y+32)+'" font-size="11" text-anchor="end" fill="#475569">'+FL[f]+'</text><rect x="'+pl+'" y="'+y+'" width="'+Math.max(w,1)+'" height="55" fill="'+FC[f]+'"/><text x="'+(pl+w+6)+'" y="'+(y+32)+'" font-size="10" fill="'+FC[f]+'">'+brl(vs[i])+'</text></g>'});
 $('farol').innerHTML=s+'</svg>';tips($('farol'));bind($('farol'),'faixa')}
function alm(){var L=filt('alm'),m={};L.forEach(function(l){var e=m[l.almoxarifado]||(m[l.almoxarifado]={t:0});e[l.faixa]=(e[l.faixa]||0)+l.valor;e.t+=l.valor});
 var ks=Object.keys(m).sort(function(a,b){return m[b].t-m[a].t});if(!ks.length){$('alm').innerHTML='<p class="hint">Sem dados</p>';return}
 var W=520,H=270,pl=40,pb=70,pt=10,max=m[ks[0]].t||1,cw=(W-pl)/ks.length,bw=Math.min(36,cw*0.7);
 var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%">';for(var g=0;g<=4;g++){var y=pt+(H-pt-pb)*g/4;s+='<line x1="'+pl+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="'+(pl-4)+'" y="'+(y+3)+'" font-size="9" fill="#64748b" text-anchor="end">'+k(max*(4-g)/4)+'</text>'}
 ks.forEach(function(a,i){var x=pl+cw*i+cw/2,y0=H-pb,t='<g class="clk'+dim('alm',a)+'" data-v="'+esc(a)+'" data-tip="'+esc(a)+': '+brl(m[a].t)+FX.map(function(f){return ' · '+FL[f]+' '+brl(m[a][f]||0)}).join('')+'"><rect x="'+(x-cw/2)+'" y="'+pt+'" width="'+cw+'" height="'+(H-pt-pb)+'" fill="transparent"/>';
  FX.forEach(function(f){var h=(m[a][f]||0)/max*(H-pt-pb);y0-=h;t+='<rect x="'+(x-bw/2)+'" y="'+y0+'" width="'+bw+'" height="'+h+'" fill="'+FC[f]+'"/>'});
  s+=t+'<text x="'+x+'" y="'+(H-pb+12)+'" font-size="8.5" fill="#64748b" text-anchor="end" transform="rotate(-30 '+x+' '+(H-pb+12)+')">'+esc(a)+'</text></g>'});
 $('alm').innerHTML=s+'</svg>';tips($('alm'));bind($('alm'),'alm')}
function grp(){var L=filt('grp'),m={};L.forEach(function(l){var e=m[l.grupo]||(m[l.grupo]={t:0});e[l.faixa]=(e[l.faixa]||0)+l.valor;e.t+=l.valor});
 var ks=Object.keys(m).sort(function(a,b){return m[b].t-m[a].t});
 $('grp').innerHTML=ks.length?ks.map(function(g){var e=m[g];return '<div class="gb clk'+dim('grp',g)+'" data-v="'+esc(g)+'"><div class="h"><span>'+esc(g)+'</span><b>'+brl(e.t)+'</b></div><div class="bar">'+FX.map(function(f){var p=e.t?(e[f]||0)/e.t*100:0;return p?'<div data-tip="'+FL[f]+': '+brl(e[f])+'" style="width:'+p+'%;background:'+FC[f]+'">'+(p>=8?p.toFixed(1)+'%':'')+'</div>':''}).join('')+'</div></div>'}).join(''):'<p class="hint">Sem dados</p>';
 tips($('grp'));bind($('grp'),'grp')}
function tops(){var L=filt('prod');$('tops').innerHTML=FX.map(function(f){var m={};L.filter(function(l){return l.faixa===f}).forEach(function(l){var e=m[l.id_produto]||(m[l.id_produto]={id:l.id_produto,d:l.descricao||l.id_produto,c:0});e.c+=l.valor});
  var all=Object.keys(m).map(function(x){return m[x]}).sort(function(a,b){return b.c-a.c}),tot=all.reduce(function(a,x){return a+x.c},0),it=all.slice(0,10);
  return '<div class="card"><h3><span style="color:'+FC[f]+'">●</span> Top 10 — '+FL[f]+'</h3><table><thead><tr><th>#</th><th>Descrição</th><th class="n">Custo</th><th class="n">%</th></tr></thead><tbody>'+
  (it.length?it.map(function(x,i){return '<tr class="clk'+(st.prod===x.id?' sel':'')+'" data-v="'+esc(x.id)+'"><td>'+(i+1)+'</td><td>'+esc(x.d)+'</td><td class="n">'+brl(x.c)+'</td><td class="n">'+(tot?(x.c/tot*100).toFixed(2):'0.00')+'%</td></tr>'}).join('')+'<tr><td></td><td><b>Total ('+all.length+' SKUs)</b></td><td class="n"><b>'+brl(tot)+'</b></td><td class="n">100,00%</td></tr>':'<tr><td colspan="4" class="hint">Sem itens</td></tr>')+'</tbody></table></div>'}).join('');
 bind($('tops'),'prod')}
function tabela(){var L=filt(null).slice(),o=st.ord;L.sort(function(a,b){var x=a[o.k],y=b[o.k];if(x==null)x='';if(y==null)y='';return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*o.d});
 $('cnt').textContent=L.length+' linha(s) · '+brl(soma(L))+(L.length>2000?' · exibindo 2.000':'');
 $('tb').innerHTML=L.slice(0,2000).map(function(l){return '<tr><td>'+esc(l.id_produto)+'</td><td>'+esc(l.descricao)+'</td><td>'+esc(l.grupo)+'</td><td>'+esc(l.almoxarifado)+'</td><td>'+esc(l.empresa)+'</td><td>'+esc(l.lote)+'</td><td class="n">'+(l.saldo||0).toLocaleString('pt-BR')+'</td><td class="n">'+brl(l.valor||0)+'</td><td class="n">'+(l.dias==null?'—':l.dias)+'</td><td><span style="color:'+FC[l.faixa]+'">●</span> '+FL[l.faixa]+'</td></tr>'}).join('')}
document.querySelectorAll('th[data-k]').forEach(function(th){th.onclick=function(){var kk=th.getAttribute('data-k');st.ord=st.ord.k===kk?{k:kk,d:-st.ord.d}:{k:kk,d:1};tabela()}});
$('busca').oninput=function(e){st.busca=e.target.value;R()};
$('leg').innerHTML=FX.map(function(f){return '<span data-v="'+f+'"><i style="background:'+FC[f]+'"></i>'+FL[f]+'</span>'}).join('');bind($('leg'),'faixa');
function R(){chips();kpis();farol();alm();grp();tops();tabela()}R();
})();
</script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `risco-obsoletos-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
