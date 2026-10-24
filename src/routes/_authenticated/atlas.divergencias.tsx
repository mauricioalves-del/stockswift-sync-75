import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COLS_DIV, avisoBaixaPendente, carregarBase, investigarEGravar, investigarLote, logAtlas, normDiv, resolverDivergencia, type Base, type Div } from "@/lib/atlas-investigacao";

export const Route = createFileRoute("/_authenticated/atlas/divergencias")({
  component: AtlasDivergencias,
  head: () => ({ meta: [{ title: "Divergências — Atlas" }] }),
});

const sb = supabase as any;
const POR_PAGINA = 50;
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dt = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const STATUS: Record<string, { rot: string; cls: string }> = {
  Aberta: { rot: "Aberta", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  Em_Investigacao: { rot: "Em investigação", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
  Resolvida: { rot: "Resolvida", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
};

async function usuarioAtual(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = u.user ? await sb.from("profiles").select("nome, email").eq("id", u.user.id).maybeSingle() : { data: null };
  return p?.nome || p?.email || u.user?.email || "Stock Savvy";
}

function AtlasDivergencias() {
  const { role } = useRole();
  const pode = role === "ADMINISTRADOR" || role === "GERENTE";
  const qc = useQueryClient();
  const [f, setF] = useState({ almox: "todos", status: "abertas", hip: "todas", busca: "", recorrentes: false, fechamento: false });
  const [ordem, setOrdem] = useState<{ col: "data_deteccao" | "valor_estimado" | "confianca_ia" | "id"; asc: boolean }>({ col: "data_deteccao", asc: false });
  const [pag, setPag] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
  const [lote, setLote] = useState(false);
  const [rodando, setRodando] = useState<string | null>(null);
  useEffect(() => { setPag(0); setSel(new Set()); }, [f, ordem]);

  const auxQ = useQuery({
    queryKey: ["atlas-div-aux"],
    queryFn: async () => {
      const [a, h, p] = await Promise.all([
        sb.from("atlas_almoxarifados").select("codigo, nome_exibicao").order("codigo"),
        sb.from("atlas_hipoteses").select("codigo, nome, ativo").order("nome"),
        sb.from("atlas_produtos").select("sku, descricao").limit(5000),
      ]);
      return { almox: a.data ?? [], hip: (h.data ?? []) as { codigo: string; nome: string; ativo: boolean }[], desc: new Map<string, string>((p.data ?? []).map((x: any) => [x.sku, x.descricao])) };
    },
    staleTime: 300000,
  });
  const nomeHip = (c: string | null | undefined) => (c ? auxQ.data?.hip.find((h) => h.codigo === c)?.nome ?? c : "—");

  const listaQ = useQuery({
    queryKey: ["atlas-divergencias", f, ordem, pag],
    queryFn: async () => {
      let skusRec: string[] | null = null;
      if (f.recorrentes) {
        const cont = new Map<string, number>();
        for (let de = 0; ; de += 1000) {
          let q = sb.from("atlas_divergencias").select("sku").range(de, de + 999);
          if (!f.fechamento) q = q.neq("origem", "fechamento_inventario");
          const { data } = await q; for (const x of data ?? []) cont.set(x.sku, (cont.get(x.sku) ?? 0) + 1);
          if (!data || data.length < 1000) break;
        }
        skusRec = [...cont].filter(([, n]) => n > 1).map(([s]) => s);
      }
      let q = sb.from("atlas_divergencias").select("id, sku, almoxarifado, categoria_produto, data_deteccao, divergencia_qtd, valor_estimado, status, hipotese_ia, confianca_ia, hipotese_confirmada, hipotese_regras, origem, observacao_investigacao", { count: "exact" });
      if (!f.fechamento) q = q.or("origem.is.null,origem.neq.fechamento_inventario");
      if (f.almox !== "todos") q = q.eq("almoxarifado", f.almox);
      if (f.status === "abertas") q = q.neq("status", "Resolvida"); else if (f.status !== "todos") q = q.eq("status", f.status);
      if (f.hip === "sem") q = q.is("hipotese_regras", null); else if (f.hip !== "todas") q = q.eq("hipotese_ia", f.hip);
      const b = f.busca.trim();
      if (b) {
        const porDesc = [...(auxQ.data?.desc ?? new Map()).entries()].filter(([, d]) => d?.toLowerCase().includes(b.toLowerCase())).map(([s]) => s).slice(0, 200);
        q = q.or([`sku.ilike.%${b.replace(/[,()]/g, " ")}%`, ...(porDesc.length ? [`sku.in.(${porDesc.map((s) => `"${s}"`).join(",")})`] : [])].join(","));
      }
      if (skusRec) q = q.in("sku", skusRec.length ? skusRec : ["__nenhum__"]);
      q = q.order(ordem.col, { ascending: ordem.asc, nullsFirst: false }).range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      // ícone de atenção: o mesmo SKU tem outro caso Em investigação
      const skus = [...new Set((data ?? []).map((x: any) => x.sku))];
      const emInv = skus.length ? (await sb.from("atlas_divergencias").select("id, sku").eq("status", "Em_Investigacao").in("sku", skus)).data ?? [] : [];
      return { itens: (data ?? []) as any[], total: count ?? 0, emInv: emInv as { id: number; sku: string }[] };
    },
    enabled: !!auxQ.data,
  });
  const itens = listaQ.data?.itens ?? [];
  const total = listaQ.data?.total ?? 0;
  const pendenteInv = (x: any) => (listaQ.data?.emInv ?? []).some((e) => e.sku === x.sku && e.id !== x.id);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["atlas-divergencias"] }); qc.invalidateQueries({ queryKey: ["atlas-div-detalhe"] }); };

  async function investigarPendentes() {
    const { count } = await sb.from("atlas_divergencias").select("id", { count: "exact", head: true }).is("hipotese_regras", null);
    if (!count) { toast.info("Nenhuma divergência sem diagnóstico."); return; }
    if (!confirm(`Investigar ${count} divergência(s) que ainda não têm diagnóstico (inclui as importadas no Stock Savvy)?`)) return;
    setRodando("inv");
    try {
      const r = await investigarLote((q) => q.is("hipotese_regras", null), await usuarioAtual(), (a, t) => setRodando(`inv:${a}/${t}`));
      toast.success(`${r.ok} investigada(s)${r.porBaixa ? `, ${r.porBaixa} resolvida(s) por baixa aprovada` : ""}${r.erros.length ? ` · ${r.erros.length} com erro` : ""}.`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setRodando(null); recarregar();
  }
  async function recalcularValores() {
    setRodando("val");
    try {
      const custos = new Map<string, number>();
      for (let de = 0; ; de += 1000) { const { data } = await sb.from("atlas_produtos").select("sku, custo_unitario").not("custo_unitario", "is", null).range(de, de + 999); for (const x of data ?? []) custos.set(x.sku, Number(x.custo_unitario)); if (!data || data.length < 1000) break; }
      let verif = 0, atual = 0;
      for (let de = 0; ; de += 1000) {
        const { data } = await sb.from("atlas_divergencias").select("id, sku, divergencia_qtd, valor_estimado").neq("status", "Resolvida").order("id").range(de, de + 999);
        for (const d of data ?? []) { verif++; const c = custos.get(d.sku); if (c == null) continue; const v = Math.round(Math.abs(Number(d.divergencia_qtd)) * c * 100) / 100; if (v !== Number(d.valor_estimado)) { await sb.from("atlas_divergencias").update({ valor_estimado: v }).eq("id", d.id); atual++; } }
        if (!data || data.length < 1000) break;
      }
      await logAtlas(await usuarioAtual(), "recalcular_valores", { atualizadas: atual, verificadas: verif });
      toast.success(`${atual} de ${verif} divergência(s) com valor atualizado pelo custo do cadastro.`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setRodando(null); recarregar();
  }

  const Ord = ({ col, children }: { col: typeof ordem.col; children: React.ReactNode }) => (
    <button type="button" className="inline-flex items-center gap-0.5 hover:text-foreground" onClick={() => setOrdem(ordem.col === col ? { col, asc: !ordem.asc } : { col, asc: false })}>{children}{ordem.col === col ? (ordem.asc ? " ↑" : " ↓") : ""}</button>
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ListChecks className="size-6" /> Divergências</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">Cada divergência é investigada pelo motor do Atlas: observação da planilha, baixas do Relatório de Baixa (aprovada resolve sozinha), transferência pendente, pedido de compra, OP aberta, consumo × ficha técnica, faturamento próximo e reincidência. Confirmar a causa ensina o motor (ajusta o peso da hipótese).</p>
        </div>
        {pode && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={!!rodando} onClick={investigarPendentes}>{rodando?.startsWith("inv") ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{rodando?.startsWith("inv:") ? `Investigando ${rodando.slice(4)}` : "Investigar pendentes"}</Button>
            <Button variant="outline" size="sm" className="gap-1" disabled={!!rodando} onClick={recalcularValores}>{rodando === "val" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Recalcular valores</Button>
          </div>
        )}
      </div>

      <Card><CardContent className="flex flex-wrap items-center gap-2 pt-4">
        <div className="relative"><Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" /><Input className="h-8 w-56 pl-8" placeholder="SKU ou descrição" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} /></div>
        <Select value={f.almox} onValueChange={(v) => setF({ ...f, almox: v })}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{(auxQ.data?.almox ?? []).map((a: any) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome_exibicao || a.codigo}</SelectItem>)}</SelectContent></Select>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="abertas">Não resolvidas</SelectItem><SelectItem value="Aberta">Abertas</SelectItem><SelectItem value="Em_Investigacao">Em investigação</SelectItem><SelectItem value="Resolvida">Resolvidas</SelectItem><SelectItem value="todos">Todas</SelectItem></SelectContent></Select>
        <Select value={f.hip} onValueChange={(v) => setF({ ...f, hip: v })}><SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as hipóteses</SelectItem><SelectItem value="sem">Sem diagnóstico</SelectItem>{(auxQ.data?.hip ?? []).map((h) => <SelectItem key={h.codigo} value={h.codigo}>{h.nome || h.codigo}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.recorrentes} onChange={(e) => setF({ ...f, recorrentes: e.target.checked })} /> Só SKUs recorrentes</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.fechamento} onChange={(e) => setF({ ...f, fechamento: e.target.checked })} /> Incluir as de fechamento de inventário</label>
        {pode && sel.size > 0 && <Button size="sm" className="ml-auto gap-1" onClick={() => setLote(true)}><CheckCircle2 className="size-4" /> Resolver {sel.size} selecionada(s)</Button>}
      </CardContent></Card>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground">
            {pode && <th className="w-8 p-2"><input type="checkbox" checked={itens.length > 0 && itens.every((x) => sel.has(x.id))} onChange={(e) => setSel(e.target.checked ? new Set(itens.filter((x) => x.status !== "Resolvida").map((x) => x.id)) : new Set())} /></th>}
            <th className="p-2"><Ord col="id">#</Ord></th><th className="p-2"><Ord col="data_deteccao">Data</Ord></th><th className="p-2">SKU / Produto</th><th className="p-2">Almox.</th>
            <th className="p-2 text-right">Diverg.</th><th className="p-2 text-right"><Ord col="valor_estimado">Valor</Ord></th><th className="p-2">Hipótese</th><th className="p-2 text-right"><Ord col="confianca_ia">Confiança</Ord></th><th className="p-2">Status</th>
          </tr></thead>
          <tbody>
            {listaQ.isLoading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>}
            {itens.map((x) => (
              <tr key={x.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setAberta(x.id)}>
                {pode && <td className="p-2" onClick={(e) => e.stopPropagation()}>{x.status !== "Resolvida" && <input type="checkbox" checked={sel.has(x.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(x.id); else s.delete(x.id); setSel(s); }} />}</td>}
                <td className="p-2 text-xs">{x.id}</td>
                <td className="p-2 whitespace-nowrap text-xs">{dt(x.data_deteccao)}</td>
                <td className="p-2"><div className="font-mono text-xs">{x.sku} {pendenteInv(x) && <AlertTriangle className="inline size-3.5 text-amber-600" aria-label="Há outro caso deste SKU em investigação" />}</div><div className="max-w-[280px] truncate text-xs text-muted-foreground">{auxQ.data?.desc.get(x.sku) ?? x.categoria_produto ?? ""}</div></td>
                <td className="p-2 text-xs">{x.almoxarifado}</td>
                <td className={`p-2 text-right text-xs ${Number(x.divergencia_qtd) < 0 ? "text-destructive" : "text-emerald-700"}`}>{un(x.divergencia_qtd, 3)}</td>
                <td className="p-2 text-right text-xs">{brl(x.valor_estimado)}</td>
                <td className="p-2 text-xs">{x.hipotese_confirmada ? <span className="font-medium">{nomeHip(x.hipotese_confirmada)}</span> : x.hipotese_regras ? nomeHip(x.hipotese_ia) : <span className="text-muted-foreground">investigação pendente</span>}</td>
                <td className="p-2 text-right text-xs">{x.hipotese_confirmada ? "✓" : x.confianca_ia != null ? `${un(x.confianca_ia, 1)}%` : "—"}</td>
                <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS[x.status]?.cls ?? "bg-muted"}`}>{STATUS[x.status]?.rot ?? x.status}</span></td>
              </tr>
            ))}
            {!listaQ.isLoading && !itens.length && <tr><td colSpan={10} className="p-6 text-center text-xs text-muted-foreground">Nenhuma divergência com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{un(total)} divergência(s)</span>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</button>
        <span>página {pag + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={(pag + 1) * POR_PAGINA >= total} onClick={() => setPag(pag + 1)}>Próxima</button>
      </div>

      {aberta != null && <Detalhe id={aberta} pode={pode} hipoteses={auxQ.data?.hip ?? []} nomeHip={nomeHip} desc={auxQ.data?.desc} onClose={() => setAberta(null)} onMudou={recarregar} />}
      {lote && <ResolverLote ids={[...sel]} hipoteses={auxQ.data?.hip ?? []} onClose={() => setLote(false)} onOk={() => { setLote(false); setSel(new Set()); recarregar(); }} />}
    </div>
  );
}

function Detalhe({ id, pode, hipoteses, nomeHip, desc, onClose, onMudou }: { id: number; pode: boolean; hipoteses: { codigo: string; nome: string; ativo: boolean }[]; nomeHip: (c?: string | null) => string; desc?: Map<string, string>; onClose: () => void; onMudou: () => void }) {
  const q = useQuery({
    queryKey: ["atlas-div-detalhe", id],
    queryFn: async () => {
      const { data, error } = await sb.from("atlas_divergencias").select("*").eq("id", id).single();
      if (error) throw error;
      const [h1, h2] = await Promise.all([
        sb.from("atlas_movimentacoes_historico").select("data_movimento, almoxarifado, divergencia, saldo_sistema, hipotese_confirmada, origem").eq("sku", data.sku).order("data_movimento", { ascending: false }).limit(40),
        sb.from("atlas_divergencias").select("id, data_deteccao, almoxarifado, divergencia_qtd, status, hipotese_confirmada, hipotese_ia, origem").eq("sku", data.sku).order("data_deteccao", { ascending: false }).limit(40),
      ]);
      const linha = [...(h1.data ?? []).map((h: any) => ({ data: h.data_movimento, almox: h.almoxarifado, qtd: h.divergencia, status: "Resolvido", hip: h.hipotese_confirmada, origem: h.origem })), ...(h2.data ?? []).map((d: any) => ({ data: d.data_deteccao, almox: d.almoxarifado, qtd: d.divergencia_qtd, status: d.status, hip: d.hipotese_confirmada || d.hipotese_ia, origem: d.origem, id: d.id }))]
        .sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 40);
      return { d: data, linha };
    },
  });
  const baseQ = useQuery({ queryKey: ["atlas-base-investigacao"], queryFn: carregarBase, staleTime: 120000 });
  const d = q.data?.d;
  const aviso = d && baseQ.data ? avisoBaixaPendente(baseQ.data, normDiv(d)) : null;
  const [conf, setConf] = useState({ hip: "", solucao: "", responsavel: "", tempo: "" });
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  useEffect(() => { if (d) setConf((c) => ({ ...c, hip: c.hip || d.hipotese_confirmada || d.hipotese_ia || "" })); }, [d]);

  async function reinvestigar() {
    setOcupado("re");
    try {
      const base = baseQ.data ?? await carregarBase(); const u = await usuarioAtual();
      const { data } = await sb.from("atlas_divergencias").select(COLS_DIV).eq("id", id).single();
      const r = await investigarEGravar(base, normDiv(data), u);
      await logAtlas(u, "reinvestigar_divergencia", { nova_hipotese_ia: r.hipotese, confianca_ia: r.confianca }, id);
      toast.success(r.resolvidaPorBaixa ? "Resolvida automaticamente por baixa aprovada." : `Hipótese: ${nomeHip(r.hipotese)} (${r.confianca ?? 0}%).`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(null); onMudou();
  }
  async function marcarInvestigacao() {
    setOcupado("inv");
    try {
      const u = await usuarioAtual(); const o = obs.trim();
      const patch: Record<string, unknown> = { status: "Em_Investigacao" };
      if (o) Object.assign(patch, { observacao_investigacao: o, observacao_investigacao_por: u, observacao_investigacao_em: new Date().toISOString() });
      const { error } = await sb.from("atlas_divergencias").update(patch).eq("id", id); if (error) throw error;
      await logAtlas(u, "marcar_em_investigacao", o ? { observacao: o } : {}, id);
      toast.success("Marcada como em investigação."); setObs("");
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(null); onMudou();
  }
  async function confirmar() {
    if (!conf.hip) { toast.error("Escolha a hipótese confirmada."); return; }
    setOcupado("ok");
    try {
      const base = baseQ.data ?? await carregarBase(); const u = await usuarioAtual();
      await resolverDivergencia(base, normDiv(d), conf.hip, conf.solucao.trim() || null, conf.responsavel.trim() || u, conf.tempo ? Number(conf.tempo) : null, u);
      await logAtlas(u, "confirmar_divergencia", { hipotese_confirmada: conf.hip, solucao: conf.solucao }, id);
      toast.success("Divergência resolvida."); onMudou(); onClose();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(null);
  }

  const dist: { hipotese: string; confianca: number }[] = !d?.distribuicao_probabilidades ? [] : Array.isArray(d.distribuicao_probabilidades) ? d.distribuicao_probabilidades : Object.entries(d.distribuicao_probabilidades).map(([hipotese, confianca]) => ({ hipotese, confianca: Number(confianca) }));
  const evid: any[] = Array.isArray(d?.evidencias) ? d.evidencias : [];
  const casos: any[] = Array.isArray(d?.casos_similares) ? d.casos_similares : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Divergência #{id}{d ? ` · ${d.sku}` : ""}</DialogTitle></DialogHeader>
        {!d ? <Loader2 className="mx-auto size-5 animate-spin" /> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Produto</div>{desc?.get(d.sku) ?? "—"}</div>
              <div><div className="text-xs text-muted-foreground">Almoxarifado</div>{d.almoxarifado}</div>
              <div><div className="text-xs text-muted-foreground">Data</div>{dt(d.data_deteccao)}</div>
              <div><div className="text-xs text-muted-foreground">Status</div><span className={`rounded px-1.5 text-[11px] ${STATUS[d.status]?.cls}`}>{STATUS[d.status]?.rot ?? d.status}</span></div>
              <div><div className="text-xs text-muted-foreground">Sistema × contagem</div>{un(d.saldo_sistema, 3)} × {un(d.saldo_fisico, 3)}</div>
              <div><div className="text-xs text-muted-foreground">Divergência</div><span className={Number(d.divergencia_qtd) < 0 ? "text-destructive" : "text-emerald-700"}>{un(d.divergencia_qtd, 3)}</span></div>
              <div><div className="text-xs text-muted-foreground">Valor estimado</div>{brl(d.valor_estimado)}</div>
              <div><div className="text-xs text-muted-foreground">Categoria</div>{d.categoria_produto ?? "—"}</div>
            </div>
            {d.observacao_origem && <div className="rounded-md bg-muted px-3 py-2 text-xs"><span className="font-medium">Obs. da planilha:</span> {d.observacao_origem}</div>}
            {d.observacao_investigacao && <div className="rounded-md bg-sky-50 px-3 py-2 text-xs dark:bg-sky-950/30"><span className="font-medium">Em investigação:</span> {d.observacao_investigacao} <span className="text-muted-foreground">— {d.observacao_investigacao_por}, {dt(d.observacao_investigacao_em)}</span></div>}
            {aviso && <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><Clock className="mt-0.5 size-4 shrink-0" />{aviso}</div>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Diagnóstico</div>
                {d.hipotese_confirmada ? <div><span className="font-semibold">{nomeHip(d.hipotese_confirmada)}</span> <span className="text-xs text-muted-foreground">confirmada por {d.responsavel ?? "—"} em {dt(d.resolvido_em)}</span>{d.solucao_aplicada && <div className="text-xs">{d.solucao_aplicada}</div>}</div>
                  : d.hipotese_regras ? <div><span className="font-semibold">{nomeHip(d.hipotese_ia)}</span> <span className="text-xs text-muted-foreground">{un(d.confianca_ia, 1)}% · regras: {nomeHip(d.hipotese_regras)} {un(d.confianca_regras, 1)}%{d.hipotese_ml ? ` · modelo: ${nomeHip(d.hipotese_ml)} ${un(d.confianca_ml, 1)}%` : ""}</span></div>
                  : <div className="text-muted-foreground">Investigação pendente — clique em Reinvestigar.</div>}
                {dist.slice(0, 6).map((x) => (
                  <div key={x.hipotese} className="text-xs"><div className="flex justify-between"><span>{nomeHip(x.hipotese)}</span><span>{un(x.confianca, 1)}%</span></div><div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, x.confianca)}%` }} /></div></div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase text-muted-foreground">Evidências verificadas</div>
                {evid.map((e, i) => (
                  <div key={i} className={`flex items-start justify-between gap-2 text-xs ${e.encontrado ? "" : "text-muted-foreground"}`}>
                    <span>{e.encontrado ? "●" : "○"} {String(e.verificacao).replace(/_/g, " ")} <span className="text-muted-foreground">→ {nomeHip(e.hipotese)}</span></span>
                    {e.encontrado && <span className="shrink-0">+{un(e.peso_aplicado, 1)}</span>}
                  </div>
                ))}
                {!evid.length && <div className="text-xs text-muted-foreground">—</div>}
              </div>
            </div>

            {casos.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Casos similares já resolvidos</div>
                <div className="overflow-x-auto rounded-md border"><table className="w-full text-xs"><tbody>
                  {casos.map((c, i) => <tr key={i} className="border-b last:border-0"><td className="p-1.5">{dt(c.data)}</td><td className="p-1.5 font-mono">{c.sku}</td><td className="p-1.5 max-w-[220px] truncate">{c.descricao_produto ?? ""}</td><td className="p-1.5">{c.almoxarifado}</td><td className="p-1.5 text-right">{un(c.divergencia_qtd, 3)}</td><td className="p-1.5 font-medium">{nomeHip(c.hipotese_confirmada)}</td><td className="p-1.5 text-muted-foreground">{c.criterio === "mesmo_sku" ? "mesmo SKU" : "mesma categoria e almox."}</td></tr>)}
                </tbody></table></div>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Linha do tempo do SKU</div>
              <div className="max-h-48 overflow-y-auto rounded-md border"><table className="w-full text-xs"><tbody>
                {(q.data?.linha ?? []).map((p: any, i: number) => <tr key={i} className={`border-b last:border-0 ${p.id === id ? "bg-primary/5 font-medium" : ""}`}><td className="p-1.5">{dt(p.data)}</td><td className="p-1.5">{p.almox}</td><td className={`p-1.5 text-right ${Number(p.qtd) < 0 ? "text-destructive" : ""}`}>{un(p.qtd, 3)}</td><td className="p-1.5">{p.status === "Resolvido" ? "Resolvido" : STATUS[p.status]?.rot ?? p.status}</td><td className="p-1.5">{p.hip ? nomeHip(p.hip) : "—"}</td><td className="p-1.5 text-muted-foreground">{p.origem === "fechamento_inventario" ? "inventário" : "movimentação"}</td></tr>)}
              </tbody></table></div>
            </div>

            {pode && d.status !== "Resolvida" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_100px]">
                  <div><Label className="text-xs">Hipótese confirmada</Label>
                    <Select value={conf.hip} onValueChange={(v) => setConf({ ...conf, hip: v })}><SelectTrigger className="h-8"><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{hipoteses.filter((h) => h.ativo !== false).map((h) => <SelectItem key={h.codigo} value={h.codigo}>{h.nome || h.codigo}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">Solução aplicada</Label><Input className="h-8" value={conf.solucao} onChange={(e) => setConf({ ...conf, solucao: e.target.value })} /></div>
                  <div><Label className="text-xs">Responsável</Label><Input className="h-8" value={conf.responsavel} onChange={(e) => setConf({ ...conf, responsavel: e.target.value })} placeholder="você" /></div>
                  <div><Label className="text-xs">Tempo (min)</Label><Input className="h-8" inputMode="numeric" value={conf.tempo} onChange={(e) => setConf({ ...conf, tempo: e.target.value.replace(/\D/g, "") })} /></div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Textarea rows={1} className="min-h-8 flex-1 text-xs" placeholder="Observação ao deixar em investigação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={!!ocupado} onClick={marcarInvestigacao}>{ocupado === "inv" && <Loader2 className="size-4 animate-spin" />}Em investigação</Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={!!ocupado || baseQ.isLoading} onClick={reinvestigar}>{ocupado === "re" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Reinvestigar</Button>
                  <Button size="sm" className="gap-1" disabled={!!ocupado} onClick={confirmar}>{ocupado === "ok" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Confirmar e resolver</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResolverLote({ ids, hipoteses, onClose, onOk }: { ids: number[]; hipoteses: { codigo: string; nome: string; ativo: boolean }[]; onClose: () => void; onOk: () => void }) {
  const [hip, setHip] = useState("propria"); const [solucao, setSolucao] = useState(""); const [resp, setResp] = useState(""); const [ocupado, setOcupado] = useState(false);
  const validas = useMemo(() => new Set(hipoteses.map((h) => h.codigo)), [hipoteses]);
  async function ok() {
    setOcupado(true);
    try {
      const base = await carregarBase(); const u = await usuarioAtual();
      const { data } = await sb.from("atlas_divergencias").select(COLS_DIV + ", hipotese_ia").in("id", ids);
      let resolvidas = 0, ja = 0, sem = 0;
      for (const x of data ?? []) {
        if (x.status === "Resolvida") { ja++; continue; }
        const cod = hip !== "propria" ? hip : x.hipotese_confirmada || x.hipotese_ia;
        if (!cod || !validas.has(cod)) { sem++; continue; }
        await resolverDivergencia(base, normDiv(x), cod, solucao.trim() || null, resp.trim() || u, null, u); resolvidas++;
      }
      await logAtlas(u, "resolver_divergencias_lote", { total_solicitado: ids.length, resolvidas, ja_resolvidas: ja, sem_hipotese: sem, hipotese_forcada: hip !== "propria" ? hip : null });
      toast.success(`${resolvidas} resolvida(s)${sem ? ` · ${sem} sem hipótese (não resolvidas)` : ""}${ja ? ` · ${ja} já estavam resolvidas` : ""}.`); onOk();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(false);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Resolver {ids.length} divergência(s)</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label className="text-xs">Hipótese</Label>
            <Select value={hip} onValueChange={setHip}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="propria">A de cada divergência (confirmada ou sugerida)</SelectItem>{hipoteses.filter((h) => h.ativo !== false).map((h) => <SelectItem key={h.codigo} value={h.codigo}>{h.nome || h.codigo}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Solução aplicada</Label><Input value={solucao} onChange={(e) => setSolucao(e.target.value)} placeholder="Ex.: Baixa semanal de avarias" /></div>
          <div><Label className="text-xs">Responsável</Label><Input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="você" /></div>
          <p className="text-xs text-muted-foreground">Cada uma passa pelo mesmo aprendizado da confirmação individual. Divergências sem hipótese disponível ficam como estão.</p>
        </div>
        <DialogFooter><Button variant="ghost" disabled={ocupado} onClick={onClose}>Cancelar</Button><Button disabled={ocupado} onClick={ok}>{ocupado && <Loader2 className="size-4 animate-spin" />}Resolver</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
