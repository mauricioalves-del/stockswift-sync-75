import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Plus, CheckCircle2, XCircle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/abastecimento/demandas")({
  component: DemandasPage,
  head: () => ({ meta: [{ title: "Demandas Extras" }] }),
});

type Demanda = {
  id: string;
  origem: string; grupo_produto: string; familia: string;
  sku: string; produto: string;
  quantidade_extra: number; motivo: string; observacao: string;
  data_inicio: string; data_fim: string;
  responsavel: string | null; aprovado_por: string | null; aprovado_em: string | null;
  status: string; created_at: string;
};

const STATUS_TONES: Record<string, string> = {
  PLANEJADA: "bg-muted text-muted-foreground",
  AGUARDANDO_APROVACAO: "bg-warning/20 text-warning-foreground",
  APROVADA: "bg-success/15 text-success",
  REJEITADA: "bg-destructive/15 text-destructive",
  CONCLUIDA: "bg-primary/15 text-primary",
  CANCELADA: "bg-muted text-muted-foreground line-through",
};

function DemandasPage() {
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="size-6" /> Demandas Extras</h1>
        <p className="text-sm text-muted-foreground">
          Reposições extraordinárias (eventos, ações, datas comemorativas) que impactam o cálculo de abastecimento.
        </p>
      </div>

      <Tabs defaultValue="nova">
        <TabsList>
          <TabsTrigger value="nova">Nova Demanda</TabsTrigger>
          <TabsTrigger value="fila">Aguardando Aprovação</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="nova"><NovaDemanda /></TabsContent>
        <TabsContent value="fila"><FilaAprovacao /></TabsContent>
        <TabsContent value="historico"><Historico /></TabsContent>
      </Tabs>
    </div>
  );
}

