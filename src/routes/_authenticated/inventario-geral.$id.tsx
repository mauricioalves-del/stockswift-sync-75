// Conferência do inventário: Contagem (lista cega da minha dupla), Recontagem (aba separada, vira contagem final)
// e Painel da gestão (progresso por dupla, divergências, resultado final e exportação).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAll } from "@/lib/fetch-all";
import { dataHora, nomeUsuario, num, sb, StatusInv, type Usuario } from "@/components/inventario-geral/comum";

export const Route = createFileRoute("/_authenticated/inventario-geral/$id")({ component: Pagina, head: () => ({ meta: [{ title: "Contagem de Inventário" }] }) });

function Pagina() {
  const { id } = Route.useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inv", id], queryFn: async () => {
    const [inv, du, g, me] = await Promise.all([sb.from("inv_inventarios").select("*").eq("id", id).single(), sb.from("inv_duplas").select("*").eq("inventario_id", id).order("nome"), sb.rpc("inv_sou_gestor"), sb.auth.getUser()]);
    return { inv: inv.data as any, duplas: (du.data ?? []) as any[], gestor: g.data === true, uid: me.data.user?.id as string };
  } });
  const [tentou, setTentou] = useState(false);
  useEffect(() => { // gera a lista sozinho quando chega a data/hora planejada
    const v = q.data?.inv; if (!v || tentou || v.status !== "planejado" || Date.parse(v.data_geracao) > Date.now()) return;
    setTentou(true); sb.rpc("inv_gerar_lista", { p_inv: id }).then((r: any) => { if (!r.error) { toast.success(`Lista gerada: ${r.data} item(ns).`); qc.invalidateQueries({ queryKey: ["inv", id] }); } });
  }, [q.data, tentou, id, qc]);
  if (!q.data?.inv) return <p className="py-10 text-center text-muted-foreground">{q.isLoading ? "Carregando…" : "Inventário não encontrado."}</p>;
  const { inv, duplas, gestor, uid } = q.data;
  const minhas = duplas.filter((d) => [d.membro1, d.membro2].includes(uid));
  const r = () => qc.invalidateQueries({ queryKey: ["inv", id] });
  async function acao(fn: string, args: any, ok: string) { const res = await sb.rpc(fn, args); if (res.error) return toast.error(res.error.message); toast.success(ok); r(); qc.invalidateQueries({ queryKey: ["inv-tarefas", id] }); qc.invalidateQueries({ queryKey: ["inv-painel", id] }); }
  const abaPadrao = inv.status === "em_recontagem" && minhas.some((d) => d.reconta) ? "recontagem" : minhas.length ? "contagem" : "painel";
  return (
    <div className="space-y-4">
      <Link to="/inventario-geral" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="size-3" />Contagem de Inventário</Link>
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">#{inv.numero} · {inv.titulo}</h1><p className="text-xs text-slate-300">{inv.almoxarifado} · lista {inv.gerada_em ? `gerada em ${dataHora(inv.gerada_em)}` : `programada para ${dataHora(inv.data_geracao)}`}{inv.criterio_abc ? ` · classe ${inv.criterio_abc}` : ""}{minhas.length ? ` · você: ${minhas.map((d) => d.nome).join(", ")}` : ""}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusInv s={inv.status} />
          {gestor && inv.status === "planejado" && <Button size="sm" variant="secondary" onClick={() => acao("inv_gerar_lista", { p_inv: id }, "Lista gerada.")}>Gerar lista agora</Button>}
          {gestor && ["lista_gerada", "em_contagem"].includes(inv.status) && <Button size="sm" variant="secondary" onClick={() => confirm("Encerrar a 1ª contagem e apurar as divergências? Itens não contados contam como divergência.") && acao("inv_apurar", { p_inv: id }, "Contagem encerrada; divergências enviadas para recontagem.")}>Encerrar contagem e apurar</Button>}
          {gestor && inv.status === "em_recontagem" && <Button size="sm" variant="secondary" onClick={() => { const forcar = confirm("Finalizar o inventário? Se houver recontagem pendente, OK finaliza usando a 1ª contagem nesses itens."); if (forcar) acao("inv_finalizar", { p_inv: id, p_forcar: true }, "Inventário finalizado."); }}>Finalizar inventário</Button>}
        </div>
      </div>
      <Tabs defaultValue={abaPadrao}>
        <TabsList>{minhas.some((d) => d.conta) && <TabsTrigger value="contagem">Contagem</TabsTrigger>}{minhas.some((d) => d.reconta) && <TabsTrigger value="recontagem">Recontagem</TabsTrigger>}{gestor && <TabsTrigger value="painel">Painel da gestão</TabsTrigger>}</TabsList>
        {minhas.some((d) => d.conta) && <TabsContent value="contagem"><Conferencia inv={inv} fase="contagem" aberta={["lista_gerada", "em_contagem"].includes(inv.status)} /></TabsContent>}
        {minhas.some((d) => d.reconta) && <TabsContent value="recontagem"><Conferencia inv={inv} fase="recontagem" aberta={inv.status === "em_recontagem"} /></TabsContent>}
        {gestor && <TabsContent value="painel"><Painel inv={inv} duplas={duplas} /></TabsContent>}
      </Tabs>
      {!minhas.length && !gestor && <p className="text-sm text-muted-foreground">Você não está escalado neste inventário.</p>}
    </div>
  );
}

