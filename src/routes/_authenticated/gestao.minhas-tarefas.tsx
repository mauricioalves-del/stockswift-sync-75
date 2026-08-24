import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestao/minhas-tarefas")({
  component: MinhasTarefasPage,
  head: () => ({ meta: [{ title: "Minhas Tarefas" }] }),
});

function MinhasTarefasPage() {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const meuIdQ = useQuery({
    queryKey: ["my-uid"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const tarefasQ = useQuery({
    queryKey: ["minhas_tarefas", meuIdQ.data],
    queryFn: async () => {
      if (!meuIdQ.data) return [];
      const { data } = await (supabase as any).from("tarefas_operacionais")
        .select("*, tipos_tarefa(nome), modelos_checklist(nome)")
        .eq("responsavel_id", meuIdQ.data)
        .in("status", ["Pendente", "EmAndamento", "Atrasada"])
        .order("data_prevista", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!meuIdQ.data,
  });

  const atrasadas = (tarefasQ.data ?? []).filter((t: any) => t.data_prevista && t.data_prevista < hoje);
  const doDia = (tarefasQ.data ?? []).filter((t: any) => !atrasadas.includes(t));

  return (
    <div className="w-full space-y-4 pb-20">
      <div>
        <h1 className="text-2xl font-bold">Minhas Tarefas</h1>
        <p className="text-sm text-muted-foreground">O que você tem que fazer hoje.</p>
      </div>

      {atrasadas.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            <h2 className="font-semibold text-sm">Atrasadas ({atrasadas.length})</h2>
          </div>
          {atrasadas.map((t: any) => <TarefaCard key={t.id} tarefa={t} atrasada onDone={() => qc.invalidateQueries({ queryKey: ["minhas_tarefas"] })} />)}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground">Hoje / Próximas ({doDia.length})</h2>
        {doDia.length === 0 && atrasadas.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Nada pendente 🎉</CardContent></Card>
        )}
        {doDia.map((t: any) => <TarefaCard key={t.id} tarefa={t} onDone={() => qc.invalidateQueries({ queryKey: ["minhas_tarefas"] })} />)}
      </section>
    </div>
  );
}

function TarefaCard({ tarefa, atrasada, onDone }: { tarefa: any; atrasada?: boolean; onDone: () => void }) {
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const itensQ = useQuery({
    queryKey: ["checklist_exec", tarefa.id],
    queryFn: async () => {
      if (!tarefa.checklist_modelo_id) return [];
      const { data } = await (supabase as any).from("checklist_execucao")
        .select("*, modelos_checklist_itens(descricao_item, ordem)")
        .eq("tarefa_id", tarefa.id);
      return ((data ?? []) as any[]).sort((a, b) =>
        (a.modelos_checklist_itens?.ordem ?? 0) - (b.modelos_checklist_itens?.ordem ?? 0));
    },
    enabled: !!tarefa.checklist_modelo_id,
  });

  async function toggleItem(id: string, marcado: boolean) {
    const user = (await supabase.auth.getUser()).data.user!;
    await (supabase as any).from("checklist_execucao").update({
      marcado, marcado_por: user.id, marcado_em: marcado ? new Date().toISOString() : null,
    }).eq("id", id);
    itensQ.refetch();
  }

  async function concluir() {
    setBusy(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      const { error } = await (supabase as any).from("tarefas_operacionais").update({
        status: "Concluida", concluido_por: user.id, concluido_em: new Date().toISOString(),
        observacao: obs || null,
      }).eq("id", tarefa.id);
      if (error) throw error;

      // recorrência: cria próxima instância
      if (tarefa.recorrencia && tarefa.recorrencia !== "Unica") {
        const dias: Record<string, number> = { Diaria: 1, Semanal: 7, Quinzenal: 15, Mensal: 30 };
        const inc = dias[tarefa.recorrencia] ?? 0;
        if (inc && tarefa.data_prevista) {
          const d = new Date(tarefa.data_prevista + "T00:00:00");
          d.setDate(d.getDate() + inc);
          await (supabase as any).from("tarefas_operacionais").insert({
            tipo_id: tarefa.tipo_id, titulo: tarefa.titulo, descricao: tarefa.descricao,
            prioridade: tarefa.prioridade, data_prevista: d.toISOString().slice(0, 10),
            recorrencia: tarefa.recorrencia, responsavel_tipo: tarefa.responsavel_tipo,
            responsavel_id: tarefa.responsavel_id, responsavel_label: tarefa.responsavel_label,
            loja_setor: tarefa.loja_setor, grupo_produto: tarefa.grupo_produto,
            familia: tarefa.familia, sku_ou_local: tarefa.sku_ou_local,
            checklist_modelo_id: tarefa.checklist_modelo_id,
            criado_por: user.id, tarefa_origem_id: tarefa.id,
          });
        }
      }
      toast.success("Tarefa concluída");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={atrasada ? "border-destructive/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{tarefa.titulo}</CardTitle>
            <div className="flex flex-wrap gap-1 mt-1">
              {tarefa.tipos_tarefa && <Badge variant="outline" className="text-[10px]">{tarefa.tipos_tarefa.nome}</Badge>}
              <Badge variant={tarefa.prioridade === "Alta" ? "destructive" : "secondary"} className="text-[10px]">{tarefa.prioridade}</Badge>
              {tarefa.data_prevista && (
                <Badge variant="outline" className="text-[10px]">
                  {new Date(tarefa.data_prevista + "T00:00:00").toLocaleDateString("pt-BR")}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tarefa.descricao && <p className="text-sm text-muted-foreground">{tarefa.descricao}</p>}
        {(itensQ.data ?? []).length > 0 && (
          <div className="space-y-1.5 border-t pt-2">
            {(itensQ.data ?? []).map((it: any) => (
              <label key={it.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={it.marcado} onCheckedChange={(v) => toggleItem(it.id, !!v)} />
                <span className={it.marcado ? "line-through text-muted-foreground" : ""}>
                  {it.modelos_checklist_itens?.descricao_item}
                </span>
              </label>
            ))}
          </div>
        )}
        <Textarea placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
        <Button onClick={concluir} disabled={busy} className="w-full gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Concluir
        </Button>
      </CardContent>
    </Card>
  );
}
