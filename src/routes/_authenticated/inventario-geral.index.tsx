// Contagem de Inventário — lista de inventários e planejamento (data/hora da lista, almoxarifado, duplas e grupos).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAll } from "@/lib/fetch-all";
import { dividirInventarios } from "@/lib/inventario-status";
import { destinoRecontagem, participaRecontagem, recontagemValida } from "@/lib/inventario-recontagem";
import { dataHora, nomeUsuario, sb, StatusInv, type Usuario } from "@/components/inventario-geral/comum";

export const Route = createFileRoute("/_authenticated/inventario-geral/")({ component: Pagina, head: () => ({ meta: [{ title: "Planejamento de Inventário · Inventário" }, { name: "description", content: "Planeje contagens de inventário e escolha a mesma dupla ou outra dupla para recontar." }, { property: "og:title", content: "Planejamento de Inventário · Inventário" }, { property: "og:description", content: "Inventários e planejamento de contagem e recontagem." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

type DuplaForm = { key: string; id?: string; nome: string; membro1: string; membro2: string; conta: boolean; reconta: boolean; grupos: string[]; recontadaPor: string };
const chave = () => Math.random().toString(36).slice(2);
const novaDupla = (n: number, p: Partial<DuplaForm> = {}): DuplaForm => ({ key: chave(), nome: `Dupla ${n}`, membro1: "", membro2: "", conta: true, reconta: false, grupos: [], recontadaPor: "", ...p });

function Pagina() {
  const gestor = useQuery({ queryKey: ["inv-gestor"], queryFn: async () => (await sb.rpc("inv_sou_gestor")).data === true });
  const q = useQuery({ queryKey: ["inv-lista"], queryFn: async () => {
    const [inv, du, me] = await Promise.all([sb.from("inv_inventarios").select("*").order("data_geracao", { ascending: false }).limit(200), sb.from("inv_duplas").select("id, inventario_id, nome, membro1, membro2"), sb.auth.getUser()]);
    return { inv: (inv.data ?? []) as any[], duplas: (du.data ?? []) as any[], uid: me.data.user?.id as string };
  } });
  const [aba, setAba] = useState("aberto"); const [editando, setEditando] = useState<string | null>(null);
  const visiveis = useMemo(() => {
    if (!q.data) return [] as any[];
    const { inv, duplas, uid } = q.data;
    return gestor.data ? inv : inv.filter((i) => duplas.some((d) => d.inventario_id === i.id && [d.membro1, d.membro2].includes(uid)));
  }, [q.data, gestor.data]);
  const { abertos, finalizados } = useMemo(() => dividirInventarios(visiveis), [visiveis]);
  const rotulo = (t: string, n: number) => `${t}${q.data ? ` (${n})` : ""}`;
  const props = { duplas: q.data?.duplas ?? [], uid: q.data?.uid ?? "", gestor: !!gestor.data, carregando: q.isLoading, onEditar: (id: string) => { setEditando(id); setAba("plano"); } };
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold sm:text-3xl">Contagem de Inventário</h1></div>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger className="shrink-0" value="aberto">{rotulo("Em aberto", abertos.length)}</TabsTrigger><TabsTrigger className="shrink-0" value="finalizado">{rotulo("Finalizados", finalizados.length)}</TabsTrigger>{gestor.data && <TabsTrigger className="shrink-0" value="plano" onClick={() => setEditando(null)}>{editando ? "Editar planejamento" : "Planejamento"}</TabsTrigger>}</TabsList>
        <TabsContent value="aberto"><Lista {...props} inv={abertos} vazio={gestor.data ? "Nenhum inventário em aberto. Crie o primeiro em Planejamento." : "Você não está escalado em nenhum inventário em aberto."} /></TabsContent>
        <TabsContent value="finalizado"><Lista {...props} inv={finalizados} vazio="Nenhum inventário finalizado ainda." /></TabsContent>
        {gestor.data && <TabsContent value="plano"><Planejamento key={editando ?? "novo"} invId={editando} onCriado={() => { setEditando(null); setAba("aberto"); }} /></TabsContent>}
      </Tabs>
    </div>
  );
}

function Lista({ inv, duplas, uid, gestor, onEditar, carregando, vazio }: { inv: any[]; duplas: any[]; uid: string; gestor: boolean; onEditar: (id: string) => void; carregando: boolean; vazio: string }) {
  const qc = useQueryClient();
  async function excluir(id: string) { if (!confirm("Excluir este inventário e todas as contagens?")) return; const r = await sb.from("inv_inventarios").delete().eq("id", id); if (r.error) return toast.error(r.error.message); qc.invalidateQueries({ queryKey: ["inv-lista"] }); }
  return (
    <Card><CardContent className="p-3 md:p-0">
      <div className="space-y-3 md:hidden">{inv.map((i) => { const ds = duplas.filter((d) => d.inventario_id === i.id); const minha = ds.find((d) => [d.membro1, d.membro2].includes(uid)); return (
        <article key={i.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs font-semibold text-muted-foreground">Inventário #{i.numero}</div><Link to="/inventario-geral/$id" params={{ id: i.id }} className="mt-1 block break-words font-semibold leading-5 hover:underline">{i.titulo}</Link></div><StatusInv s={i.status} /></div>
          {minha && <p className="rounded-md bg-muted px-3 py-2 text-xs">Você está na <b>{minha.nome}</b></p>}
          <dl className="grid grid-cols-2 gap-3 text-xs"><div className="min-w-0"><dt className="text-muted-foreground">Almoxarifado</dt><dd className="mt-1 break-words font-medium">{i.almoxarifado}</dd></div><div><dt className="text-muted-foreground">Duplas</dt><dd className="mt-1 font-medium">{ds.length}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Geração da lista</dt><dd className="mt-1 font-medium">{dataHora(i.data_geracao)}</dd></div></dl>
          <div className="grid grid-cols-2 gap-2"><Link to="/inventario-geral/$id" params={{ id: i.id }} className={gestor && !["finalizado", "cancelado"].includes(i.status) ? "" : "col-span-2"}><Button className="w-full" variant="outline">Abrir inventário</Button></Link>{gestor && !["finalizado", "cancelado"].includes(i.status) && <Button variant="secondary" onClick={() => onEditar(i.id)}>Editar</Button>}{gestor && i.status === "planejado" && <Button className="col-span-2" variant="ghost" onClick={() => excluir(i.id)}><Trash2 className="mr-2 size-4" />Excluir planejamento</Button>}</div>
        </article>); })}</div>
      <table className="hidden w-full text-sm md:table"><thead className="bg-muted text-xs"><tr>{["#", "Inventário", "Almoxarifado", "Geração da lista", "Duplas", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{inv.map((i) => { const ds = duplas.filter((d) => d.inventario_id === i.id); const minha = ds.find((d) => [d.membro1, d.membro2].includes(uid)); return (
          <tr key={i.id} className="border-t hover:bg-muted/40"><td className="px-3 py-2">{i.numero}</td><td className="px-3 py-2 font-semibold"><Link to="/inventario-geral/$id" params={{ id: i.id }} className="hover:underline">{i.titulo}</Link>{minha && <div className="text-[11px] font-normal text-muted-foreground">você está na {minha.nome}</div>}</td>
            <td className="px-3 py-2">{i.almoxarifado}</td><td className="px-3 py-2">{dataHora(i.data_geracao)}</td><td className="px-3 py-2">{ds.length}</td><td className="px-3 py-2"><StatusInv s={i.status} /></td>
            <td className="px-3 py-2 text-right"><Link to="/inventario-geral/$id" params={{ id: i.id }}><Button size="sm" variant="outline">Abrir</Button></Link>{gestor && !["finalizado", "cancelado"].includes(i.status) && <Button size="sm" variant="ghost" onClick={() => onEditar(i.id)}>Editar</Button>}{gestor && i.status === "planejado" && <Button size="sm" variant="ghost" onClick={() => excluir(i.id)}><Trash2 className="size-4" /></Button>}</td></tr>); })}</tbody></table>
      {!inv.length && <p className="py-10 text-center text-sm text-muted-foreground">{carregando ? "Carregando…" : vazio}</p>}
    </CardContent></Card>
  );
}

function Planejamento({ onCriado, invId }: { onCriado: () => void; invId?: string | null }) {
  const qc = useQueryClient();
  const base = useQuery({ queryKey: ["inv-base"], queryFn: async () => {
    const [o, u, g] = await Promise.all([sb.from("origens").select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem"), sb.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
      fetchAll<any>((f, t) => sb.from("grupo_produtos").select("grupo").range(f, t))]);
    return { origens: (o.data ?? []) as any[], usuarios: (u.data ?? []) as Usuario[], grupos: [...new Set((g ?? []).map((x: any) => x.grupo).filter(Boolean))].sort() as string[] };
  } });
  const amanha = new Date(Date.now() + 86400000); amanha.setHours(7, 0, 0, 0);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ titulo: "", almoxarifado: "", data: local(amanha), abc: "", padrao: "", exibir: false, tol: "5" });
  const [duplas, setDuplas] = useState<DuplaForm[]>(() => [novaDupla(1, { reconta: true })]);
  const [status, setStatus] = useState("planejado"); const [carregado, setCarregado] = useState(!invId); const [removidas, setRemovidas] = useState<string[]>([]);
  useEffect(() => { if (!invId) return; (async () => {
    const [inv, du, gr] = await Promise.all([sb.from("inv_inventarios").select("*").eq("id", invId).single(), sb.from("inv_duplas").select("*").eq("inventario_id", invId).order("nome"), sb.from("inv_dupla_grupos").select("dupla_id, grupo").eq("inventario_id", invId)]);
    const v = inv.data; const ds: DuplaForm[] = (du.data ?? []).map((d: any) => ({ key: d.id, id: d.id, nome: d.nome, membro1: d.membro1 ?? "", membro2: d.membro2 ?? "", conta: d.conta, reconta: d.reconta, recontadaPor: d.recontada_por ?? "", grupos: (gr.data ?? []).filter((g: any) => g.dupla_id === d.id).map((g: any) => g.grupo) }));
    setF({ titulo: v.titulo, almoxarifado: v.almoxarifado, data: local(new Date(v.data_geracao)), abc: v.criterio_abc ?? "", padrao: v.dupla_padrao_id ?? "", exibir: !!v.exibir_sistema, tol: String(v.tolerancia_pct ?? 5) });
    setDuplas(ds.length ? ds : duplas); setStatus(v.status); setCarregado(true);
  })(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invId]);
  const [salvando, setSalvando] = useState(false);
  const usados = useMemo(() => new Map(duplas.flatMap((d) => d.grupos.map((g) => [g, d.key] as [string, string]))), [duplas]);
  const pessoas = duplas.flatMap((d) => [d.membro1, d.membro2]).filter(Boolean);
  const upd = (k: string, p: Partial<DuplaForm>) => setDuplas(duplas.map((d) => (d.key === k ? { ...d, ...p } : d)));
  const semGrupo = (base.data?.grupos ?? []).filter((g) => !usados.has(g));
  const recontadoras = duplas.filter((d) => d.reconta);
  const listaGerada = status !== "planejado";
  const padraoKey = f.padrao || duplas.find((d) => d.conta)?.key || "";

  async function salvar() {
    if (!f.titulo || !f.almoxarifado || !f.data) return toast.error("Preencha nome, almoxarifado e data/hora de geração.");
    if (duplas.some((d) => !d.membro1)) return toast.error("Cada dupla precisa de pelo menos um integrante.");
    if (new Set(pessoas).size !== pessoas.length) return toast.error("Uma pessoa não pode estar em duas duplas do mesmo inventário (a contagem é cega entre duplas).");
    if (!duplas.some((d) => d.conta)) return toast.error("Defina ao menos uma dupla de contagem.");
    const semRec = duplas.find((d) => d.conta && !recontagemValida(d, duplas));
    if (semRec) return toast.error(`Escolha a mesma dupla ou uma dupla habilitada para recontar a ${semRec.nome}.`);
    setSalvando(true);
    try {
      const cab: any = { titulo: f.titulo, exibir_sistema: f.exibir, tolerancia_pct: Number(f.tol.replace(",", ".")) || 0 };
      if (!listaGerada) Object.assign(cab, { almoxarifado: f.almoxarifado, data_geracao: new Date(f.data).toISOString(), criterio_abc: f.abc || null });
      let id = invId;
      if (id) { const r = await sb.from("inv_inventarios").update(cab).eq("id", id); if (r.error) throw r.error; }
      else { const r = await sb.from("inv_inventarios").insert(cab).select("id").single(); if (r.error) throw r.error; id = r.data.id; }
      for (const rid of removidas) { const r = await sb.from("inv_duplas").delete().eq("id", rid); if (r.error) throw new Error("Não foi possível remover uma dupla que já tem itens contados."); }
      const idPorKey = new Map<string, string>();
      for (const d of duplas) {
        const linha = { inventario_id: id, nome: d.nome, membro1: d.membro1, membro2: d.membro2 || null, conta: d.conta, reconta: participaRecontagem(d, duplas) };
        if (d.id) { const r = await sb.from("inv_duplas").update(linha).eq("id", d.id); if (r.error) throw r.error; idPorKey.set(d.key, d.id); }
        else { const r = await sb.from("inv_duplas").insert(linha).select("id").single(); if (r.error) throw r.error; idPorKey.set(d.key, r.data.id); }
      }
      for (const d of duplas) {
        const r = await sb.from("inv_duplas").update({ recontada_por: d.conta ? idPorKey.get(destinoRecontagem(d)) ?? null : null }).eq("id", idPorKey.get(d.key));
        if (r.error) throw r.error;
      }
      await sb.from("inv_dupla_grupos").delete().eq("inventario_id", id);
      const gr = duplas.filter((d) => d.conta).flatMap((d) => d.grupos.map((g) => ({ inventario_id: id, dupla_id: idPorKey.get(d.key), grupo: g })));
      if (gr.length) { const r = await sb.from("inv_dupla_grupos").insert(gr); if (r.error) throw r.error; }
      await sb.from("inv_inventarios").update({ dupla_padrao_id: idPorKey.get(padraoKey) ?? null }).eq("id", id);
      if (listaGerada) { const r = await sb.rpc("inv_redistribuir", { p_inv: id }); if (r.error) throw r.error; toast.success(`Planejamento atualizado; ${r.data} item(ns) ainda não contados redistribuídos.`); }
      else toast.success(invId ? "Planejamento atualizado." : "Inventário planejado. A lista será gerada na data e hora definidas (ou pelo botão 'Gerar lista agora').");
      qc.invalidateQueries({ queryKey: ["inv-lista"] }); qc.invalidateQueries({ queryKey: ["inv", id] }); onCriado();
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setSalvando(false); }
  }
  if (!base.data || !carregado) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  return (
    <Card><CardHeader><CardTitle>{invId ? `Editar planejamento — ${f.titulo}` : "Novo inventário"}</CardTitle></CardHeader><CardContent className="space-y-5">
      {listaGerada && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">A lista já foi gerada: almoxarifado, data e critério ABC ficam travados. Mudanças de grupos redistribuem só os itens ainda não contados; troca de integrantes vale a partir de agora.</p>}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2"><Label>Nome *</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Inventário geral Loja Pátio — dezembro" /></div>
        <div><Label>Almoxarifado *</Label><select disabled={listaGerada} className={sel} value={f.almoxarifado} onChange={(e) => setF({ ...f, almoxarifado: e.target.value })}><option value="">—</option>{base.data.origens.map((o) => <option key={o.codigo_origem} value={o.codigo_origem}>{o.codigo_origem}{o.descricao ? ` · ${o.descricao}` : ""}</option>)}</select></div>
        <div><Label>Data e hora da geração da lista *</Label><Input disabled={listaGerada} type="datetime-local" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
        <div><Label>Critério ABC (opcional)</Label><select disabled={listaGerada} className={sel} value={f.abc} onChange={(e) => setF({ ...f, abc: e.target.value })}><option value="">Todos os itens</option><option>A</option><option>B</option><option>C</option></select></div>
        <div><Label>Tolerância por SKU (%)</Label><Input value={f.tol} onChange={(e) => setF({ ...f, tol: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Produtos sem grupo atribuído vão para</Label><select className={sel} value={padraoKey} onChange={(e) => setF({ ...f, padrao: e.target.value })}>{duplas.filter((d) => d.conta).map((d) => <option key={d.key} value={d.key}>{d.nome}</option>)}</select></div>
        <p className="text-xs text-muted-foreground md:col-span-4">Contagem cega: só o Administrador vê o saldo do sistema; as duplas recebem apenas o sinal sonoro e a vibração de "dentro da tolerância" ou "divergência".</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><b className="flex items-center gap-2 text-sm"><Users className="size-4" />Duplas</b><Button size="sm" variant="outline" onClick={() => setDuplas([...duplas, novaDupla(duplas.length + 1)])}><Plus className="mr-1 size-4" />Dupla</Button></div>
        {duplas.map((d) => (
          <div key={d.key} className="rounded-lg border p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_1.4fr_auto_auto_auto]">
              <Input value={d.nome} onChange={(e) => upd(d.key, { nome: e.target.value })} />
              {(["membro1", "membro2"] as const).map((m) => <select key={m} className={sel} value={d[m]} onChange={(e) => upd(d.key, { [m]: e.target.value })}><option value="">{m === "membro1" ? "Integrante 1 *" : "Integrante 2"}</option>{base.data!.usuarios.map((u) => <option key={u.id} value={u.id} disabled={pessoas.includes(u.id) && d[m] !== u.id}>{nomeUsuario(u)}</option>)}</select>)}
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.conta} onChange={(e) => upd(d.key, { conta: e.target.checked, grupos: e.target.checked ? d.grupos : [] })} />Conta</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.reconta} onChange={(e) => upd(d.key, { reconta: e.target.checked })} />Reconta</label>
              {duplas.length > 1 && <Button size="sm" variant="ghost" onClick={() => { if (d.id) setRemovidas([...removidas, d.id]); setDuplas(duplas.filter((x) => x.key !== d.key).map((x) => (x.recontadaPor === d.key ? { ...x, recontadaPor: "" } : x))); }}><Trash2 className="size-4" /></Button>}
            </div>
            {d.conta && <div className="mt-2 grid gap-2 md:grid-cols-[1fr_260px]">
              <div><div className="mb-1 text-[11px] font-semibold text-muted-foreground">Grupos que esta dupla conta ({d.grupos.length})</div>
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">{base.data!.grupos.map((g) => { const dono = usados.get(g); const ativo = dono === d.key; return (
                  <button key={g} type="button" disabled={dono != null && !ativo} onClick={() => upd(d.key, { grupos: ativo ? d.grupos.filter((x) => x !== g) : [...d.grupos, g] })}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${ativo ? "border-slate-900 bg-slate-900 text-white" : dono != null ? "opacity-30" : "hover:bg-muted"}`}>{g}</button>); })}</div></div>
              <div><div className="mb-1 text-[11px] font-semibold text-muted-foreground">Responsável pela recontagem</div>
                <select aria-label={`Responsável pela recontagem de ${d.nome}`} className={sel} value={d.recontadaPor === d.key ? "" : d.recontadaPor} onChange={(e) => upd(d.key, { recontadaPor: e.target.value })}><option value="">Mesma pessoa / dupla</option>{recontadoras.filter((r) => r.key !== d.key).map((r) => <option key={r.key} value={r.key}>{r.nome}</option>)}</select></div>
            </div>}
          </div>))}
        {semGrupo.length > 0 && <p className="text-xs text-amber-700">{semGrupo.length} grupo(s) sem dupla — os itens deles irão para "{duplas.find((d) => d.key === padraoKey)?.nome ?? "—"}".</p>}
      </div>
      <div className="flex justify-end gap-2">{invId && <Button variant="outline" onClick={onCriado}>Cancelar</Button>}<Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : invId ? "Salvar alterações" : "Criar inventário"}</Button></div>
    </CardContent></Card>
  );
}
