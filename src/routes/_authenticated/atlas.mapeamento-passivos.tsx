import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AtlasGrafico, atlasCores } from "@/components/atlas/AtlasGrafico";
import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIAS, carregarPassivos, evolucao, linhasExcel, motivos, opcoesFiltro, porAlmoxarifado, resumoExecutivo, topMovimentos, topSkus, type Filtro } from "@/lib/atlas-passivos";

export const Route = createFileRoute("/_authenticated/atlas/mapeamento-passivos")({
  component: MapeamentoPassivos,
  head: () => ({ meta: [{ title: "Mapeamento de Passivos — Atlas" }, { name: "description", content: "Evolução dos passivos aprovados, fluxo de inventário e motivos de baixa no Atlas." }, { property: "og:title", content: "Mapeamento de Passivos — Atlas" }, { property: "og:description", content: "Evolução dos passivos aprovados, fluxo de inventário e motivos de baixa no Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const brl = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d, minimumFractionDigits: d }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dt = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CORES = [atlasCores.blue, atlasCores.success, atlasCores.danger, atlasCores.warning, atlasCores.purple, atlasCores.cyan, atlasCores.muted];

function MapeamentoPassivos() {
  const q = useQuery({ queryKey: ["atlas-passivos"], queryFn: carregarPassivos, staleTime: 120000 });
  const [f, setF] = useState<Filtro>({ ano: null, mes: null, inicio: null, fim: null, almox: null, motivos: [] });
  const [resumoAberto, setResumoAberto] = useState(false);
  const op = useMemo(() => (q.data ? opcoesFiltro(q.data) : null), [q.data]);
  const r = useMemo(() => {
    if (!q.data) return null;
    return { res: resumoExecutivo(q.data, f), mot: motivos(q.data, f), evo: evolucao(q.data, f), almox: porAlmoxarifado(q.data, f), rec: topSkus(q.data, f, "quantidade"), imp: topSkus(q.data, f, "valor"), mov: topMovimentos(q.data, f) };
  }, [q.data, f]);

  function exportar() {
    if (!q.data || !r) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.res.texto.split("\n\n").map((l) => [l])), "Resumo");
    const L = linhasExcel(q.data, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(L.Passivos), "Passivos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(L.Inventario), "Inventário");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.mot.resumo.map((m) => ({ Motivo: m.motivo, Baixas: m.quantidade, "Valor (R$)": m.valor }))), "Por motivo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.almox.map((a) => ({ Almoxarifado: a.almox, "Passivos (R$)": a.passivos, "Resultado de inventário (R$)": a.resultado, "Acumulado (R$)": a.acumulado }))), "Por almoxarifado");
    XLSX.writeFile(wb, `mapeamento_passivos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  const alternaMotivo = (m: string) => setF({ ...f, motivos: f.motivos.includes(m) ? f.motivos.filter((x) => x !== m) : [...f.motivos, m] });
  const limpo = !f.ano && !f.mes && !f.inicio && !f.fim && !f.almox && !f.motivos.length;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><AlertTriangle className="size-6" /> Mapeamento de Passivos</h1>
          <p className="max-w-4xl text-sm text-muted-foreground"><strong>Passivos</strong> = baixas aprovadas no Relatório de Baixa. <strong>Resultado de Inventário</strong> = ajustes oficiais de inventário (Entradas − Saídas). Os dois lado a lado mostram quanto da perda física medida no inventário já está explicada por baixa aprovada.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" disabled={!r} onClick={exportar}><Download className="size-4" /> Exportar Excel</Button>
      </div>

      {op && (
        <Card><CardContent className="flex flex-wrap items-center gap-2 pt-4">
          <Select value={f.ano ? String(f.ano) : "todos"} onValueChange={(v) => setF({ ...f, ano: v === "todos" ? null : Number(v) })}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todo ano</SelectItem>{op.anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent></Select>
          <Select value={f.mes ? String(f.mes) : "todos"} onValueChange={(v) => setF({ ...f, mes: v === "todos" ? null : Number(v) })}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todo mês</SelectItem>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select>
          <Input type="date" className="h-8 w-36" value={f.inicio ?? ""} onChange={(e) => setF({ ...f, inicio: e.target.value || null })} title="De" />
          <Input type="date" className="h-8 w-36" value={f.fim ?? ""} onChange={(e) => setF({ ...f, fim: e.target.value || null })} title="Até" />
          <Select value={f.almox ?? "todos"} onValueChange={(v) => setF({ ...f, almox: v === "todos" ? null : v })}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{op.almox.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
          <div className="flex flex-wrap gap-1">{op.motivos.map((m) => <button key={m} type="button" onClick={() => alternaMotivo(m)} className={`rounded-full border px-2 py-0.5 text-xs ${f.motivos.includes(m) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{m}</button>)}</div>
          {!limpo && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setF({ ano: null, mes: null, inicio: null, fim: null, almox: null, motivos: [] })}>limpar filtros</button>}
        </CardContent></Card>
      )}

      {q.isLoading || !r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando baixas e ajustes…</div> : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="cursor-pointer transition hover:bg-muted/40" onDoubleClick={() => setResumoAberto(true)} title="Duplo clique: resumo executivo">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Passivos (baixas aprovadas)</div>
                <div className="mt-1 text-3xl font-semibold">{brl(r.res.passivos.valor)}</div>
                <div className="text-xs text-muted-foreground">{un(r.res.passivos.quantidade)} baixa(s) aprovada(s) de {un(r.res.passivos.total_no_filtro)} no recorte</div>
                <div className="mt-3 space-y-1 text-xs">
                  {(["inventario_mensal", "movimentacao_diaria", "aguardando_divergencia"] as const).map((k) => <div key={k} className="flex justify-between"><span>{CATEGORIAS[k]}</span><span>{un(r.res.passivos.por_categoria[k].quantidade)} · {brl(r.res.passivos.por_categoria[k].valor)}</span></div>)}
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer transition hover:bg-muted/40" onDoubleClick={() => setResumoAberto(true)} title="Duplo clique: resumo executivo">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Resultado de Inventário acumulado</div>
                <div className={`mt-1 text-3xl font-semibold ${r.res.inventario.resultado_valor < 0 ? "text-destructive" : "text-emerald-700"}`}>{brl(r.res.inventario.resultado_valor)}</div>
                <div className="text-xs text-muted-foreground">Entradas {brl(r.res.inventario.entradas_valor)} ({un(r.res.inventario.entradas_qtd)}) − Saídas {brl(r.res.inventario.saidas_valor)} ({un(r.res.inventario.saidas_qtd)})</div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span>Divergências resolvidas como ajuste de processo</span><span>{un(r.res.divergencias.ajuste_processo.quantidade)} · {brl(r.res.divergencias.ajuste_processo.valor)}</span></div>
                  <div className="flex justify-between"><span>Divergências resolvidas como perda real</span><span>{un(r.res.divergencias.perda_real.quantidade)} · {brl(r.res.divergencias.perda_real.valor)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setResumoAberto(true)}><FileText className="size-4" /> Resumo executivo</Button>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Evolução mensal de passivos e inventário</CardTitle></CardHeader>
              <CardContent className="h-72"><AtlasGrafico data={r.evo.map((m, i, all) => ({ ...m, inventarioAbs: Math.abs(m.resultado), acumulado: all.slice(0, i + 1).reduce((total, x) => total + x.valor + Math.abs(x.resultado), 0) }))} category="rotulo" money series={[{key: "inventarioAbs", name: "Resultado do Fluxo de Inventário (valor absoluto)", color: atlasCores.blue, stack: "total", money: true, labels: false},{key: "valor", name: "Passivos do mês (R$)", color: atlasCores.danger, stack: "total", money: true, labels: false},{key: "acumulado", name: "Curva de evolução (valor acumulado)", color: atlasCores.warning, line: true, money: true}]} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Fluxo de inventário (Entradas × Saídas)</CardTitle></CardHeader>
              <CardContent className="h-72"><AtlasGrafico data={r.evo.filter((m) => m.entradas || m.saidas).map((m) => ({ ...m, saidas: Math.abs(m.saidas) }))} category="rotulo" money series={[{key: "entradas", name: "Entradas (R$)", color: atlasCores.success, money: true, labels: false},{key: "saidas", name: "Saídas (R$)", color: atlasCores.danger, money: true, labels: false},{key: "resultado", name: "Resultado do Mês", color: atlasCores.blue, line: true, money: true}]} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Motivos de baixa por mês (sem as baixas via inventário)</CardTitle></CardHeader>
              <CardContent className="h-72"><AtlasGrafico data={r.mot.serie.map((x) => ({ ...x, rotulo: `${String(x.mes).slice(5)}/${String(x.mes).slice(2, 4)}` }))} category="rotulo" horizontal money height={260} series={r.mot.chaves.map((k, i) => ({ key: k, name: k, color: CORES[i % CORES.length], stack: "motivos", money: true, labels: false }))} />{r.mot.agrupados.length > 0 && <p className="text-[11px] text-muted-foreground">Outros: {r.mot.agrupados.join(", ")}</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Resumo por motivo</CardTitle></CardHeader>
              <CardContent><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">Motivo</th><th className="p-1 text-right">Baixas</th><th className="p-1 text-right">Valor</th></tr></thead><tbody>{r.mot.resumo.map((m) => <tr key={m.motivo} className="border-t"><td className="p-1">{m.motivo}</td><td className="p-1 text-right">{un(m.quantidade)}</td><td className="p-1 text-right">{brl(m.valor)}</td></tr>)}</tbody></table></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Onde estão as maiores perdas (passivos + resultado de inventário)</CardTitle></CardHeader>
            <CardContent style={{ height: Math.max(180, r.almox.length * 34 + 40) }}><AtlasGrafico data={r.almox} category="almox" horizontal money height={Math.max(260, r.almox.length * 34)} series={[{key: "passivos", name: "Passivos (R$)", color: atlasCores.danger, stack: "total", money: true, labels: false},{key: "inventarioAbs", name: "Resultado de Inventário (valor absoluto, R$)", color: atlasCores.blue, stack: "total", money: true, labels: false}]} /></CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["SKUs com mais baixas (recorrência)", r.rec], ["SKUs com maior valor baixado", r.imp]] as const).map(([titulo, lista]) => (
              <Card key={titulo}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
                <CardContent><table className="w-full text-xs"><tbody>{lista.map((s) => <tr key={s.sku} className="border-b last:border-0"><td className="p-1 font-mono">{s.sku}</td><td className="max-w-[220px] truncate p-1 text-muted-foreground">{s.descricao ?? ""}</td><td className="p-1 text-right">{un(s.quantidade)}×</td><td className="p-1 text-right">{brl(s.valor)}</td></tr>)}</tbody></table></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">10 maiores movimentações do recorte</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1">Tipo</th><th className="p-1">Data</th><th className="p-1">SKU / Produto</th><th className="p-1">Almox.</th><th className="p-1">Detalhe</th><th className="p-1 text-right">Qtd</th><th className="p-1 text-right">Valor</th></tr></thead>
              <tbody>{r.mov.map((m, i) => <tr key={i} className="border-b last:border-0"><td className="p-1">{m.tipo}</td><td className="p-1">{dt(m.data)}</td><td className="p-1"><span className="font-mono">{m.sku}</span> <span className="text-muted-foreground">{m.descricao ?? ""}</span></td><td className="p-1">{m.almox}</td><td className="p-1">{m.detalhe}</td><td className="p-1 text-right">{un(m.quantidade, 3)}</td><td className={`p-1 text-right ${m.comSinal < 0 ? "text-destructive" : "text-emerald-700"}`}>{brl(m.comSinal, 2)}</td></tr>)}</tbody>
            </table></CardContent>
          </Card>

          <Dialog open={resumoAberto} onOpenChange={setResumoAberto}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Resumo executivo</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm leading-relaxed">{r.res.texto.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
