// ===== HTML interativo do Dashboard Premium (bloco compartilhado: tela e e-mail) =====
export type PrioHtml = { id_produto: string; descricao: string | null; faixa: string; doi_dias: number };
export type EstoqueHtml = {
  id_produto: string; origem: string | null; data_validade: string | null;
  quantidade: number | string | null; custo_unitario: number | string | null;
};
export type DadosHtml = {
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

export function montarDadosHtml(
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

export function gerarHtmlInterativo(d: DadosHtml): string {
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
