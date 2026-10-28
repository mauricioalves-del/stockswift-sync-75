import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ClipboardCheck, History, Loader2, Lock, Plus, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKLIST_PADRAO, FASES, aberturaPreparacao, bloqueiosLiberacao, descricaoDuplicada, diasEntre, faseDe, fmtData, isoHoje, podeGerenciarItens, progresso, proximaOrdem, somaDias, totalPendencias,
  type InventarioAgendado, type ItemChecklist, type Pendencia,
} from "@/lib/pre-inventario";

export const Route = createFileRoute("/_authenticated/gestao/pre-inventario")({
  component: PreInventarioPage,
  head: () => ({ meta: [
    { title: "Pré-inventário | Stock Savvy" },
    { name: "description", content: "Preparação, checklist e pendências dos inventários agendados no Stock Savvy." },
    { property: "og:title", content: "Pré-inventário | Stock Savvy" },
    { property: "og:description", content: "Preparação, checklist e pendências dos inventários agendados no Stock Savvy." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

const sb = supabase as any;
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function Fase({ inv, hoje }: { inv: InventarioAgendado; hoje: string }) {
  const f = FASES[faseDe(inv, hoje)];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${f.cls}`}>{f.rotulo}</span>;
}

function PreInventarioPage() {
  const qc = useQueryClient();
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const hoje = isoHoje();
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [agendar, setAgendar] = useState(false);

  const invQ = useQuery({
    queryKey: ["pre-inventario", "lista"],
    queryFn: async () => {
      const { data, error } = await sb.from("inventarios_agendados").select("*").order("data_inventario", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InventarioAgendado[];
    },
  });
  const itensQ = useQuery({
    queryKey: ["pre-inventario", "itens"],
    queryFn: async () => {
      const { data, error } = await sb.from("pre_inventario_itens").select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemChecklist[];
    },
  });
  const itensPor = useMemo(() => {
    const m = new Map<string, ItemChecklist[]>();
    for (const i of itensQ.data ?? []) m.set(i.inventario_id, [...(m.get(i.inventario_id) ?? []), i]);
    return m;
  }, [itensQ.data]);

  const todos = invQ.data ?? [];
  const lista = todos.filter((i) => mostrarEncerrados || i.status === "AGENDADO" || i.status === "APTO");
  const sel = todos.find((i) => i.id === selId) ?? lista[0] ?? null;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["pre-inventario"] });

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pré-inventário</h1>
          <p className="text-sm text-muted-foreground">Preparação do almoxarifado antes de cada inventário agendado: checklist, pendências a zerar e liberação formal.</p>
        </div>
        {gestor && <Button onClick={() => setAgendar(true)} className="gap-2"><Plus className="size-4" /> Agendar inventário</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Inventários</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={mostrarEncerrados} onCheckedChange={(v) => setMostrarEncerrados(v === true)} />Encerrados</label>
          </CardHeader>
          <CardContent className="p-0">
            {invQ.isLoading ? <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>
              : invQ.error ? <p className="px-4 py-6 text-sm text-destructive">Não foi possível carregar os inventários.</p>
              : !lista.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum inventário agendado.{gestor ? " Use “Agendar inventário” para abrir o primeiro pré-inventário." : ""}</p>
              : (
                <ul className="divide-y">
                  {lista.map((inv) => {
                    const p = progresso(itensPor.get(inv.id) ?? []);
                    const ativo = sel?.id === inv.id;
                    return (
                      <li key={inv.id}>
                        <button type="button" onClick={() => setSelId(inv.id)} className={`w-full space-y-1.5 px-4 py-3 text-left hover:bg-muted/60 ${ativo ? "bg-primary/5" : ""}`}>
                          <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-sm font-medium">{inv.almoxarifado}</span><Fase inv={inv} hoje={hoje} /></div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Inventário {fmtData(inv.data_inventario)}</span><span>{p.feitos}/{p.total} itens</span></div>
                          <Progress value={p.pct} className="h-1.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </CardContent>
        </Card>

        {sel ? <Detalhe key={sel.id} inv={sel} itens={itensPor.get(sel.id) ?? []} gestor={gestor} hoje={hoje} onMudou={recarregar} />
          : !invQ.isLoading && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um inventário.</CardContent></Card>}
      </div>

      {agendar && <AgendarDialog onClose={() => setAgendar(false)} onOk={(id) => { setAgendar(false); setSelId(id); recarregar(); }} />}
    </div>
  );
}

function Detalhe({ inv, itens, gestor, hoje, onMudou }: { inv: InventarioAgendado; itens: ItemChecklist[]; gestor: boolean; hoje: string; onMudou: () => void }) {
  const uidQ = useQuery({ queryKey: ["auth-uid"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null, staleTime: Infinity });
  const meuNomeQ = useQuery({
    enabled: !!uidQ.data, queryKey: ["meu-nome", uidQ.data], staleTime: Infinity,
    queryFn: async () => ((await sb.from("profiles").select("nome").eq("id", uidQ.data).maybeSingle()).data?.nome as string | undefined) ?? null,
  });
  const pendQ = useQuery({
    queryKey: ["pre-inventario", "pendencias", inv.almoxarifado],
    queryFn: async () => {
      const { data, error } = await sb.rpc("pre_inventario_pendencias", { p_almox: inv.almoxarifado });
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({ ...p, quantidade: Number(p.quantidade), valor: Number(p.valor) })) as Pendencia[];
    },
  });
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [novoItem, setNovoItem] = useState("");
  const [novaEtapa, setNovaEtapa] = useState("Itens adicionais");
  const [novoObrigatorio, setNovoObrigatorio] = useState(true);
  const [alterandoItens, setAlterandoItens] = useState(false);

  const responsavel = !!uidQ.data && inv.responsavel_id === uidQ.data;
  const editavel = inv.status === "AGENDADO" && (gestor || responsavel);
  const gerenciarItens = podeGerenciarItens(gestor, inv.status);
  const fase = faseDe(inv, hoje);
  const p = progresso(itens);
  const pend = pendQ.data ?? [];
  const nPend = totalPendencias(pend);
  const bloqueios = bloqueiosLiberacao(itens, pend, obs);
  const etapas = useMemo(() => { const m = new Map<string, ItemChecklist[]>(); for (const i of itens) m.set(i.etapa, [...(m.get(i.etapa) ?? []), i]); return [...m.entries()]; }, [itens]);
  const faltam = diasEntre(hoje, inv.data_inventario);

  async function marcar(i: ItemChecklist, v: boolean) {
    setSalvando(i.id);
    const { error } = await sb.from("pre_inventario_itens").update({
      concluido: v, concluido_por: v ? uidQ.data : null, concluido_nome: v ? meuNomeQ.data ?? null : null, concluido_em: v ? new Date().toISOString() : null,
    }).eq("id", i.id);
    setSalvando(null);
    if (error) return toast.error("Não consegui salvar: " + error.message);
    onMudou();
  }
  async function adicionarItem() {
    const descricao = novoItem.trim();
    if (!gerenciarItens || alterandoItens || !descricao) return;
    if (descricaoDuplicada(itens, descricao)) return toast.error("Já existe um item com essa descrição no checklist.");
    if (!meuNomeQ.data) return toast.error("Aguarde a identificação do usuário para registrar o histórico.");
    setAlterandoItens(true);
    try {
      const { error } = await sb.from("pre_inventario_itens").insert({ inventario_id: inv.id, ordem: proximaOrdem(itens), etapa: novaEtapa, descricao, obrigatorio: novoObrigatorio });
      if (error) throw error;
      setNovoItem(""); setNovaEtapa("Itens adicionais"); setNovoObrigatorio(true);
      await registrarItem("ITEM_ADICIONADO", descricao);
      toast.success("Item adicionado ao checklist.");
    } catch (e: any) { toast.error(e?.message ?? "Não consegui adicionar o item."); }
    finally { await onMudou(); setAlterandoItens(false); }
  }
  async function registrarItem(evento: "ITEM_ADICIONADO" | "ITEM_REMOVIDO", descricao: string) {
    const { data, error } = await sb.from("inventarios_agendados").select("historico").eq("id", inv.id).single();
    if (error) throw new Error("Item alterado, mas não consegui consultar o histórico: " + error.message);
    const historico = [...(data.historico ?? []), { evento, em: new Date().toISOString(), por: meuNomeQ.data, obs: descricao }];
    const { error: e2 } = await sb.from("inventarios_agendados").update({ historico }).eq("id", inv.id);
    if (e2) throw new Error("Item alterado, mas não consegui registrar o histórico: " + e2.message);
  }
  async function removerItem(i: ItemChecklist) {
    if (!gerenciarItens || alterandoItens) return;
    if (!meuNomeQ.data) return toast.error("Aguarde a identificação do usuário para registrar o histórico.");
    if (!confirm(`Remover o item “${i.descricao}” (ID: ${i.id})?${i.obrigatorio ? "\nEste item é obrigatório para liberar o inventário." : ""}`)) return;
    setAlterandoItens(true);
    try {
      const { error } = await sb.from("pre_inventario_itens").delete().eq("id", i.id).eq("inventario_id", inv.id);
      if (error) throw error;
      await registrarItem("ITEM_REMOVIDO", i.descricao);
      toast.success("Item removido do checklist.");
    } catch (e: any) { toast.error(e?.message ?? "Não consegui remover o item."); }
    finally { await onMudou(); setAlterandoItens(false); }
  }
  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    setSalvando(nome);
    const { error } = await sb.rpc(nome, args);
    setSalvando(null);
    if (error) return toast.error(error.message);
    toast.success(ok); setObs(""); onMudou();
  }
  async function mudarStatus(status: "REALIZADO" | "CANCELADO") {
    const motivo = status === "CANCELADO" ? prompt("Motivo do cancelamento:") : "";
    if (status === "CANCELADO" && !motivo?.trim()) return;
    const historico = [...(inv.historico ?? []), { evento: status, em: new Date().toISOString(), por: meuNomeQ.data ?? null, obs: motivo?.trim() || null }];
    const { error } = await sb.from("inventarios_agendados").update({ status, historico }).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(status === "REALIZADO" ? "Inventário marcado como realizado." : "Inventário cancelado."); onMudou();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><span className="font-mono text-lg font-semibold">{inv.almoxarifado}</span><Fase inv={inv} hoje={hoje} /></div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarClock className="size-4" /> Inventário em {fmtData(inv.data_inventario)}</span>
              <span>Preparação desde {fmtData(aberturaPreparacao(inv))}</span>
              <span>Responsável: {inv.responsavel_nome ?? "—"}</span>
            </p>
          </div>
          <div className="text-right">
            {inv.status === "AGENDADO" && <div className={`text-2xl font-bold ${faltam < 0 ? "text-destructive" : ""}`}>{faltam > 0 ? `${faltam} dia${faltam > 1 ? "s" : ""}` : faltam === 0 ? "Hoje" : `${-faltam} dia${faltam < -1 ? "s" : ""} de atraso`}</div>}
            {inv.status === "AGENDADO" && <div className="text-xs text-muted-foreground">{faltam >= 0 ? "para o inventário" : "sem liberação"}</div>}
            {gestor && inv.status === "APTO" && <Button variant="outline" size="sm" onClick={() => mudarStatus("REALIZADO")} className="gap-1"><CheckCircle2 className="size-4" /> Marcar como realizado</Button>}
          </div>
        </CardContent>
      </Card>
      {fase === "agendado" && <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">A janela de preparação abre em {fmtData(aberturaPreparacao(inv))}, mas o checklist já pode ser adiantado.</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><ClipboardCheck className="size-4" /> Checklist de preparação</span><span className="text-sm font-normal text-muted-foreground">{p.feitos}/{p.total} · {p.obrigatoriosFeitos}/{p.obrigatorios} obrigatórios</span></CardTitle>
          <Progress value={p.pct} className="h-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {!itens.length && <p className="text-sm text-muted-foreground">Sem itens de checklist.</p>}
          {etapas.map(([etapa, lst]) => (
            <div key={etapa} className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{etapa}</h4>
              <ul className="divide-y rounded-md border">
                {lst.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-3 py-2">
                    {salvando === i.id ? <Loader2 className="mt-0.5 size-4 animate-spin" /> : <Checkbox className="mt-0.5" checked={i.concluido} disabled={!editavel} onCheckedChange={(v) => marcar(i, v === true)} aria-label={i.descricao} />}
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${i.concluido ? "text-muted-foreground line-through" : ""}`}>{i.descricao}{i.obrigatorio && <span className="ml-1 text-destructive" title="Obrigatório para liberar">*</span>}</div>
                      {i.concluido && <div className="text-[11px] text-muted-foreground">{i.concluido_nome ?? "—"} · {quando(i.concluido_em)}</div>}
                    </div>
                    {gerenciarItens && <Button variant="ghost" size="icon" className="size-7 shrink-0 text-destructive" disabled={alterandoItens} onClick={() => removerItem(i)} title={`Remover item: ${i.descricao}`} aria-label={`Remover item: ${i.descricao}`}><Trash2 className="size-4" /></Button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {gerenciarItens && (
            <div className="space-y-3 border-t pt-3">
              <h4 className="text-sm font-semibold">Novo item</h4>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                <div className="space-y-1"><Label htmlFor="novo-item-descricao">Descrição</Label><Input id="novo-item-descricao" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} placeholder="Descrição do item" disabled={alterandoItens} /></div>
                <div className="space-y-1"><Label htmlFor="novo-item-etapa">Etapa</Label><Select value={novaEtapa} onValueChange={setNovaEtapa} disabled={alterandoItens}><SelectTrigger id="novo-item-etapa"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...etapas.map(([etapa]) => etapa), "Itens adicionais"])].map((etapa) => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={novoObrigatorio} onCheckedChange={(v) => setNovoObrigatorio(v === true)} disabled={alterandoItens} />Obrigatório para liberar</label>
                <Button variant="outline" onClick={adicionarItem} disabled={!novoItem.trim() || alterandoItens || !meuNomeQ.data} className="gap-2">{alterandoItens ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Adicionar</Button>
              </div>
            </div>
          )}
          {!editavel && inv.status === "AGENDADO" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3.5" /> Só o responsável ou um gestor marca o checklist.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><AlertTriangle className="size-4" /> Pendências a zerar</span>
            {!pendQ.isLoading && !pendQ.error && <span className={`text-sm font-normal ${nPend ? "text-destructive" : "text-emerald-600"}`}>{nPend ? `${nPend} em aberto` : "Tudo zerado"}</span>}</CardTitle>
          <p className="text-xs text-muted-foreground">Situação atual do almoxarifado {inv.almoxarifado}{inv.status !== "AGENDADO" ? " (a foto da liberação está abaixo)" : ""}.</p>
        </CardHeader>
        <CardContent>
          {pendQ.isLoading ? <p className="text-sm text-muted-foreground">Consultando…</p> : pendQ.error ? <p className="text-sm text-destructive">Não foi possível consultar as pendências.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {pend.map((x) => (
                <Link key={x.tipo} to={x.rota as any} className={`group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/60 ${x.quantidade ? "border-destructive/40" : ""}`}>
                  <div className="min-w-0"><div className="text-sm">{x.rotulo}</div>{x.valor > 0 && <div className="text-[11px] text-muted-foreground">{brl(x.valor)}</div>}</div>
                  <div className="flex items-center gap-1"><span className={`text-xl font-semibold ${x.quantidade ? "text-destructive" : "text-emerald-600"}`}>{x.quantidade}</span><ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" /></div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" /> Liberação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inv.status === "AGENDADO" && (editavel ? (
            <>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder={nPend ? "Justificativa obrigatória: por que liberar com pendências em aberto?" : "Observação (opcional)"} />
              {bloqueios.length > 0 && <ul className="space-y-1">{bloqueios.map((b) => <li key={b} className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3.5" /> {b}</li>)}</ul>}
              <div className="flex flex-wrap justify-between gap-2">
                {gestor ? <Button variant="ghost" className="gap-1 text-destructive" onClick={() => mudarStatus("CANCELADO")}><XCircle className="size-4" /> Cancelar inventário</Button> : <span />}
                <Button disabled={bloqueios.length > 0 || pendQ.isLoading || !!pendQ.error || salvando === "pre_inventario_liberar"} onClick={() => rpc("pre_inventario_liberar", { p_id: inv.id, p_obs: obs.trim() || null }, `${inv.almoxarifado} liberado para inventário.`)} className="gap-2">
                  {salvando === "pre_inventario_liberar" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{nPend ? "Liberar com ressalvas" : "Liberar — Apto para inventário"}
                </Button>
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Aguardando liberação pelo responsável ({inv.responsavel_nome ?? "—"}) ou por um gestor.</p>)}
          {inv.status !== "AGENDADO" && inv.liberado_em && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div>Liberado por <b>{inv.liberado_nome ?? "—"}</b> em {quando(inv.liberado_em)}</div>
              {inv.liberacao_obs && <div className="text-muted-foreground">“{inv.liberacao_obs}”</div>}
              {!!inv.pendencias_na_liberacao?.length && <div className="text-xs text-muted-foreground">Pendências no momento: {inv.pendencias_na_liberacao.map((x) => `${x.rotulo}: ${x.quantidade}`).join(" · ")}</div>}
            </div>
          )}
          {gestor && inv.status === "APTO" && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { const m = prompt("Motivo para reabrir a preparação:"); if (m?.trim()) rpc("pre_inventario_reabrir", { p_id: inv.id, p_motivo: m.trim() }, "Pré-inventário reaberto."); }}><RotateCcw className="size-4" /> Reabrir preparação</Button>
          )}
          {!!inv.historico?.length && (
            <div className="space-y-1 pt-2">
              <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><History className="size-3.5" /> Histórico</h4>
              <ul className="space-y-0.5 text-xs text-muted-foreground">{[...inv.historico].reverse().map((h, k) => <li key={k}>{quando(h.em)} · {h.evento.replaceAll("_", " ").toLowerCase()} · {h.por ?? "—"}{h.obs ? ` — ${h.obs}` : ""}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AgendarDialog({ onClose, onOk }: { onClose: () => void; onOk: (id: string) => void }) {
  const usuarios = useUsuariosSistema();
  const origensQ = useQuery({
    queryKey: ["origens-ativas"],
    queryFn: async () => {
      const { data, error } = await sb.from("origens").select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem");
      if (error) throw error;
      return (data ?? []) as { codigo_origem: string; descricao: string }[];
    },
  });
  const modelosQ = useQuery({
    queryKey: ["modelos_checklist_ativos"],
    queryFn: async () => ((await sb.from("modelos_checklist").select("id, nome").eq("ativo", true).order("nome")).data ?? []) as { id: string; nome: string }[],
  });
  const [almox, setAlmox] = useState("");
  const [data, setData] = useState(somaDias(isoHoje(), 14));
  const [antecedencia, setAntecedencia] = useState("7");
  const [resp, setResp] = useState("");
  const [modelo, setModelo] = useState("PADRAO");
  const [salvando, setSalvando] = useState(false);
  const ant = Number(antecedencia);
  const erro = !almox ? "Escolha o almoxarifado." : !data ? "Informe a data do inventário." : !(ant >= 1 && ant <= 60) ? "Antecedência entre 1 e 60 dias." : !resp ? "Escolha o responsável." : null;

  async function salvar() {
    if (erro) return toast.error(erro);
    setSalvando(true);
    try {
      let itens = CHECKLIST_PADRAO.map((x) => ({ ...x }));
      if (modelo !== "PADRAO") {
        const { data: mi, error } = await sb.from("modelos_checklist_itens").select("descricao_item, ordem").eq("modelo_id", modelo).order("ordem");
        if (error) throw error;
        const nome = modelosQ.data?.find((m) => m.id === modelo)?.nome ?? "Checklist";
        itens = (mi ?? []).map((x: any) => ({ etapa: nome, descricao: x.descricao_item, obrigatorio: true }));
      }
      const u = usuarios.data?.find((x) => x.id === resp);
      const { data: inv, error } = await sb.from("inventarios_agendados").insert({
        almoxarifado: almox, data_inventario: data, antecedencia_dias: ant, responsavel_id: resp, responsavel_nome: u?.nome ?? null,
        historico: [{ evento: "AGENDADO", em: new Date().toISOString(), por: null, obs: null }],
      }).select("id").single();
      if (error) throw error;
      if (itens.length) {
        const { error: e2 } = await sb.from("pre_inventario_itens").insert(itens.map((x, k) => ({ ...x, ordem: k + 1, inventario_id: inv.id })));
        if (e2) { await sb.from("inventarios_agendados").delete().eq("id", inv.id); throw e2; }
      }
      toast.success(`Inventário de ${almox} agendado para ${fmtData(data)}.`);
      onOk(inv.id);
    } catch (e: any) {
      toast.error(String(e?.message ?? e).includes("ux_inv_agendados_ativo") ? "Já existe um inventário ativo para esse almoxarifado nessa data." : "Não consegui agendar: " + (e?.message ?? e));
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar inventário</DialogTitle>
          <DialogDescription>O pré-inventário abre automaticamente {ant >= 1 ? ant : "X"} dia(s) antes da data.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Almoxarifado</Label>
            <Select value={almox} onValueChange={setAlmox}><SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>{(origensQ.data ?? []).map((o) => <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.codigo_origem}{o.descricao ? ` — ${o.descricao}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Data do inventário</Label><Input type="date" value={data} min={isoHoje()} onChange={(e) => setData(e.target.value)} /></div>
          <div><Label>Antecedência (dias)</Label><Input inputMode="numeric" value={antecedencia} onChange={(e) => setAntecedencia(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="sm:col-span-2"><Label>Responsável pela preparação</Label>
            <Select value={resp} onValueChange={setResp}><SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>{(usuarios.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Checklist</Label>
            <Select value={modelo} onValueChange={setModelo}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PADRAO">Checklist padrão de pré-inventário ({CHECKLIST_PADRAO.length} itens)</SelectItem>{(modelosQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {data && ant >= 1 && <p className="text-xs text-muted-foreground">Preparação de {fmtData(somaDias(data, -ant))} a {fmtData(somaDias(data, -1))}.</p>}
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={salvando}>Voltar</Button><Button onClick={salvar} disabled={salvando || !!erro} className="gap-2">{salvando && <Loader2 className="size-4 animate-spin" />}Agendar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