function NovaDemanda() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    origem: "", sku: "", produto: "", grupo_produto: "", familia: "",
    quantidade_extra: 0, motivo: "", observacao: "",
    data_inicio: hoje, data_fim: hoje,
  });
  const [saving, setSaving] = useState(false);

  const paramsQ = useQuery({
    queryKey: ["parametros_ativos"],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_abastecimento" as never).select("origem").eq("ativo", true).order("origem");
      return ((data ?? []) as unknown as { origem: string }[]).map((o) => o.origem);
    },
  });

  async function buscarProduto(sku: string) {
    if (!sku) return;
    const { data } = await supabase.from("estoque_sistemico").select("descricao").eq("id_produto", sku).limit(1).maybeSingle();
    if (data?.descricao) setF((p) => ({ ...p, produto: data.descricao }));
  }

  async function salvar() {
    if (!f.origem || !f.sku || !f.motivo || !(f.quantidade_extra > 0)) {
      toast.error("Preencha origem, SKU, quantidade e motivo");
      return;
    }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("demanda_extra" as never).insert({
      ...f, responsavel: userId, status: "AGUARDANDO_APROVACAO",
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Demanda enviada para aprovação");
    setF({ ...f, sku: "", produto: "", quantidade_extra: 0, motivo: "", observacao: "" });
    qc.invalidateQueries({ queryKey: ["demandas_extras"] });
    qc.invalidateQueries({ queryKey: ["planejamento_cobertura"] });
  }

  if (!canWrite) return <div className="p-6 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar demanda extraordinária</CardTitle>
        <CardDescription>Aprovadas por Administrador impactam o cálculo de sugestão de abastecimento.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label>Origem *</Label>
          <Select value={f.origem} onValueChange={(v) => setF({ ...f, origem: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {(paramsQ.data ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>SKU *</Label>
          <Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })}
            onBlur={(e) => buscarProduto(e.target.value)} placeholder="Id_produto" />
        </div>
        <div>
          <Label>Produto</Label>
          <Input value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })} />
        </div>
        <div>
          <Label>Grupo</Label>
          <Input value={f.grupo_produto} onChange={(e) => setF({ ...f, grupo_produto: e.target.value })} />
        </div>
        <div>
          <Label>Família</Label>
          <Input value={f.familia} onChange={(e) => setF({ ...f, familia: e.target.value })} />
        </div>
        <div>
          <Label>Quantidade Extra *</Label>
          <Input type="number" min={0} step="0.01" value={f.quantidade_extra}
            onChange={(e) => setF({ ...f, quantidade_extra: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Data início *</Label>
          <Input type="date" value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} />
        </div>
        <div>
          <Label>Data fim *</Label>
          <Input type="date" value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} />
        </div>
        <div>
          <Label>Motivo *</Label>
          <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {["Evento","Degustação","Feira","Convenção","Ação Comercial","Data Comemorativa","Páscoa","Natal","Dia das Mães","Campanha Promocional","Reposição Especial"].map((m) =>
                <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Observação</Label>
          <Textarea value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} rows={2} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
          <Button onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
            Solicitar aprovação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function useDemandas(status?: string[]) {
  return useQuery({
    queryKey: ["demandas_extras", status?.join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase.from("demanda_extra" as never).select("*").order("created_at", { ascending: false });
      if (status && status.length) q = q.in("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Demanda[];
    },
  });
}

function FilaAprovacao() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const dQ = useDemandas(["AGUARDANDO_APROVACAO"]);

  async function decidir(id: string, status: "APROVADA" | "REJEITADA") {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("demanda_extra" as never).update({
      status, aprovado_por: userId, aprovado_em: new Date().toISOString(),
    } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "APROVADA" ? "Aprovada" : "Rejeitada");
    qc.invalidateQueries({ queryKey: ["demandas_extras"] });
    qc.invalidateQueries({ queryKey: ["planejamento_cobertura"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aguardando aprovação</CardTitle>
        <CardDescription>{isAdmin ? "Aprove ou rejeite cada solicitação." : "Somente Administrador aprova/reprova."}</CardDescription>
      </CardHeader>
      <CardContent>
        {dQ.isLoading ? <Loader2 className="animate-spin" /> : <TabelaDemandas rows={dQ.data ?? []} acoes={isAdmin ? decidir : undefined} />}
      </CardContent>
    </Card>
  );
}

function Historico() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const dQ = useDemandas();

  async function excluir(id: string) {
    if (!confirm("Excluir esta demanda?")) return;
    const { error } = await supabase.from("demanda_extra" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluída");
    qc.invalidateQueries({ queryKey: ["demandas_extras"] });
    qc.invalidateQueries({ queryKey: ["planejamento_cobertura"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
      <CardContent>
        {dQ.isLoading ? <Loader2 className="animate-spin" /> : <TabelaDemandas rows={dQ.data ?? []} excluir={isAdmin ? excluir : undefined} />}
      </CardContent>
    </Card>
  );
}

function TabelaDemandas({
  rows, acoes, excluir,
}: {
  rows: Demanda[];
  acoes?: (id: string, status: "APROVADA" | "REJEITADA") => void;
  excluir?: (id: string) => void;
}) {
  if (rows.length === 0) return <div className="text-center text-sm text-muted-foreground py-8">Nenhum registro.</div>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Origem</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Qtd</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.origem}</TableCell>
              <TableCell className="font-mono text-xs">{r.sku}</TableCell>
              <TableCell className="text-xs max-w-xs truncate">{r.produto}</TableCell>
              <TableCell className="text-right tabular-nums">{r.quantidade_extra}</TableCell>
              <TableCell className="text-xs">{r.motivo}</TableCell>
              <TableCell className="text-xs">{r.data_inicio} → {r.data_fim}</TableCell>
              <TableCell><Badge className={STATUS_TONES[r.status] ?? ""}>{r.status.replace(/_/g, " ")}</Badge></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {acoes && (<>
                    <Button size="sm" variant="outline" className="text-success" onClick={() => acoes(r.id, "APROVADA")}>
                      <CheckCircle2 className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => acoes(r.id, "REJEITADA")}>
                      <XCircle className="size-3.5" />
                    </Button>
                  </>)}
                  {excluir && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluir(r.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
