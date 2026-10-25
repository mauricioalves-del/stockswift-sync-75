import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { lerTudo } from "@/lib/atlas-investigacao";
import { STATUS_ACAO, reconciliarAcoes } from "@/lib/atlas-fechamento";

export const Route = createFileRoute("/_authenticated/atlas/pos-inventario")({
  component: PosInventario,
  head: () => ({ meta: [{ title: "Pós-Inventário — Atlas" }] }),
});

const sb = supabase as any;
type Check = { descricao: string; concluido: boolean };
type Acao = { id: number; item_fechamento_id: number | null; fechamento_id: number | null; sku: string; descricao_produto: string | null; almoxarifado: string | null; acao_descricao: string | null; responsavel: string | null; prazo: string | null; status: string; checklist: Check[] | null; origem_automatica: boolean | null; observacao_conclusao: string | null; criado_por: string | null; criado_em: string | null; concluido_em: string | null };
const ROT: Record<string, { rot: string; cls: string }> = {
  Pendente: { rot: "Pendente", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  Em_Andamento: { rot: "Em andamento", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
  Concluida: { rot: "Concluída", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  Cancelada: { rot: "Cancelada", cls: "bg-muted text-muted-foreground" },
};
const dt = (s: string | null | undefined) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date().toISOString().slice(0, 10);

async function quem() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = u.user ? await sb.from("profiles").select("nome, email").eq("id", u.user.id).maybeSingle() : { data: null };
  return p?.nome || p?.email || u.user?.email || "Stock Savvy";
}
async function log(acao: string, detalhes: Record<string, unknown>, id?: number) {
  await sb.from("atlas_log_auditoria").insert({ username: await quem(), acao, entidade: id != null ? "acao_pos_inventario" : null, entidade_id: id != null ? String(id) : null, detalhes, criado_em: new Date().toISOString() });
}

function PosInventario() {
  const { role } = useRole();
  const pode = role === "ADMINISTRADOR" || role === "GERENTE";
  const qc = useQueryClient();
  const [f, setF] = useState({ status: "abertas", almox: "todos", busca: "", resp: "todos" });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [editar, setEditar] = useState<Acao | "nova" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const q = useQuery({ queryKey: ["atlas-acoes-pos"], queryFn: async () => (await lerTudo<Acao>("atlas_acoes_pos_inventario", "*")).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))) });
  const todas = q.data ?? [];
  const lista = useMemo(() => {
    const b = f.busca.trim().toLowerCase();
    return todas.filter((a) => (f.status === "abertas" ? ["Pendente", "Em_Andamento"].includes(a.status) : f.status === "todas" || a.status === f.status) && (f.almox === "todos" || a.almoxarifado === f.almox) && (f.resp === "todos" || (a.responsavel ?? "") === f.resp) && (!b || `${a.sku} ${a.descricao_produto ?? ""} ${a.acao_descricao ?? ""}`.toLowerCase().includes(b)));
  }, [todas, f]);
  const cont = (s: string) => todas.filter((a) => a.status === s).length;
  const atrasadas = todas.filter((a) => ["Pendente", "Em_Andamento"].includes(a.status) && a.prazo && a.prazo < hoje()).length;
  const almoxes = [...new Set(todas.map((a) => a.almoxarifado).filter(Boolean) as string[])].sort();
  const resps = [...new Set(todas.map((a) => a.responsavel).filter(Boolean) as string[])].sort();
  const recarregar = () => qc.invalidateQueries({ queryKey: ["atlas-acoes-pos"] });

  async function lote(status: string) {
    const ids = [...sel]; if (!ids.length) return;
    const obs = status === "Concluida" ? prompt("Observação de conclusão (opcional):") ?? "" : "";
    setOcupado(true);
    const patch: Record<string, unknown> = { status };
    if (obs) patch.observacao_conclusao = obs;
    for (let i = 0; i < ids.length; i += 200) {
      await sb.from("atlas_acoes_pos_inventario").update(patch).in("id", ids.slice(i, i + 200));
      if (status === "Concluida") await sb.from("atlas_acoes_pos_inventario").update({ concluido_em: new Date().toISOString() }).in("id", ids.slice(i, i + 200)).is("concluido_em", null);
    }
    await log("confirmar_acoes_lote", { quantidade: ids.length, novo_status: status });
    toast.success(`${ids.length} ação(ões) atualizadas.`); setSel(new Set()); setOcupado(false); recarregar();
  }
  async function reconciliar() {
    setOcupado(true);
    try { const r = await reconciliarAcoes(await quem()); toast.success(`${r.resolvidas} de ${r.verificadas} ação(ões) concluídas: o item não divergiu em fechamento posterior.`); } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(false); recarregar();
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="size-6" /> Pós-Inventário</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">Ações corretivas dos itens divergentes nos fechamentos. A importação de um fechamento abre ação para cada item com "obs pós inv" e conclui sozinha as ações de quem voltou a não divergir.</p>
        </div>
        {pode && <div className="flex gap-2"><Button size="sm" variant="outline" className="gap-1" disabled={ocupado} onClick={reconciliar}><RefreshCw className="size-4" /> Reconciliar automaticamente</Button><Button size="sm" className="gap-1" onClick={() => setEditar("nova")}><Plus className="size-4" /> Nova ação</Button></div>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Pendentes", cont("Pendente")], ["Em andamento", cont("Em_Andamento")], ["Atrasadas", atrasadas], ["Concluídas", cont("Concluida")], ["Canceladas", cont("Cancelada")]].map(([r, n]) => <Card key={r}><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{r}</div><div className={`mt-1 text-xl font-semibold ${r === "Atrasadas" && Number(n) > 0 ? "text-destructive" : ""}`}>{Number(n).toLocaleString("pt-BR")}</div></CardContent></Card>)}
      </div>
      <Card><CardContent className="flex flex-wrap items-center gap-2 pt-4">
        <div className="relative"><Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" /><Input className="h-8 w-56 pl-8" placeholder="SKU, produto ou ação" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} /></div>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="abertas">Em aberto</SelectItem>{STATUS_ACAO.map((s) => <SelectItem key={s} value={s}>{ROT[s].rot}</SelectItem>)}<SelectItem value="todas">Todas</SelectItem></SelectContent></Select>
        <Select value={f.almox} onValueChange={(v) => setF({ ...f, almox: v })}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{almoxes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        <Select value={f.resp} onValueChange={(v) => setF({ ...f, resp: v })}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os responsáveis</SelectItem>{resps.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        {pode && sel.size > 0 && <div className="ml-auto flex gap-1">{(["Em_Andamento", "Concluida", "Cancelada"] as const).map((s) => <Button key={s} size="sm" variant="outline" disabled={ocupado} onClick={() => lote(s)}>{ROT[s].rot} ({sel.size})</Button>)}</div>}
      </CardContent></Card>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground">{pode && <th className="w-8 p-2"><input type="checkbox" checked={lista.length > 0 && lista.every((a) => sel.has(a.id))} onChange={(e) => setSel(e.target.checked ? new Set(lista.map((a) => a.id)) : new Set())} /></th>}<th className="p-2">SKU / Produto</th><th className="p-2">Almox.</th><th className="p-2">Ação</th><th className="p-2">Responsável</th><th className="p-2">Prazo</th><th className="p-2">Checklist</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={8} className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>}
            {lista.slice(0, 500).map((a) => {
              const ck = a.checklist ?? []; const atr = ["Pendente", "Em_Andamento"].includes(a.status) && a.prazo && a.prazo < hoje();
              return (
                <tr key={a.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => pode && setEditar(a)}>
                  {pode && <td className="p-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(a.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(a.id); else s.delete(a.id); setSel(s); }} /></td>}
                  <td className="p-2"><div className="font-mono text-xs">{a.sku}</div><div className="max-w-[220px] truncate text-xs text-muted-foreground">{a.descricao_produto}</div></td>
                  <td className="p-2 text-xs">{a.almoxarifado}</td>
                  <td className="max-w-[320px] p-2 text-xs"><div className="line-clamp-2">{a.acao_descricao}</div>{a.origem_automatica && <span className="text-[10px] text-muted-foreground">aberta pelo fechamento #{a.fechamento_id}</span>}</td>
                  <td className="p-2 text-xs">{a.responsavel || "—"}</td>
                  <td className={`p-2 text-xs ${atr ? "font-medium text-destructive" : ""}`}>{dt(a.prazo)}</td>
                  <td className="p-2 text-xs">{ck.length ? `${ck.filter((c) => c.concluido).length}/${ck.length}` : "—"}</td>
                  <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${ROT[a.status]?.cls ?? "bg-muted"}`}>{ROT[a.status]?.rot ?? a.status}</span></td>
                </tr>
              );
            })}
            {!q.isLoading && !lista.length && <tr><td colSpan={8} className="p-6 text-center text-xs text-muted-foreground">Nenhuma ação com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {lista.length > 500 && <p className="text-xs text-muted-foreground">Mostrando 500 de {lista.length}. Use os filtros para refinar.</p>}
      {editar && <EditarAcao acao={editar === "nova" ? null : editar} onClose={() => setEditar(null)} onOk={() => { setEditar(null); recarregar(); }} />}
    </div>
  );
}

function EditarAcao({ acao, onClose, onOk }: { acao: Acao | null; onClose: () => void; onOk: () => void }) {
  const [v, setV] = useState({ sku: acao?.sku ?? "", descricao_produto: acao?.descricao_produto ?? "", almoxarifado: acao?.almoxarifado ?? "", acao_descricao: acao?.acao_descricao ?? "", responsavel: acao?.responsavel ?? "", prazo: acao?.prazo ?? "", status: acao?.status ?? "Pendente", observacao_conclusao: acao?.observacao_conclusao ?? "" });
  const [ck, setCk] = useState<Check[]>(acao?.checklist ?? []);
  const [novoItem, setNovoItem] = useState(""); const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (!v.sku.trim() || !v.acao_descricao.trim()) { toast.error("Informe o SKU e a ação."); return; }
    setOcupado(true);
    const dados: Record<string, unknown> = { ...v, sku: v.sku.trim(), prazo: v.prazo || null, checklist: ck, responsavel: v.responsavel.trim() || null, almoxarifado: v.almoxarifado.trim() || null };
    if (v.status === "Concluida" && !acao?.concluido_em) dados.concluido_em = new Date().toISOString();
    const r = acao ? await sb.from("atlas_acoes_pos_inventario").update(dados).eq("id", acao.id) : await sb.from("atlas_acoes_pos_inventario").insert({ ...dados, status: "Pendente", origem_automatica: false, criado_por: await quem(), criado_em: new Date().toISOString() });
    setOcupado(false);
    if (r.error) { toast.error(r.error.message); return; }
    await log(acao ? "atualizar_acao_pos_inventario" : "criar_acao_pos_inventario", { sku: v.sku, status: v.status }, acao?.id);
    toast.success(acao ? "Ação atualizada." : "Ação criada."); onOk();
  }
  async function excluir() {
    if (!acao || !confirm("Excluir esta ação?")) return;
    const { error } = await sb.from("atlas_acoes_pos_inventario").delete().eq("id", acao.id);
    if (error) { toast.error(error.message); return; }
    await log("excluir_acao_pos_inventario", {}, acao.id); toast.success("Ação excluída."); onOk();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{acao ? `Ação #${acao.id}` : "Nova ação de pós-inventário"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div><Label className="text-xs">SKU</Label><Input value={v.sku} disabled={!!acao} onChange={(e) => setV({ ...v, sku: e.target.value })} /></div>
          <div><Label className="text-xs">Almoxarifado</Label><Input value={v.almoxarifado} onChange={(e) => setV({ ...v, almoxarifado: e.target.value })} placeholder="Almox_SP_Fabrica" /></div>
          <div className="md:col-span-2"><Label className="text-xs">Produto</Label><Input value={v.descricao_produto} onChange={(e) => setV({ ...v, descricao_produto: e.target.value })} /></div>
          <div className="md:col-span-2"><Label className="text-xs">Ação</Label><Textarea rows={2} value={v.acao_descricao} onChange={(e) => setV({ ...v, acao_descricao: e.target.value })} /></div>
          <div><Label className="text-xs">Responsável</Label><Input value={v.responsavel} onChange={(e) => setV({ ...v, responsavel: e.target.value })} /></div>
          <div><Label className="text-xs">Prazo</Label><Input type="date" value={v.prazo ?? ""} onChange={(e) => setV({ ...v, prazo: e.target.value })} /></div>
          {acao && <div><Label className="text-xs">Status</Label><Select value={v.status} onValueChange={(s) => setV({ ...v, status: s })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_ACAO.map((s) => <SelectItem key={s} value={s}>{ROT[s].rot}</SelectItem>)}</SelectContent></Select></div>}
          {acao && <div className="md:col-span-2"><Label className="text-xs">Observação de conclusão</Label><Textarea rows={1} value={v.observacao_conclusao} onChange={(e) => setV({ ...v, observacao_conclusao: e.target.value })} /></div>}
          <div className="md:col-span-2">
            <Label className="text-xs">Checklist</Label>
            <div className="space-y-1">{ck.map((c, i) => <div key={i} className="flex items-center gap-2"><input type="checkbox" checked={c.concluido} onChange={(e) => setCk(ck.map((x, j) => (j === i ? { ...x, concluido: e.target.checked } : x)))} /><span className={`flex-1 text-xs ${c.concluido ? "text-muted-foreground line-through" : ""}`}>{c.descricao}</span><button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setCk(ck.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>)}</div>
            <div className="mt-1 flex gap-2"><Input className="h-8" value={novoItem} placeholder="Novo item (ex.: Ajustar estoque)" onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && novoItem.trim()) { setCk([...ck, { descricao: novoItem.trim(), concluido: false }]); setNovoItem(""); } }} /><Button size="sm" variant="outline" onClick={() => { if (novoItem.trim()) { setCk([...ck, { descricao: novoItem.trim(), concluido: false }]); setNovoItem(""); } }}>Adicionar</Button></div>
          </div>
        </div>
        <DialogFooter className="gap-2">{acao && <Button variant="ghost" className="mr-auto gap-1 text-destructive" disabled={ocupado} onClick={excluir}><Trash2 className="size-4" /> Excluir</Button>}<Button variant="ghost" disabled={ocupado} onClick={onClose}>Cancelar</Button><Button disabled={ocupado} onClick={salvar}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
