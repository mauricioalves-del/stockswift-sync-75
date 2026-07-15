import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestao/planejamento")({
  component: PlanejamentoPage,
  head: () => ({ meta: [{ title: "Planejamento de Tarefas" }] }),
});

const PRIORIDADES = ["Baixa", "Media", "Alta"];
const RECORRENCIAS = ["Unica", "Diaria", "Semanal", "Quinzenal", "Mensal"];
const STATUS_LABELS: Record<string, string> = {
  Pendente: "Pendente", EmAndamento: "Em Andamento", Concluida: "Concluída",
  Atrasada: "Atrasada", Cancelada: "Cancelada",
};

function PlanejamentoPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Planejamento de Tarefas</h1>
        <p className="text-sm text-muted-foreground">Defina tarefas operacionais para a equipe de loja.</p>
      </div>
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Tarefas</TabsTrigger>
          <TabsTrigger value="nova">Nova Tarefa</TabsTrigger>
        </TabsList>
        <TabsContent value="lista"><ListaTarefas /></TabsContent>
        <TabsContent value="nova"><NovaTarefa /></TabsContent>
      </Tabs>
    </div>
  );
}

function ListaTarefas() {
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<string>("__all__");
  const [filtroTipo, setFiltroTipo] = useState<string>("__all__");

  const tiposQ = useQuery({
    queryKey: ["tipos_tarefa"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipos_tarefa").select("*").eq("ativo", true).order("ordem");
      return (data ?? []) as any[];
    },
  });

  const tarefasQ = useQuery({
    queryKey: ["tarefas_op", filtroStatus, filtroTipo],
    queryFn: async () => {
      let q = (supabase as any).from("tarefas_operacionais").select("*").order("data_prevista", { ascending: true });
      if (filtroStatus !== "__all__") q = q.eq("status", filtroStatus);
      if (filtroTipo !== "__all__") q = q.eq("tipo_id", filtroTipo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const tipoMap = useMemo(() => Object.fromEntries((tiposQ.data ?? []).map((t) => [t.id, t.nome])), [tiposQ.data]);
  const hoje = new Date().toISOString().slice(0, 10);

  async function excluir(id: string) {
    if (!confirm("Excluir tarefa?")) return;
    const { error } = await (supabase as any).from("tarefas_operacionais").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tarefa excluída");
    qc.invalidateQueries({ queryKey: ["tarefas_op"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Status</Label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Tipo</Label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(tiposQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tarefasQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma tarefa</TableCell></TableRow>
            )}
            {(tarefasQ.data ?? []).map((t: any) => {
              const atrasada = t.data_prevista && t.data_prevista < hoje && t.status !== "Concluida" && t.status !== "Cancelada";
              return (
                <TableRow key={t.id} className={atrasada ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{t.titulo}</TableCell>
                  <TableCell className="text-xs">{tipoMap[t.tipo_id] ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.responsavel_label || "—"}</TableCell>
                  <TableCell><Badge variant={t.prioridade === "Alta" ? "destructive" : "outline"} className="text-[10px]">{t.prioridade}</Badge></TableCell>
                  <TableCell className={`text-xs ${atrasada ? "text-destructive font-semibold" : ""}`}>
                    {t.data_prevista ? new Date(t.data_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell><Badge className="text-[10px]">{STATUS_LABELS[t.status] ?? t.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => excluir(t.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NovaTarefa() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    tipo_id: "", titulo: "", descricao: "", prioridade: "Media",
    data_prevista: new Date().toISOString().slice(0, 10),
    recorrencia: "Unica", responsavel_id: "", responsavel_label: "",
    loja_setor: "", grupo_produto: "", familia: "", sku_ou_local: "",
    checklist_modelo_id: "",
  });

  const tiposQ = useQuery({
    queryKey: ["tipos_tarefa_all"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipos_tarefa").select("*").eq("ativo", true).order("ordem");
      return (data ?? []) as any[];
    },
  });

  const usuariosQ = useQuery({
    queryKey: ["profiles_all"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, nome, email").order("nome");
      return (data ?? []) as any[];
    },
  });

  const modelosQ = useQuery({
    queryKey: ["modelos_checklist", form.tipo_id],
    queryFn: async () => {
      let q = (supabase as any).from("modelos_checklist").select("*").eq("ativo", true);
      if (form.tipo_id) q = q.eq("tipo_tarefa_id", form.tipo_id);
      const { data } = await q.order("nome");
      return (data ?? []) as any[];
    },
    enabled: !!form.tipo_id,
  });

  const gruposQ = useQuery({
    queryKey: ["grupos-distintos-planejamento"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("grupo_produtos").select("grupo");
      return Array.from(new Set((data ?? []).map((d: any) => d.grupo).filter(Boolean))) as string[];
    },
  });

  const tipoSelecionado = (tiposQ.data ?? []).find((t: any) => t.id === form.tipo_id);
  const integraMissao = tipoSelecionado?.integra_com === "MISSAO_INVENTARIO";

  async function salvar() {
    if (!form.tipo_id) return toast.error("Selecione o tipo");
    if (!form.titulo) return toast.error("Informe o título");
    setBusy(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      const respLabel = form.responsavel_label ||
        (usuariosQ.data ?? []).find((u: any) => u.id === form.responsavel_id)?.nome || null;

      // 1. cria tarefa
      const { data: t, error } = await (supabase as any).from("tarefas_operacionais").insert({
        tipo_id: form.tipo_id, titulo: form.titulo, descricao: form.descricao || null,
        prioridade: form.prioridade, data_prevista: form.data_prevista || null,
        recorrencia: form.recorrencia, responsavel_tipo: "Pessoa",
        responsavel_id: form.responsavel_id || null,
        responsavel_label: respLabel,
        loja_setor: form.loja_setor || null,
        grupo_produto: form.grupo_produto || null,
        familia: form.familia || null,
        sku_ou_local: form.sku_ou_local || null,
        checklist_modelo_id: form.checklist_modelo_id || null,
        criado_por: user.id,
      }).select().single();
      if (error) throw error;

      // 2. se integra com missão de inventário -> criar missão automaticamente
      if (integraMissao) {
        const { data: m } = await (supabase as any).from("missoes").insert({
          titulo: form.titulo, descricao: form.descricao || null,
          tipo: "EXTRAORDINARIA",
          grupo: form.grupo_produto || null,
          familia: form.familia || null,
          id_local: form.sku_ou_local || null,
          data_execucao: form.data_prevista || null,
          responsavel_id: form.responsavel_id || null,
          criado_por: user.id,
        }).select().single();

        if (m) {
          await (supabase as any).from("tarefas_operacionais").update({ missao_id: m.id }).eq("id", t.id);

          // gerar itens da missão a partir de estoque_sistemico
          let q = (supabase as any).from("estoque_sistemico").select("id_produto, descricao, lote, quantidade");
          if (form.sku_ou_local) q = q.or(`id_local.eq.${form.sku_ou_local},id_produto.eq.${form.sku_ou_local}`);
          if (form.grupo_produto) {
            const { data: codigos } = await (supabase as any).from("grupo_produtos").select("codigo_produto").eq("grupo", form.grupo_produto);
            const lista = (codigos ?? []).map((c: any) => c.codigo_produto);
            if (lista.length) q = q.in("id_produto", lista);
          }
          if (form.familia) {
            const { data: codigos } = await (supabase as any).from("familias").select("codigo_produto").eq("familia", form.familia);
            const lista = (codigos ?? []).map((c: any) => c.codigo_produto);
            if (lista.length) q = q.in("id_produto", lista);
          }
          const { data: itens } = await q.limit(2000);
          if (itens && itens.length) {
            await (supabase as any).from("missoes_itens").insert(
              itens.map((i: any) => ({
                missao_id: m.id, codigo_produto: i.id_produto, descricao: i.descricao,
                lote: i.lote, quantidade_prevista: i.quantidade,
              }))
            );
          }
        }
      }

      // 3. criar execução do checklist (linhas vazias)
      if (form.checklist_modelo_id) {
        const { data: itens } = await (supabase as any).from("modelos_checklist_itens")
          .select("id").eq("modelo_id", form.checklist_modelo_id);
        if (itens?.length) {
          await (supabase as any).from("checklist_execucao").insert(
            itens.map((i: any) => ({ tarefa_id: t.id, item_id: i.id, marcado: false }))
          );
        }
      }

      toast.success("Tarefa criada" + (integraMissao ? " + missão gerada" : ""));
      setForm({ ...form, titulo: "", descricao: "" });
      qc.invalidateQueries({ queryKey: ["tarefas_op"] });
      qc.invalidateQueries({ queryKey: ["missoes"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Nova Tarefa Operacional</CardTitle></CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Tipo *</Label>
          <Select value={form.tipo_id} onValueChange={(v) => setForm({ ...form, tipo_id: v, checklist_modelo_id: "" })}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {(tiposQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Título *</Label>
          <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
        </div>
        <div>
          <Label>Data Prevista</Label>
          <Input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} />
        </div>
        <div>
          <Label>Recorrência</Label>
          <Select value={form.recorrencia} onValueChange={(v) => setForm({ ...form, recorrencia: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RECORRENCIAS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Responsável</Label>
          <Select value={form.responsavel_id || "__none__"} onValueChange={(v) => setForm({ ...form, responsavel_id: v === "__none__" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— sem responsável —</SelectItem>
              {(usuariosQ.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Turno / Equipe (opcional)</Label>
          <Input value={form.responsavel_label} onChange={(e) => setForm({ ...form, responsavel_label: e.target.value })} placeholder="ex.: Turno Manhã" />
        </div>
        <div>
          <Label>Loja / Setor</Label>
          <Input value={form.loja_setor} onChange={(e) => setForm({ ...form, loja_setor: e.target.value })} />
        </div>
        <div>
          <Label>Grupo</Label>
          <Select value={form.grupo_produto || "__all__"} onValueChange={(v) => setForm({ ...form, grupo_produto: v === "__all__" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">— nenhum —</SelectItem>
              {(gruposQ.data ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Família</Label>
          <Input value={form.familia} onChange={(e) => setForm({ ...form, familia: e.target.value })} />
        </div>
        <div>
          <Label>SKU ou Local</Label>
          <Input value={form.sku_ou_local} onChange={(e) => setForm({ ...form, sku_ou_local: e.target.value })} placeholder="código do produto ou local" />
        </div>
        <div>
          <Label>Modelo de Checklist</Label>
          <Select value={form.checklist_modelo_id || "__none__"} onValueChange={(v) => setForm({ ...form, checklist_modelo_id: v === "__none__" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— sem checklist —</SelectItem>
              {(modelosQ.data ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {integraMissao && (
          <div className="md:col-span-2 text-xs bg-primary/5 border border-primary/20 rounded p-2">
            ℹ️ Este tipo <b>integra com Missão de Inventário</b>. Ao salvar, uma missão será criada automaticamente com os itens correspondentes.
          </div>
        )}
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={salvar} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Criar Tarefa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
