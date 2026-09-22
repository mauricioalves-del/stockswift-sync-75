import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/inventory";
import { fetchAll } from "@/lib/fetch-all";
import { Gift, Utensils, Sparkles, Package, TrendingUp, TrendingDown, List, Download } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell,
  Line, PieChart, Pie, FunnelChart, Funnel,
} from "recharts";

export const Route = createFileRoute("/_authenticated/baixas/investimento-operacional")({
  component: InvestimentoOperacionalDashboard,
  head: () => ({ meta: [
    { title: "Investimento Operacional — Controle Operacional" },
    { name: "description", content: "Acompanhamento de baixas por Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo, tratadas como investimento operacional, não perda." },
    { property: "og:title", content: "Investimento Operacional — Controle Operacional" },
    { property: "og:description", content: "Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo por área, operação, almoxarifado e período." },
  ] }),
});

const MOTIVOS_ALVO = ["Cortesia", "Degustação", "Sensorial/Inovações", "Uso e Consumo"];
const PALETTE: Record<string, string> = {
  "Cortesia": "#4FC3F7",
  "Degustação": "#81C784",
  "Sensorial/Inovações": "#BA68C8",
  "Uso e Consumo": "#FFB74D",
};
const SERIES = ["#4FC3F7", "#81C784", "#BA68C8", "#FFB74D", "#F06292", "#4DD0E1", "#AED581", "#FFD54F"];
const ICONS: Record<string, any> = { "Cortesia": Gift, "Degustação": Utensils, "Sensorial/Inovações": Sparkles, "Uso e Consumo": Package };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function fmtMonth(k: string) {
  const [y, m] = k.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? k}/${y.slice(2)}`;
}
const fmtCompact = (v: number) => `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;

