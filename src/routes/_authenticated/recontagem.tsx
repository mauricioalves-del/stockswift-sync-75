import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { acuracidadeColor, formatBRL, formatNum } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recontagem")({
  component: RecontagemPage,
  head: () => ({ meta: [{ title: "Recontagem" }] }),
});

function RecontagemPage() {
  const qc = useQueryClient();
  const { isAdmin } = useRole();

  const { data } = useQuery({
    queryKey: ["recontagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventario")
        .select("*")
        .in("status", ["RECONTAGEM_NECESSARIA", "AGUARDANDO_APROVACAO"])
        .order("data_contagem", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function aprovar(id: string) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("inventario")
      .update({ status: "APROVADO", aprovado_por: userId, aprovado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Aprovado");
    await supabase.from("audit_logs").insert({ usuario: userId, acao: "APROVAR_CONTAGEM", entidade: "inventario", entidade_id: id });
    qc.invalidateQueries({ queryKey: ["recontagem"] });
    qc.invalidateQueries({ queryKey: ["inventario"] });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fila de Recontagem</h1>
        <p className="text-sm text-muted-foreground">Itens com acuracidade abaixo de 97% ou aguardando aprovação</p>
      </div>

      <div className="grid gap-3">
        {data?.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum item pendente de recontagem 🎉</CardContent></Card>}
        {data?.map((r) => {
          const ac = acuracidadeColor(r.acuracidade ? Number(r.acuracidade) : null);
          const aguardando = r.status === "AGUARDANDO_APROVACAO";
          return (
            <Card key={r.id} className={aguardando ? "border-info/40" : "border-destructive/30"}>
              <CardHeader>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{r.descricao || r.id_produto}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {r.id_produto} · Lote {r.lote || "—"} · {r.id_local} · Contagem #{r.contagem_numero}
                    </CardDescription>
                  </div>
                  <Badge variant={aguardando ? "default" : "destructive"} className="flex items-center gap-1">
                    {aguardando ? <CheckCircle2 className="size-3" /> : <RotateCcw className="size-3" />}
                    {aguardando ? "Aguardando aprovação" : "Recontagem necessária"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <Cell label="Sistêmico" v={formatNum(Number(r.saldo_sistemico))} />
                <Cell label="Contado" v={formatNum(Number(r.quantidade_contada))} />
                <Cell label="Divergência" v={formatNum(Number(r.divergencia))} />
                <Cell label="R$ Divergência" v={formatBRL(Number(r.valor_divergencia))} />
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Acuracidade</div>
                  <span className={`inline-flex mt-1 px-2 py-0.5 rounded font-semibold ${ac.bg} ${ac.text}`}>{ac.label}</span>
                </div>
                {aguardando && isAdmin && (
                  <div className="col-span-full flex justify-end">
                    <Button onClick={() => aprovar(r.id)}><CheckCircle2 className="size-4 mr-1.5" /> Aprovar contagem</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}
