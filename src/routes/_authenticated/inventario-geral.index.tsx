// Contagem de Inventário — lista de inventários e planejamento (data/hora da lista, almoxarifado, duplas e grupos).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAll } from "@/lib/fetch-all";
import { dataHora, nomeUsuario, sb, StatusInv, type Usuario } from "@/components/inventario-geral/comum";

export const Route = createFileRoute("/_authenticated/inventario-geral/")({ component: Pagina, head: () => ({ meta: [{ title: "Contagem de Inventário" }] }) });

type DuplaForm = { nome: string; membro1: string; membro2: string; conta: boolean; reconta: boolean; grupos: string[] };
const novaDupla = (n: number): DuplaForm => ({ nome: `Dupla ${n}`, membro1: "", membro2: "", conta: true, reconta: false, grupos: [] });

function Pagina() {
  const gestor = useQuery({ queryKey: ["inv-gestor"], queryFn: async () => (await sb.rpc("inv_sou_gestor")).data === true });
  const [aba, setAba] = useState("lista");
  return (
    <div className="space-y-4">
      <div><h1 className="text-3xl font-bold">Contagem de Inventário</h1><p className="text-sm text-muted-foreground">Inventário geral do almoxarifado: lista gerada na data e hora planejadas, contagem cega por duplas e grupos, recontagem por outra dupla e contagem final oficial.</p></div>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList><TabsTrigger value="lista">Inventários</TabsTrigger>{gestor.data && <TabsTrigger value="plano">Planejamento</TabsTrigger>}</TabsList>
        <TabsContent value="lista"><Lista gestor={!!gestor.data} /></TabsContent>
        {gestor.data && <TabsContent value="plano"><Planejamento onCriado={() => setAba("lista")} /></TabsContent>}
      </Tabs>
    </div>
  );
}

function Lista({ gestor }: { gestor: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inv-lista"], queryFn: async () => {
    const [inv, du, me] = await Promise.all([sb.from("inv_inventarios").select("*").order("data_geracao", { ascending: false }).limit(200), sb.from("inv_duplas").select("id, inventario_id, nome, membro1, membro2"), sb.auth.getUser()]);
    return { inv: (inv.data ?? []) as any[], duplas: (du.data ?? []) as any[], uid: me.data.user?.id as string };
  } });
  async function excluir(id: string) { if (!confirm("Excluir este inventário e todas as contagens?")) return; const r = await sb.from("inv_inventarios").delete().eq("id", id); if (r.error) return toast.error(r.error.message); qc.invalidateQueries({ queryKey: ["inv-lista"] }); }
  const lista = (q.data?.inv ?? []).filter((i) => gestor || q.data!.duplas.some((d) => d.inventario_id === i.id && [d.membro1, d.membro2].includes(q.data!.uid)));
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["#", "Inventário", "Almoxarifado", "Geração da lista", "Duplas", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{lista.map((i) => { const ds = q.data!.duplas.filter((d) => d.inventario_id === i.id); const minha = ds.find((d) => [d.membro1, d.membro2].includes(q.data!.uid)); return (
          <tr key={i.id} className="border-t hover:bg-muted/40"><td className="px-3 py-2">{i.numero}</td><td className="px-3 py-2 font-semibold"><Link to="/inventario-geral/$id" params={{ id: i.id }} className="hover:underline">{i.titulo}</Link>{minha && <div className="text-[11px] font-normal text-muted-foreground">você está na {minha.nome}</div>}</td>
            <td className="px-3 py-2">{i.almoxarifado}</td><td className="px-3 py-2">{dataHora(i.data_geracao)}</td><td className="px-3 py-2">{ds.length}</td><td className="px-3 py-2"><StatusInv s={i.status} /></td>
            <td className="px-3 py-2 text-right"><Link to="/inventario-geral/$id" params={{ id: i.id }}><Button size="sm" variant="outline">Abrir</Button></Link>{gestor && i.status === "planejado" && <Button size="sm" variant="ghost" onClick={() => excluir(i.id)}><Trash2 className="size-4" /></Button>}</td></tr>); })}</tbody></table>
      {!lista.length && <p className="py-10 text-center text-sm text-muted-foreground">{q.isLoading ? "Carregando…" : gestor ? "Nenhum inventário. Crie o primeiro em Planejamento." : "Você não está escalado em nenhum inventário."}</p>}
    </CardContent></Card>
  );
}