function BiPanel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/40 bg-[hsl(220_18%_12%)] text-slate-100 shadow-lg ${className.includes("overflow-visible") ? "overflow-visible" : "overflow-hidden"} ${className}`}>
      <div className="px-4 pt-3 pb-2 text-center">
        <div className="text-sm font-semibold tracking-wide">{title}</div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

type TopRow = { codigo: string; descricao: string; qtd: number; valor: number };

function TopTable({ title, rows, total, onVerTudo }: { title: string; rows: TopRow[]; total: number; onVerTudo: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={onVerTudo} className="gap-1">
          <List className="size-3.5" /> Lista completa
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((r) => (
              <TableRow key={r.codigo}>
                <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                <TableCell className="max-w-[180px] truncate text-xs" title={r.descricao}>{r.descricao}</TableCell>
                <TableCell className="text-right tabular-nums">{r.qtd.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatBRL(r.valor)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum item no período.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length > 10 && (
          <div className="pt-2 text-xs text-muted-foreground">Exibindo 10 de {rows.length} itens · Total {formatBRL(total)}</div>
        )}
      </CardContent>
    </Card>
  );
}

type ListaCtx = { titulo: string; linhas: any[] } | null;

function ListaCompletaDialog({ ctx, onOpenChange }: { ctx: ListaCtx; onOpenChange: (o: boolean) => void }) {
  const [busca, setBusca] = useState("");
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = ctx?.linhas ?? [];
    return (t
      ? base.filter((l) => [l.codigo_produto, l.descricao, l.contexto_baixa, l.id_local, l.responsavel_nome, l.motivoNome]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(t)))
      : base
    ).slice().sort((a, b) => Number(b.valor_total || 0) - Number(a.valor_total || 0));
  }, [ctx, busca]);
  const total = linhas.reduce((s, l) => s + Number(l.valor_total || 0), 0);

  return (
    <Dialog open={!!ctx} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>{ctx?.titulo}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{linhas.length} lançamento(s)</Badge>
          <Badge variant="secondary">Total {formatBRL(total)}</Badge>
          <Input className="h-8 w-64 ml-auto" placeholder="Buscar SKU, produto, contexto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="overflow-auto flex-1 border rounded-md mt-2">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur text-muted-foreground">
              <tr>
                <th className="py-1.5 px-2 text-left">Data</th>
                <th className="py-1.5 px-2 text-left">SKU</th>
                <th className="py-1.5 px-2 text-left">Produto</th>
                <th className="py-1.5 px-2 text-left">Motivo</th>
                <th className="py-1.5 px-2 text-left">Contexto</th>
                <th className="py-1.5 px-2 text-left">Almox.</th>
                <th className="py-1.5 px-2 text-left">Responsável</th>
                <th className="py-1.5 px-2 text-right">Qtd</th>
                <th className="py-1.5 px-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/40">
                  <td className="py-1 px-2 whitespace-nowrap">{String(l.data_solicitacao).slice(0, 10).split("-").reverse().join("/")}</td>
                  <td className="py-1 px-2 font-mono">{l.codigo_produto}</td>
                  <td className="py-1 px-2 max-w-[280px] truncate" title={l.descricao}>{l.descricao}</td>
                  <td className="py-1 px-2">{l.motivoNome}</td>
                  <td className="py-1 px-2">{l.contexto_baixa || "—"}</td>
                  <td className="py-1 px-2">{l.id_local || "—"}</td>
                  <td className="py-1 px-2">{l.responsavel_nome || "—"}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{Number(l.quantidade).toLocaleString("pt-BR")}</td>
                  <td className="py-1 px-2 text-right tabular-nums font-semibold">{formatBRL(l.valor_total)}</td>
                </tr>
              ))}
              {!linhas.length && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function baixarHtmlInterativo(opts: {
  titulo: string;
  periodo: string;
  linhas: any[];
  kpisMotivo: { nome: string; valor: number; qtd: number }[];
  totalGeral: number;
}) {
  const dados = {
    titulo: opts.titulo,
    periodo: opts.periodo,
    geradoEm: new Date().toLocaleString("pt-BR"),
    totalGeral: opts.totalGeral,
    kpisMotivo: opts.kpisMotivo,
    linhas: opts.linhas.map((b) => ({
      data: String(b.data_solicitacao).slice(0, 10),
      sku: b.codigo_produto,
      descricao: b.descricao,
      motivo: b.motivoNome,
      contexto: b.contexto_baixa || "",
      almox: b.id_local || "",
      responsavel: b.responsavel_nome || "",
      qtd: Number(b.quantidade) || 0,
      valor: Number(b.valor_total) || 0,
    })),
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${opts.titulo}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, Segoe UI, Arial, sans-serif; background:#0b1220; color:#e2e8f0; padding:24px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:#94a3b8; font-size:13px; margin:0 0 20px; }
  .kpis { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px; }
  .kpi { flex:1; min-width:160px; background:#111c24; border:1px solid #263242; border-radius:10px; padding:12px 14px; cursor:pointer; user-select:none; transition:opacity .15s; }
  .kpi.off { opacity:.35; }
  .kpi .lbl { font-size:11px; text-transform:uppercase; color:#94a3b8; }
  .kpi .val { font-size:20px; font-weight:700; margin-top:2px; }
  .kpi .qtd { font-size:11px; color:#94a3b8; margin-top:2px; }
  .panel { background:#111c24; border:1px solid #263242; border-radius:12px; padding:16px; margin-bottom:20px; }
  .panel h2 { font-size:13px; text-transform:uppercase; color:#94a3b8; margin:0 0 12px; text-align:center; font-weight:600; }
  .bars { display:flex; align-items:flex-end; gap:16px; height:180px; padding:0 10px; }
  .bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
  .bar { width:100%; max-width:64px; border-radius:6px 6px 0 0; transition:height .2s; }
  .bar-val { font-size:11px; font-weight:600; margin-bottom:4px; }
  .bar-lbl { font-size:11px; color:#94a3b8; margin-top:6px; text-align:center; }
  .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; align-items:center; }
  input[type=text] { background:#0b1220; border:1px solid #263242; color:#e2e8f0; border-radius:8px; padding:8px 10px; font-size:13px; flex:1; min-width:200px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:6px 8px; border-bottom:1px solid #1e293b; text-align:left; }
  th { cursor:pointer; color:#94a3b8; text-transform:uppercase; font-size:10.5px; white-space:nowrap; }
  th:hover { color:#e2e8f0; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:600; }
  .muted { color:#64748b; font-size:11px; margin-top:8px; }
  .count { font-size:12px; color:#94a3b8; margin-left:auto; }
</style>
</head>
<body>
  <h1 id="tituloEl"></h1>
  <p class="sub" id="subEl"></p>

  <div class="kpis" id="kpisEl"></div>

  <div class="panel">
    <h2>Valor por motivo</h2>
    <div class="bars" id="barsEl"></div>
  </div>

  <div class="panel">
    <div class="toolbar">
      <input type="text" id="buscaEl" placeholder="Buscar SKU, produto, contexto, responsável..." />
      <span class="count" id="countEl"></span>
    </div>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th data-k="data">Data</th>
            <th data-k="sku">SKU</th>
            <th data-k="descricao">Produto</th>
            <th data-k="motivo">Motivo</th>
            <th data-k="contexto">Contexto</th>
            <th data-k="almox">Almox.</th>
            <th data-k="responsavel">Responsável</th>
            <th data-k="qtd" class="num">Qtd</th>
            <th data-k="valor" class="num">Valor</th>
          </tr>
        </thead>
        <tbody id="tbodyEl"></tbody>
      </table>
    </div>
    <p class="muted">Exportado de Investimento Operacional. Este arquivo funciona offline — clique num motivo acima ou use a busca para refiltrar os KPIs, o gráfico e a tabela abaixo.</p>
  </div>

<script id="dados" type="application/json">${JSON.stringify(dados)}</script>
<script id="paleta" type="application/json">${JSON.stringify(PALETTE)}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('dados').textContent);
  var PALETA = JSON.parse(document.getElementById('paleta').textContent);
  var ativos = {};
  D.kpisMotivo.forEach(function(k){ ativos[k.nome] = true; });
  var ordem = { k: 'data', dir: -1 };
  var busca = '';

  document.getElementById('tituloEl').textContent = D.titulo;
  document.getElementById('subEl').textContent = D.periodo + ' \u00b7 gerado em ' + D.geradoEm;

  function fmtBRL(v){
    return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function linhasFiltradas(){
    var t = busca.trim().toLowerCase();
    return D.linhas.filter(function(l){
      if (!ativos[l.motivo]) return false;
      if (!t) return true;
      return [l.sku, l.descricao, l.contexto, l.almox, l.responsavel].some(function(v){
        return String(v||'').toLowerCase().indexOf(t) >= 0;
      });
    });
  }

  function renderKpis(linhas){
    var porMotivo = {};
    D.kpisMotivo.forEach(function(k){ porMotivo[k.nome] = {valor:0, qtd:0}; });
    var total = 0;
    linhas.forEach(function(l){
      if (!porMotivo[l.motivo]) porMotivo[l.motivo] = {valor:0, qtd:0};
      porMotivo[l.motivo].valor += l.valor;
      porMotivo[l.motivo].qtd += 1;
      total += l.valor;
    });
    var html = '<div class="kpi" style="border-left:3px solid #e2e8f0"><div class="lbl">Total no período</div><div class="val">' + fmtBRL(total) + '</div></div>';
    D.kpisMotivo.forEach(function(k){
      var v = porMotivo[k.nome] || {valor:0, qtd:0};
      var cor = PALETA[k.nome] || '#4FC3F7';
      var off = ativos[k.nome] ? '' : ' off';
      html += '<div class="kpi' + off + '" data-motivo="' + k.nome + '" style="border-left:3px solid ' + cor + '">' +
        '<div class="lbl">' + k.nome + '</div>' +
        '<div class="val">' + fmtBRL(v.valor) + '</div>' +
        '<div class="qtd">' + v.qtd + ' baixa(s) \u2014 clique para filtrar</div>' +
      '</div>';
    });
    document.getElementById('kpisEl').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.kpi[data-motivo]'), function(el){
      el.addEventListener('click', function(){
        var m = el.getAttribute('data-motivo');
        ativos[m] = !ativos[m];
        renderAll();
      });
    });
    return porMotivo;
  }

  function renderBars(porMotivo){
    var max = 0;
    D.kpisMotivo.forEach(function(k){ var v=(porMotivo[k.nome]||{valor:0}).valor; if (v>max) max=v; });
    var html = '';
    D.kpisMotivo.forEach(function(k){
      var v = (porMotivo[k.nome]||{valor:0}).valor;
      var h = max > 0 ? Math.max(4, Math.round((v/max)*140)) : 4;
      var cor = PALETA[k.nome] || '#4FC3F7';
      var op = ativos[k.nome] ? '1' : '.25';
      html += '<div class="bar-col" style="opacity:' + op + '">' +
        '<div class="bar-val">' + fmtBRL(v) + '</div>' +
        '<div class="bar" style="height:' + h + 'px;background:' + cor + '"></div>' +
        '<div class="bar-lbl">' + k.nome + '</div>' +
      '</div>';
    });
    document.getElementById('barsEl').innerHTML = html;
  }

  function renderTabela(linhas){
    var copia = linhas.slice();
    copia.sort(function(a,b){
      var av = a[ordem.k], bv = b[ordem.k];
      if (ordem.k === 'qtd' || ordem.k === 'valor') { av = Number(av)||0; bv = Number(bv)||0; }
      if (av < bv) return -1 * ordem.dir;
      if (av > bv) return 1 * ordem.dir;
      return 0;
    });
    var html = '';
    copia.slice(0, 500).forEach(function(l){
      var cor = PALETA[l.motivo] || '#4FC3F7';
      var dataFmt = l.data.split('-').reverse().join('/');
      html += '<tr>' +
        '<td>' + dataFmt + '</td>' +
        '<td style="font-family:monospace">' + (l.sku||'') + '</td>' +
        '<td>' + (l.descricao||'') + '</td>' +
        '<td><span class="badge" style="background:' + cor + '22;color:' + cor + '">' + l.motivo + '</span></td>' +
        '<td>' + (l.contexto || '\u2014') + '</td>' +
        '<td>' + (l.almox || '\u2014') + '</td>' +
        '<td>' + (l.responsavel || '\u2014') + '</td>' +
        '<td class="num">' + l.qtd + '</td>' +
        '<td class="num">' + fmtBRL(l.valor) + '</td>' +
      '</tr>';
    });
    document.getElementById('tbodyEl').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:20px">Nenhum lançamento com os filtros atuais.</td></tr>';
    document.getElementById('countEl').textContent = copia.length + ' lançamento(s)' + (copia.length > 500 ? ' (mostrando 500)' : '');
  }

  function renderAll(){
    var linhas = linhasFiltradas();
    var porMotivo = renderKpis(linhas);
    renderBars(porMotivo);
    renderTabela(linhas);
  }

  document.getElementById('buscaEl').addEventListener('input', function(e){
    busca = e.target.value;
    renderAll();
  });

  Array.prototype.forEach.call(document.querySelectorAll('th[data-k]'), function(th){
    th.addEventListener('click', function(){
      var k = th.getAttribute('data-k');
      if (ordem.k === k) { ordem.dir = ordem.dir * -1; } else { ordem.k = k; ordem.dir = 1; }
      renderAll();
    });
  });

  renderAll();
})();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investimento-operacional_${opts.periodo.replace(/[^\d]/g, "-")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function InvestimentoOperacionalDashboard() {
  const [from, setFrom] = useState<string>(isoDaysAgo(90));
  const [to, setTo] = useState<string>(todayISO());
  const [lista, setLista] = useState<ListaCtx>(null);
  const [motivosAtivos, setMotivosAtivos] = useState<Set<string>>(new Set(MOTIVOS_ALVO));

  const motivosQ = useQuery({
    queryKey: ["motivos-invest-op"],
    queryFn: async () => (await supabase.from("motivo_baixa").select("id, descricao")).data ?? [],
  });

  const baixasQ = useQuery({
    queryKey: ["baixas-invest-op", from, to, motivosQ.data?.length],
    enabled: !!motivosQ.data,
    queryFn: async () => {
      const ids = (motivosQ.data ?? []).filter((m) => MOTIVOS_ALVO.includes(m.descricao)).map((m) => m.id);
      if (!ids.length) return [];
      const fromTs = new Date(from + "T00:00:00").toISOString();
      const toTs = new Date(to + "T23:59:59").toISOString();
      return fetchAll<any>((f, t) =>
        (supabase as any)
          .from("baixa_operacional")
          .select("id, codigo_produto, descricao, id_local, motivo_baixa_id, contexto_baixa, valor_total, quantidade, data_solicitacao, responsavel_nome, status_fluxo")
          .in("motivo_baixa_id", ids)
          .neq("status_fluxo", "REPROVADA")
          .gte("data_solicitacao", fromTs)
          .lte("data_solicitacao", toTs)
          .range(f, t),
      );
    },
  });

  const view = useMemo(() => {
    const motivos = motivosQ.data ?? [];
    const motivoNome = new Map(motivos.map((m) => [m.id, m.descricao]));
    const baixas = (baixasQ.data ?? [])
      .map((b) => ({ ...b, motivoNome: motivoNome.get(b.motivo_baixa_id) ?? "—" }))
      .filter((b) => motivosAtivos.has(b.motivoNome));

    const totalGeral = baixas.reduce((s, b) => s + Number(b.valor_total || 0), 0);

    const porMotivo = new Map<string, { valor: number; qtd: number }>();
    for (const nome of MOTIVOS_ALVO) porMotivo.set(nome, { valor: 0, qtd: 0 });
    baixas.forEach((b) => {
      const cur = porMotivo.get(b.motivoNome) ?? { valor: 0, qtd: 0 };
      cur.valor += Number(b.valor_total || 0);
      cur.qtd += 1;
      porMotivo.set(b.motivoNome, cur);
    });
    const kpisMotivo = MOTIVOS_ALVO.map((nome) => ({ nome, ...porMotivo.get(nome)! }));
    const barrasMotivo = kpisMotivo.map((k) => ({ nome: k.nome, valor: k.valor })).sort((a, b) => a.valor - b.valor);

    // Tendência mensal (empilhado por motivo) + total e MoM
    const mesesOrdenados = [...new Set(baixas.map((b) => String(b.data_solicitacao).slice(0, 7)))].sort();
    const tendencia = mesesOrdenados.map((mk) => {
      const row: Record<string, any> = { mes: fmtMonth(mk), total: 0 };
      MOTIVOS_ALVO.forEach((nome) => (row[nome] = 0));
      return row;
    });
    baixas.forEach((b) => {
      const idx = mesesOrdenados.indexOf(String(b.data_solicitacao).slice(0, 7));
      if (idx < 0 || !MOTIVOS_ALVO.includes(b.motivoNome)) return;
      const v = Number(b.valor_total || 0);
      tendencia[idx][b.motivoNome] += v;
      tendencia[idx].total += v;
    });
    tendencia.forEach((row, i) => {
      const ant = i > 0 ? Number(tendencia[i - 1].total) : 0;
      row.mom = i === 0 ? null : ant === 0 ? (row.total > 0 ? 100 : 0) : ((row.total - ant) / ant) * 100;
    });
    const ultimo = tendencia[tendencia.length - 1];
    const penultimo = tendencia[tendencia.length - 2];
    const momAtual = ultimo?.mom ?? null;

    // Contextos
    function contextos(motivoAlvo: string) {
      const m = new Map<string, { valor: number; qtd: number }>();
      baixas.forEach((b) => {
        if (b.motivoNome !== motivoAlvo) return;
        const chave = b.contexto_baixa || "Não informado";
        const cur = m.get(chave) ?? { valor: 0, qtd: 0 };
        cur.valor += Number(b.valor_total || 0);
        cur.qtd += 1;
        m.set(chave, cur);
      });
      return [...m.entries()].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.valor - a.valor);
    }
    const rankingAreaCortesia = contextos("Cortesia");
    const rankingOperacaoDegustacao = contextos("Degustação");

    // Tops por SKU
    function topSku(nomes: string[]) {
      const linhas = baixas.filter((b) => nomes.includes(b.motivoNome));
      const m = new Map<string, TopRow>();
      linhas.forEach((b) => {
        const cur = m.get(b.codigo_produto) ?? { codigo: b.codigo_produto, descricao: b.descricao, qtd: 0, valor: 0 };
        cur.qtd += Number(b.quantidade || 0);
        cur.valor += Number(b.valor_total || 0);
        m.set(b.codigo_produto, cur);
      });
      const rows = [...m.values()].sort((a, b) => b.valor - a.valor);
      return { rows, total: rows.reduce((s, r) => s + r.valor, 0), linhas };
    }
    const topDegustacao = topSku(["Degustação"]);
    const topCortesia = topSku(["Cortesia"]);
    const topOutros = topSku(["Sensorial/Inovações", "Uso e Consumo"]);

    const tabela = [...baixas]
      .sort((a, b) => String(b.data_solicitacao).localeCompare(String(a.data_solicitacao)))
      .slice(0, 300);

    return {
      totalGeral, kpisMotivo, barrasMotivo, tendencia, momAtual, ultimo, penultimo,
      rankingAreaCortesia, rankingOperacaoDegustacao, topDegustacao, topCortesia, topOutros, tabela,
      todasLinhas: baixas,
    };
  }, [baixasQ.data, motivosQ.data, motivosAtivos]);

  const loading = motivosQ.isLoading || baixasQ.isLoading;
  const evolucao = view.momAtual != null && view.momAtual > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Investimento Operacional</h1>
          <p className="text-sm text-muted-foreground">
            Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo — tratados como investimento operacional, não perda.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            baixarHtmlInterativo({
              titulo: "Investimento Operacional",
              periodo: `${from.split("-").reverse().join("/")} a ${to.split("-").reverse().join("/")}`,
              linhas: view.todasLinhas,
              kpisMotivo: view.kpisMotivo,
              totalGeral: view.totalGeral,
            })
          }
        >
          <Download className="size-3.5" /> Baixar HTML interativo
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {MOTIVOS_ALVO.map((nome) => {
                const ativo = motivosAtivos.has(nome);
                return (
                  <Badge
                    key={nome}
                    variant="secondary"
                    className="cursor-pointer select-none"
                    style={ativo ? { background: `${PALETTE[nome]}22`, color: PALETTE[nome], borderColor: PALETTE[nome] } : { opacity: 0.4 }}
                    onClick={() => {
                      setMotivosAtivos((prev) => {
                        const next = new Set(prev);
                        if (next.has(nome)) { if (next.size > 1) next.delete(nome); } else { next.add(nome); }
                        return next;
                      });
                    }}
                  >
                    {nome}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total investido no período</div>
            <div className="text-2xl font-bold">{formatBRL(view.totalGeral)}</div>
          </CardContent>
        </Card>
        {view.kpisMotivo.map((k) => {
          const Icon = ICONS[k.nome];
          return (
            <Card key={k.nome}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {Icon && <Icon className="size-3.5" style={{ color: PALETTE[k.nome] }} />}
                  {k.nome}
                </div>
                <div className="text-xl font-bold">{formatBRL(k.valor)}</div>
                <div className="text-xs text-muted-foreground">{k.qtd} baixa(s)</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Gráfico principal — Tendência mensal com análise MoM */}
      <BiPanel title="Tendência mensal por motivo — análise MoM" className="ring-1 ring-primary/30">
        <div className="flex flex-wrap items-center justify-center gap-3 pb-2 text-xs">
          {view.momAtual != null && (
            <Badge
              variant="secondary"
              className="gap-1"
              style={{ background: evolucao ? "#F0629222" : "#81C78422", color: evolucao ? "#F06292" : "#81C784" }}
            >
              {evolucao ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {evolucao ? "Involução" : "Evolução"} · {view.momAtual > 0 ? "+" : ""}{view.momAtual.toFixed(1)}% vs mês anterior
            </Badge>
          )}
          {view.ultimo && <span className="text-slate-300">{view.ultimo.mes}: {formatBRL(view.ultimo.total)}</span>}
          {view.penultimo && <span className="text-slate-400">{view.penultimo.mes}: {formatBRL(view.penultimo.total)}</span>}
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={view.tendencia} margin={{ top: 28, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
            <XAxis dataKey="mes" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
            <YAxis yAxisId="v" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickFormatter={fmtCompact} width={70} />
            <YAxis yAxisId="mom" orientation="right" tick={{ fill: "#FFB74D", fontSize: 11 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} width={55} />
            <Tooltip
              contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }}
              formatter={(v: number, name: string) => (name === "MoM %" ? `${Number(v).toFixed(1)}%` : formatBRL(Number(v)))}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {MOTIVOS_ALVO.map((nome, i) => (
              <Bar key={nome} yAxisId="v" dataKey={nome} stackId="a" fill={PALETTE[nome]}>
                {i === MOTIVOS_ALVO.length - 1 && (
                  <LabelList dataKey="total" position="top" formatter={(v: number) => formatBRL(v)} style={{ fill: "#e2e8f0", fontSize: 11, fontWeight: 600 }} />
                )}
              </Bar>
            ))}
            <Line yAxisId="mom" type="monotone" dataKey="mom" name="MoM %" stroke="#FFB74D" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-2 pt-2 text-[11px]">
          {view.tendencia.map((m) => (
            <span key={m.mes} className="rounded-md border border-border/40 px-2 py-0.5 text-slate-300">
              {m.mes}{" "}
              {m.mom == null ? (
                <span className="text-slate-500">—</span>
              ) : (
                <span style={{ color: m.mom > 0 ? "#F06292" : "#81C784" }}>
                  {m.mom > 0 ? "▲" : "▼"} {Math.abs(m.mom).toFixed(1)}%
                </span>
              )}
            </span>
          ))}
        </div>
      </BiPanel>

      {/* Três gráficos de apoio */}
      <div className="grid gap-3 lg:grid-cols-3">
        <BiPanel title="Valor por motivo">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={view.barrasMotivo} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickFormatter={fmtCompact} />
              <YAxis type="category" dataKey="nome" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={120} />
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }} />
              <Bar dataKey="valor" radius={[0, 6, 6, 0]} barSize={26}>
                {view.barrasMotivo.map((entry, i) => <Cell key={i} fill={PALETTE[entry.nome] ?? "#4FC3F7"} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: number) => formatBRL(v)} style={{ fill: "#e2e8f0", fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </BiPanel>

        <BiPanel title="Cortesia — Área que solicitou">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={view.rankingAreaCortesia}
                dataKey="valor"
                nameKey="chave"
                innerRadius={44}
                outerRadius={72}
                paddingAngle={2}
                isAnimationActive={false}
                label={(props: any) => {
                  const { cx, cy, midAngle, outerRadius: or, value } = props;
                  const RAD = Math.PI / 180;
                  const r = (or ?? 72) + 14;
                  const x = cx + r * Math.cos(-midAngle * RAD);
                  const y = cy + r * Math.sin(-midAngle * RAD);
                  return (
                    <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10.5} fontWeight={600} fill="#e2e8f0">
                      {formatBRL(Number(value) || 0)}
                    </text>
                  );
                }}
                labelLine={{ stroke: "#64748b" }}
              >
                {view.rankingAreaCortesia.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-border/40 pt-3 text-[11px] text-slate-300">
            {view.rankingAreaCortesia.map((item, i) => (
              <span key={item.chave} className="inline-flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                {item.chave}
              </span>
            ))}
          </div>
          {!view.rankingAreaCortesia.length && <div className="text-center text-xs text-slate-400">Nenhuma área no período.</div>}
        </BiPanel>

        <BiPanel title="Degustação — Operação">
          <ResponsiveContainer width="100%" height={230}>
            <FunnelChart margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }} />
              <Funnel dataKey="valor" data={view.rankingOperacaoDegustacao} isAnimationActive={false} lastShapeType="rectangle">
                <LabelList
                  dataKey="valor"
                  position="center"
                  style={{ fill: "#0f172a", fontSize: 11, fontWeight: 700 }}
                  formatter={(v: number) => formatBRL(Number(v) || 0)}
                />
                {view.rankingOperacaoDegustacao.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-border/40 pt-3 text-[11px] text-slate-300">
            {view.rankingOperacaoDegustacao.map((item, i) => (
              <span key={item.chave} className="inline-flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                {item.chave}
              </span>
            ))}
          </div>
          {!view.rankingOperacaoDegustacao.length && <div className="text-center text-xs text-slate-400">Nenhuma operação no período.</div>}
        </BiPanel>
      </div>

      {/* Três tabelas Top 10 */}
      <div className="grid gap-3 lg:grid-cols-3">
        <TopTable
          title="Top 10 — Degustações"
          rows={view.topDegustacao.rows}
          total={view.topDegustacao.total}
          onVerTudo={() => setLista({ titulo: "Degustações — lista completa do período", linhas: view.topDegustacao.linhas })}
        />
        <TopTable
          title="Top 10 — Cortesias"
          rows={view.topCortesia.rows}
          total={view.topCortesia.total}
          onVerTudo={() => setLista({ titulo: "Cortesias — lista completa do período", linhas: view.topCortesia.linhas })}
        />
        <TopTable
          title="Top 10 — Outros (Sensorial e Uso e Consumo)"
          rows={view.topOutros.rows}
          total={view.topOutros.total}
          onVerTudo={() => setLista({ titulo: "Sensorial e Uso e Consumo — lista completa do período", linhas: view.topOutros.linhas })}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Cortesia — Área que solicitou</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Área</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {view.rankingAreaCortesia.map((r) => (
                  <TableRow key={r.chave}>
                    <TableCell>{r.chave}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
                {!view.rankingAreaCortesia.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma baixa de Cortesia no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Degustação — Operação</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Operação</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {view.rankingOperacaoDegustacao.map((r) => (
                  <TableRow key={r.chave}>
                    <TableCell>{r.chave}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
                {!view.rankingOperacaoDegustacao.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma baixa de Degustação no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{view.tabela.length} lançamento(s) recente(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Contexto</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.tabela.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{String(b.data_solicitacao).slice(0, 10).split("-").reverse().join("/")}</TableCell>
                  <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{b.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" style={{ background: `${PALETTE[b.motivoNome]}22`, color: PALETTE[b.motivoNome] }}>{b.motivoNome}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{b.contexto_baixa || "—"}</TableCell>
                  <TableCell className="text-xs">{b.id_local || "—"}</TableCell>
                  <TableCell className="text-xs">{b.responsavel_nome || "—"}</TableCell>
                  <TableCell className="text-right">{b.quantidade}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(b.valor_total)}</TableCell>
                </TableRow>
              ))}
              {!view.tabela.length && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{loading ? "Carregando..." : "Nenhum lançamento no período."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ListaCompletaDialog ctx={lista} onOpenChange={(o) => !o && setLista(null)} />
    </div>
  );
}