function Conferencia({ inv, fase, aberta }: { inv: any; fase: "contagem" | "recontagem"; aberta: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inv-tarefas", inv.id, fase], queryFn: async () => { const r = await sb.rpc("inv_minhas_tarefas", { p_inv: inv.id, p_fase: fase }); if (r.error) throw r.error; return (r.data ?? []) as any[]; } });
  const [busca, setBusca] = useState(""); const [valores, setValores] = useState<Record<string, string>>({}); const [ident, setIdent] = useState<Record<string, boolean | undefined>>({}); const [add, setAdd] = useState(false);
  const itens = (q.data ?? []).filter((i) => !busca || `${i.codigo_produto} ${i.descricao} ${i.lote}`.toLowerCase().includes(busca.toLowerCase()));
  const feitos = (q.data ?? []).filter((i) => i.qtd != null).length, total = q.data?.length ?? 0;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["inv-tarefas", inv.id, fase] });
  async function salvar(i: any) {
    const v = valores[i.id] ?? (i.qtd != null ? String(i.qtd) : ""); const qtd = Number(String(v).replace(",", "."));
    if (v === "" || !(qtd >= 0)) return toast.error("Informe a quantidade contada.");
    const idt = ident[i.id] ?? i.identificado;
    if (fase === "recontagem" && idt == null) return toast.error("Marque se o produto foi identificado na 2ª contagem (Sim/Não).");
    const r = await sb.rpc("inv_registrar", { p_item: i.id, p_fase: fase, p_qtd: qtd, p_identificado: fase === "recontagem" ? idt : null });
    if (r.error) return toast.error(r.error.message); recarregar();
  }
  async function concluir() { if (feitos < total && !confirm(`Faltam ${total - feitos} item(ns). Concluir mesmo assim?`)) return; const r = await sb.rpc("inv_concluir", { p_inv: inv.id, p_fase: fase }); if (r.error) return toast.error(r.error.message); toast.success("Etapa da sua dupla concluída."); }
  const grupos = useMemo(() => { const m = new Map<string, any[]>(); for (const i of itens) { const g = i.grupo || "Sem grupo"; m.set(g, [...(m.get(g) ?? []), i]); } return [...m]; }, [itens]);
  return (
    <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar código, produto ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <span className="text-sm font-semibold tabular-nums">{feitos}/{total} {fase === "recontagem" ? "recontado(s)" : "contado(s)"}</span>
        {aberta && <Button size="sm" variant="outline" onClick={() => setAdd(true)}><PackagePlus className="mr-1 size-4" />Produto fora da lista</Button>}
        {aberta && total > 0 && <Button size="sm" onClick={concluir}><Check className="mr-1 size-4" />Concluir {fase === "recontagem" ? "recontagem" : "contagem"} da dupla</Button>}
      </div>
      {!aberta && <p className="rounded-md bg-muted p-2 text-xs">{fase === "recontagem" ? "A recontagem abre quando a gestão encerra a 1ª contagem." : inv.status === "planejado" ? `A lista será gerada em ${dataHora(inv.data_geracao)}.` : "A contagem está encerrada para lançamentos."}</p>}
      {fase === "recontagem" && <p className="text-xs text-muted-foreground">Itens com divergência na 1ª contagem, feita por outra dupla. Conte sem consultar a contagem anterior; a sua quantidade passa a ser a contagem final oficial.</p>}
      {grupos.map(([g, lista]) => <div key={g}><div className="mb-1 mt-2 text-xs font-bold uppercase text-muted-foreground">{g} · {lista.filter((x) => x.qtd != null).length}/{lista.length}</div>
        <div className="divide-y rounded-lg border">{lista.map((i) => (
          <div key={i.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${i.qtd != null ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
            <div className="min-w-[220px] flex-1"><div className="text-sm font-semibold">{i.descricao}</div><div className="text-[11px] text-muted-foreground">{i.codigo_produto}{i.lote ? ` · lote ${i.lote}` : ""}{i.unidade ? ` · ${i.unidade}` : ""}{i.origem_item === "manual" ? " · incluído manualmente" : ""}</div></div>
            {fase === "recontagem" && <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">Identificado na 2ª contagem?</span>{[true, false].map((b) => <button key={String(b)} disabled={!aberta} onClick={() => setIdent({ ...ident, [i.id]: b })} className={`rounded-md border px-2 py-1 font-semibold ${(ident[i.id] ?? i.identificado) === b ? (b ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : ""}`}>{b ? "Sim" : "Não"}</button>)}</div>}
            <Input disabled={!aberta} className="h-9 w-28 text-right" inputMode="decimal" placeholder="Qtd" value={valores[i.id] ?? (i.qtd != null ? String(i.qtd) : "")} onChange={(e) => setValores({ ...valores, [i.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvar(i)} />
            {aberta && <Button size="sm" variant={i.qtd != null ? "outline" : "default"} onClick={() => salvar(i)}>{i.qtd != null ? "Atualizar" : "Salvar"}</Button>}
          </div>))}</div></div>)}
      {!q.isLoading && !total && <p className="py-6 text-center text-sm text-muted-foreground">{fase === "recontagem" ? "Nenhum item para a sua dupla recontar." : "Nenhum item na lista da sua dupla."}</p>}
      <AdicionarManual inv={inv} fase={fase} aberto={add} onFechar={() => setAdd(false)} onOk={recarregar} />
    </CardContent></Card>
  );
}

function AdicionarManual({ inv, fase, aberto, onFechar, onOk }: { inv: any; fase: string; aberto: boolean; onFechar: () => void; onOk: () => void }) {
  const [termo, setTermo] = useState(""); const [res, setRes] = useState<any[]>([]); const [sel, setSel] = useState<any>(null); const [lote, setLote] = useState(""); const [qtd, setQtd] = useState(""); const [ident, setIdent] = useState(true);
  async function buscar() {
    if (termo.trim().length < 2) return;
    const t = termo.trim().replace(/[%,]/g, "");
    const [a, e] = await Promise.all([sb.from("atlas_produtos").select("sku, descricao, unidade").or(`sku.ilike.%${t}%,descricao.ilike.%${t}%`).limit(25), sb.from("estoque_sistemico").select("id_produto, descricao, unidade").or(`id_produto.ilike.%${t}%,descricao.ilike.%${t}%`).limit(25)]);
    const m = new Map<string, any>(); for (const x of a.data ?? []) m.set(x.sku, { codigo: x.sku, descricao: x.descricao, unidade: x.unidade }); for (const x of e.data ?? []) if (!m.has(x.id_produto)) m.set(x.id_produto, { codigo: x.id_produto, descricao: x.descricao, unidade: x.unidade });
    setRes([...m.values()]);
  }
  async function incluir() {
    const n = Number(qtd.replace(",", ".")); if (!sel || !(n >= 0) || qtd === "") return toast.error("Escolha o produto e informe a quantidade.");
    const r = await sb.rpc("inv_adicionar_manual", { p_inv: inv.id, p_codigo: sel.codigo, p_lote: lote.trim(), p_qtd: n, p_fase: fase, p_identificado: fase === "recontagem" ? ident : null });
    if (r.error) return toast.error(r.error.message); toast.success("Produto incluído na lista da sua dupla."); setSel(null); setTermo(""); setRes([]); setLote(""); setQtd(""); onOk(); onFechar();
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Incluir produto fora da lista</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Busca em todo o cadastro, inclusive produtos zerados ou sem estoque neste almoxarifado.</p>
      <div className="flex gap-2"><Input placeholder="Código ou descrição" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} /><Button variant="outline" onClick={buscar}><Search className="size-4" /></Button></div>
      <div className="max-h-56 divide-y overflow-y-auto rounded border">{res.map((p) => <button key={p.codigo} onClick={() => setSel(p)} className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-muted ${sel?.codigo === p.codigo ? "bg-muted font-semibold" : ""}`}>{p.codigo} · {p.descricao}</button>)}</div>
      {sel && <div className="grid grid-cols-2 gap-2"><Input placeholder="Lote (opcional)" value={lote} onChange={(e) => setLote(e.target.value)} /><Input placeholder="Quantidade contada" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
        {fase === "recontagem" && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={ident} onChange={(e) => setIdent(e.target.checked)} />Produto identificado na 2ª contagem</label>}</div>}
      <div className="flex justify-end"><Button onClick={incluir} disabled={!sel}>Incluir</Button></div>
    </DialogContent></Dialog>
  );
}

function Painel({ inv, duplas }: { inv: any; duplas: any[] }) {
  const q = useQuery({ queryKey: ["inv-painel", inv.id], refetchInterval: 30000, queryFn: async () => {
    const [it, us] = await Promise.all([fetchAll<any>((f, t) => sb.from("inv_itens").select("*").eq("inventario_id", inv.id).order("grupo").order("descricao").range(f, t)), sb.from("profiles").select("id, nome, email")]);
    return { itens: it as any[], usuarios: new Map(((us.data ?? []) as Usuario[]).map((u) => [u.id, u])) };
  } });
  const [filtro, setFiltro] = useState("todos");
  if (!q.data) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  const it = q.data.itens, nomeD = new Map(duplas.map((d) => [d.id, d.nome]));
  const contados = it.filter((i) => i.qtd_contagem != null).length, div = it.filter((i) => i.divergente).length, rec = it.filter((i) => i.divergente && i.qtd_recontagem != null).length;
  const sim = it.filter((i) => i.identificado_recontagem === true).length, nao = it.filter((i) => i.identificado_recontagem === false).length;
  const finais = it.filter((i) => i.qtd_final != null), certos = finais.filter((i) => Number(i.qtd_final) === Number(i.qtd_sistema)).length;
  const valorDif = finais.reduce((s, i) => s + (Number(i.qtd_final) - Number(i.qtd_sistema)) * (Number(i.custo_unitario) || 0), 0);
  const lista = it.filter((i) => filtro === "todos" || (filtro === "divergentes" ? i.divergente : filtro === "pendentes" ? (i.qtd_contagem == null || (i.divergente && i.qtd_recontagem == null)) : i.origem_item === "manual"));
  function exportar() {
    const cab = ["Grupo", "Código", "Produto", "Lote", "Origem", "Dupla contagem", "Sistema", "1ª contagem", "Divergente", "Dupla recontagem", "2ª contagem", "Identificado na 2ª", "Final oficial", "Diferença", "Custo unit.", "Diferença R$"];
    const linhas = it.map((i) => [i.grupo, i.codigo_produto, i.descricao, i.lote, i.origem_item, nomeD.get(i.dupla_id) ?? "", i.qtd_sistema, i.qtd_contagem ?? "", i.divergente == null ? "" : i.divergente ? "Sim" : "Não", nomeD.get(i.dupla_recontagem_id) ?? "", i.qtd_recontagem ?? "", i.identificado_recontagem == null ? "" : i.identificado_recontagem ? "Sim" : "Não", i.qtd_final ?? "", i.qtd_final == null ? "" : Number(i.qtd_final) - Number(i.qtd_sistema), i.custo_unitario ?? "", i.qtd_final == null || i.custo_unitario == null ? "" : ((Number(i.qtd_final) - Number(i.qtd_sistema)) * Number(i.custo_unitario)).toFixed(2)]);
    const csv = [cab, ...linhas].map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `inventario-${inv.numero}.csv`; a.click();
  }
  const Kpi = ({ t, v, s }: { t: string; v: string; s?: string }) => <div className="rounded-xl border border-l-4 border-l-slate-800 bg-card p-3 shadow-sm"><div className="text-[10px] font-semibold uppercase text-muted-foreground">{t}</div><div className="text-xl font-bold tabular-nums">{v}</div>{s && <div className="text-[11px] text-muted-foreground">{s}</div>}</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi t="Itens na lista" v={num(it.length, 0)} s={`${it.filter((i) => i.origem_item === "manual").length} incluídos manualmente`} />
        <Kpi t="1ª contagem" v={`${it.length ? Math.round((contados / it.length) * 100) : 0}%`} s={`${contados} de ${it.length}`} />
        <Kpi t="Divergências" v={num(div, 0)} s={inv.apurado_em ? `apuradas em ${dataHora(inv.apurado_em)}` : "apuradas ao encerrar a contagem"} />
        <Kpi t="Recontagem" v={`${rec}/${div}`} s={`identificado: ${sim} sim · ${nao} não`} />
        <Kpi t="Acurácia final" v={finais.length ? `${Math.round((certos / finais.length) * 1000) / 10}%` : "—"} s="itens em que a contagem final = sistema" />
        <Kpi t="Diferença final (R$)" v={valorDif.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} s="final − sistema, pelo custo" />
      </div>
      <Card><CardContent className="p-3"><div className="mb-2 text-xs font-bold">Duplas</div>
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Dupla", "Integrantes", "Papel", "Contagem", "Recontagem"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{duplas.map((d) => { const c = it.filter((i) => i.dupla_id === d.id), r = it.filter((i) => i.dupla_recontagem_id === d.id); return (
            <tr key={d.id} className="border-t"><td className="px-2 py-1 font-semibold">{d.nome}</td><td className="px-2 py-1 text-xs">{[d.membro1, d.membro2].filter(Boolean).map((u: string) => nomeUsuario(q.data!.usuarios.get(u))).join(" e ")}</td><td className="px-2 py-1 text-xs">{[d.conta && "conta", d.reconta && "reconta"].filter(Boolean).join(" · ")}</td>
              <td className="px-2 py-1 text-xs tabular-nums">{d.conta ? `${c.filter((i) => i.qtd_contagem != null).length}/${c.length}${d.contagem_concluida_em ? " · concluída" : ""}` : "—"}</td><td className="px-2 py-1 text-xs tabular-nums">{d.reconta ? `${r.filter((i) => i.qtd_recontagem != null).length}/${r.length}${d.recontagem_concluida_em ? " · concluída" : ""}` : "—"}</td></tr>); })}</tbody></table></CardContent></Card>
      <Card><CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1">{[["todos", "Todos"], ["divergentes", "Divergentes"], ["pendentes", "Pendentes"], ["manuais", "Incluídos manualmente"]].map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} className={`h-7 rounded-md border px-2 text-xs font-semibold ${filtro === v ? "bg-slate-900 text-white" : ""}`}>{l}</button>)}
          <Button size="sm" variant="outline" className="ml-auto" onClick={exportar}><Download className="mr-1 size-4" />Exportar CSV</Button></div>
        <div className="max-h-[520px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{["Produto", "Lote", "Dupla", "Sistema", "1ª", "Div.", "Recontagem", "2ª", "Ident.", "Final", "Dif."].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{lista.map((i) => { const dif = i.qtd_final == null ? null : Number(i.qtd_final) - Number(i.qtd_sistema); return (
            <tr key={i.id} className="border-t"><td className="px-2 py-1">{i.codigo_produto} · {i.descricao}{i.origem_item === "manual" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">manual</span>}</td><td className="px-2 py-1">{i.lote || "—"}</td><td className="px-2 py-1">{nomeD.get(i.dupla_id) ?? "—"}</td>
              <td className="px-2 py-1 tabular-nums">{num(i.qtd_sistema)}</td><td className="px-2 py-1 tabular-nums">{num(i.qtd_contagem)}</td><td className="px-2 py-1">{i.divergente == null ? "" : i.divergente ? "⚠" : "✓"}</td><td className="px-2 py-1">{nomeD.get(i.dupla_recontagem_id) ?? ""}</td>
              <td className="px-2 py-1 tabular-nums">{num(i.qtd_recontagem)}</td><td className="px-2 py-1">{i.identificado_recontagem == null ? "" : i.identificado_recontagem ? "Sim" : "Não"}</td><td className="px-2 py-1 font-semibold tabular-nums">{num(i.qtd_final)}</td>
              <td className={`px-2 py-1 tabular-nums ${dif != null && dif < 0 ? "text-red-600" : dif ? "text-sky-700" : ""}`}>{dif == null ? "" : `${dif > 0 ? "+" : ""}${num(dif)}`}</td></tr>); })}</tbody></table></div>
      </CardContent></Card>
    </div>
  );
}
