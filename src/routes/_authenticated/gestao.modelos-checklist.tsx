import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestao/modelos-checklist")({
  component: ModelosPage,
  head: () => ({ meta: [{ title: "Modelos de Checklist" }] }),
});

function ModelosPage() {
  const qc = useQueryClient();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState("");

  const tiposQ = useQuery({
    queryKey: ["tipos_tarefa_mc"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipos_tarefa").select("*").eq("ativo", true).order("ordem");
      return (data ?? []) as any[];
    },
  });

  const modelosQ = useQuery({
    queryKey: ["modelos_checklist_all"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("modelos_checklist")
        .select("*, tipos_tarefa(nome)")
        .order("nome");
      return (data ?? []) as any[];
    },
  });

  async function criar() {
    if (!novoNome) return toast.error("Informe o nome");
    const { error } = await (supabase as any).from("modelos_checklist").insert({
      nome: novoNome, tipo_tarefa_id: novoTipo || null,
    });
    if (error) return toast.error(error.message);
    setNovoNome(""); setNovoTipo("");
    qc.invalidateQueries({ queryKey: ["modelos_checklist_all"] });
  }

  async function excluir(id: string) {
    if (!confirm("Excluir modelo?")) return;
    const { error } = await (supabase as any).from("modelos_checklist").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["modelos_checklist_all"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Modelos de Checklist</h1>
        <p className="text-sm text-muted-foreground">Checklists reutilizáveis por tipo de tarefa.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Novo modelo</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Nome</Label>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: Organização de Seção — Padrão" />
          </div>
          <div>
            <Label>Tipo de Tarefa</Label>
            <Select value={novoTipo || "__none__"} onValueChange={(v) => setNovoTipo(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— qualquer —</SelectItem>
                {(tiposQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={criar} className="gap-2 w-full"><Plus className="size-4" />Criar</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(modelosQ.data ?? []).map((m: any) => (
          <ModeloCard key={m.id} modelo={m} onDelete={() => excluir(m.id)} />
        ))}
        {(modelosQ.data ?? []).length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum modelo cadastrado</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function ModeloCard({ modelo, onDelete }: { modelo: any; onDelete: () => void }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);

  const itensQ = useQuery({
    queryKey: ["modelo_itens", modelo.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("modelos_checklist_itens")
        .select("*").eq("modelo_id", modelo.id).order("ordem");
      return (data ?? []) as any[];
    },
  });

  async function addItem() {
    if (!novo) return;
    setBusy(true);
    const ordem = (itensQ.data ?? []).length + 1;
    const { error } = await (supabase as any).from("modelos_checklist_itens").insert({
      modelo_id: modelo.id, descricao_item: novo, ordem,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNovo("");
    qc.invalidateQueries({ queryKey: ["modelo_itens", modelo.id] });
  }

  async function delItem(id: string) {
    await (supabase as any).from("modelos_checklist_itens").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["modelo_itens", modelo.id] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{modelo.nome}</CardTitle>
          {modelo.tipos_tarefa && <p className="text-xs text-muted-foreground">{modelo.tipos_tarefa.nome}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(itensQ.data ?? []).map((it: any, idx: number) => (
          <div key={it.id} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-5">{idx + 1}.</span>
            <span className="flex-1">{it.descricao_item}</span>
            <Button size="sm" variant="ghost" onClick={() => delItem(it.id)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        <div className="flex gap-2 pt-2 border-t">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item do checklist" onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <Button onClick={addItem} disabled={busy} size="sm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