function Planejamento({ onCriado }: { onCriado: () => void }) {
  const qc = useQueryClient();
  const base = useQuery({ queryKey: ["inv-base"], queryFn: async () => {
    const [o, u, g] = await Promise.all([sb.from("origens").select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem"), sb.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
      fetchAll<any>((f, t) => sb.from("grupo_produtos").select("grupo").range(f, t))]);
    return { origens: (o.data ?? []) as any[], usuarios: (u.data ?? []) as Usuario[], grupos: [...new Set((g ?? []).map((x: any) => x.grupo).filter(Boolean))].sort() as string[] };
  } });
  const amanha = new Date(Date.now() + 86400000); amanha.setHours(7, 0, 0, 0);
  const [f, setF] = useState({ titulo: "", almoxarifado: "", data: new Date(amanha.getTime() - amanha.getTimezoneOffset() * 60000).toISOString().slice(0, 16), abc: "", padrao: 0 });
  const [duplas, setDuplas] = useState<DuplaForm[]>([novaDupla(1), { ...novaDupla(2), conta: false, reconta: true }]);
  const [salvando, setSalvando] = useState(false);
  const usados = useMemo(() => new Map(duplas.flatMap((d, i) => d.grupos.map((g) => [g, i] as [string, number]))), [duplas]);
  const pessoas = duplas.flatMap((d) => [d.membro1, d.membro2]).filter(Boolean);
  const upd = (i: number, p: Partial<DuplaForm>) => setDuplas(duplas.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const semGrupo = (base.data?.grupos ?? []).filter((g) => !usados.has(g));

  async function salvar() {
    if (!f.titulo || !f.almoxarifado || !f.data) return toast.error("Preencha nome, almoxarifado e data/hora de geração.");
    if (duplas.some((d) => !d.membro1)) return toast.error("Cada dupla precisa de pelo menos um integrante.");
    if (new Set(pessoas).size !== pessoas.length) return toast.error("Uma pessoa não pode estar em duas duplas do mesmo inventário (a contagem é cega entre duplas).");
    if (!duplas.some((d) => d.conta)) return toast.error("Defina ao menos uma dupla de contagem.");
    if (!duplas.some((d) => d.reconta)) return toast.error("Defina ao menos uma dupla de recontagem.");
    const semCruzada = duplas.find((d) => d.conta && !duplas.some((r) => r.reconta && r !== d));
    if (semCruzada) return toast.error(`A recontagem precisa ser feita por outra dupla: inclua uma dupla de recontagem diferente da ${semCruzada.nome}.`);
    setSalvando(true);
    try {
      const { data: inv, error } = await sb.from("inv_inventarios").insert({ titulo: f.titulo, almoxarifado: f.almoxarifado, data_geracao: new Date(f.data).toISOString(), criterio_abc: f.abc || null }).select("id").single();
      if (error) throw error;
      const { data: ds, error: e2 } = await sb.from("inv_duplas").insert(duplas.map((d) => ({ inventario_id: inv.id, nome: d.nome, membro1: d.membro1, membro2: d.membro2 || null, conta: d.conta, reconta: d.reconta }))).select("id, nome");
      if (e2) throw e2;
      const idPorNome = new Map((ds as any[]).map((d) => [d.nome, d.id]));
      const gr = duplas.flatMap((d) => d.grupos.map((g) => ({ inventario_id: inv.id, dupla_id: idPorNome.get(d.nome), grupo: g })));
      if (gr.length) { const r = await sb.from("inv_dupla_grupos").insert(gr); if (r.error) throw r.error; }
      const padrao = idPorNome.get(duplas[f.padrao]?.nome); if (padrao) await sb.from("inv_inventarios").update({ dupla_padrao_id: padrao }).eq("id", inv.id);
      toast.success("Inventário planejado. A lista será gerada na data e hora definidas (ou pelo botão 'Gerar lista agora')."); qc.invalidateQueries({ queryKey: ["inv-lista"] }); onCriado();
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setSalvando(false); }
  }
  if (!base.data) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  return (
    <Card><CardHeader><CardTitle>Novo inventário</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2"><Label>Nome *</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Inventário geral Loja Pátio — dezembro" /></div>
        <div><Label>Almoxarifado *</Label><select className={sel} value={f.almoxarifado} onChange={(e) => setF({ ...f, almoxarifado: e.target.value })}><option value="">—</option>{base.data.origens.map((o) => <option key={o.codigo_origem} value={o.codigo_origem}>{o.codigo_origem}{o.descricao ? ` · ${o.descricao}` : ""}</option>)}</select></div>
        <div><Label>Data e hora da geração da lista *</Label><Input type="datetime-local" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
        <div><Label>Critério ABC (opcional)</Label><select className={sel} value={f.abc} onChange={(e) => setF({ ...f, abc: e.target.value })}><option value="">Todos os itens</option><option>A</option><option>B</option><option>C</option></select></div>
        <div className="md:col-span-3"><Label>Produtos sem grupo atribuído vão para</Label><select className={sel} value={f.padrao} onChange={(e) => setF({ ...f, padrao: Number(e.target.value) })}>{duplas.map((d, i) => <option key={i} value={i}>{d.nome}</option>)}</select></div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><b className="flex items-center gap-2 text-sm"><Users className="size-4" />Duplas</b><Button size="sm" variant="outline" onClick={() => setDuplas([...duplas, novaDupla(duplas.length + 1)])}><Plus className="mr-1 size-4" />Dupla</Button></div>
        {duplas.map((d, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_1.4fr_auto_auto_auto]">
              <Input value={d.nome} onChange={(e) => upd(i, { nome: e.target.value })} />
              {(["membro1", "membro2"] as const).map((m) => <select key={m} className={sel} value={d[m]} onChange={(e) => upd(i, { [m]: e.target.value })}><option value="">{m === "membro1" ? "Integrante 1 *" : "Integrante 2"}</option>{base.data!.usuarios.map((u) => <option key={u.id} value={u.id} disabled={pessoas.includes(u.id) && d[m] !== u.id}>{nomeUsuario(u)}</option>)}</select>)}
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.conta} onChange={(e) => upd(i, { conta: e.target.checked, grupos: e.target.checked ? d.grupos : [] })} />Conta</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.reconta} onChange={(e) => upd(i, { reconta: e.target.checked })} />Reconta</label>
              {duplas.length > 1 && <Button size="sm" variant="ghost" onClick={() => setDuplas(duplas.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
            </div>
            {d.conta && <div className="mt-2"><div className="mb-1 text-[11px] font-semibold text-muted-foreground">Grupos que esta dupla conta ({d.grupos.length})</div>
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">{base.data!.grupos.map((g) => { const dono = usados.get(g); const ativo = dono === i; return (
                <button key={g} type="button" disabled={dono != null && !ativo} onClick={() => upd(i, { grupos: ativo ? d.grupos.filter((x) => x !== g) : [...d.grupos, g] })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${ativo ? "border-slate-900 bg-slate-900 text-white" : dono != null ? "opacity-30" : "hover:bg-muted"}`}>{g}</button>); })}</div></div>}
          </div>))}
        {semGrupo.length > 0 && <p className="text-xs text-amber-700">{semGrupo.length} grupo(s) sem dupla — os itens deles irão para "{duplas[f.padrao]?.nome}".</p>}
        <p className="text-xs text-muted-foreground">A contagem é cega: cada dupla vê só a própria lista, sem a quantidade do sistema. Itens com divergência vão para a recontagem de uma dupla diferente da que contou; a recontagem vira a contagem final oficial.</p>
      </div>
      <div className="flex justify-end"><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Criar inventário"}</Button></div>
    </CardContent></Card>
  );
}
