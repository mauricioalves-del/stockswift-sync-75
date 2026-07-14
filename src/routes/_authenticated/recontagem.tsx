import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { acuracidadeColor, formatNum } from "@/lib/inventory";
import { aprovarRecontagem, gerarMissaoRecontagem, type RecontagemRow } from "@/lib/recontagem";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recontagem")({
  component: RecontagemPage,
  head: () => ({ meta: [{ title: "Recontagem" }] }),
});

function RecontagemPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["recontagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recontagem")
        .select("*")
        .in("status", ["PENDENTE_RECONTAGEM", "RECONTAGEM_OBRIGATORIA"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecontagemRow[];
    },
  });

  async function aprovar(r: RecontagemRow) {
    try {
      await aprovarRecontagem(r);
      toast.success("Contagem aprovada — estoque sistêmico ajustado");
      qc.invalidateQueries({ queryKey: ["recontagem"] });
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["missao-itens"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao aprovar");
    }
  }

  async function solicitarRecontagem(r: RecontagemRow) {
    try {
      const missaoId = await gerarMissaoRecontagem(r);
      toast.success("Nova missão de recontagem criada");
      qc.invalidateQueries({ queryKey: ["recontagem"] });
      qc.invalidateQueries({ queryKey: ["missoes"] });
      navigate({ to: "/missoes/$id", params: { id: missaoId } });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao gerar recontagem");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fila de Recontagem</h1>
        <p className="text-sm text-muted-foreground">Itens fora da faixa de tolerância 95%–105% aguardando decisão do supervisor</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="text-right">Contagem</TableHead>
                <TableHead className="text-right">Acuracidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Nenhum item pendente de recontagem 🎉</TableCell></TableRow>
              )}
              {(data ?? []).map((r) => {
                const cor = acuracidadeColor(r.acuracidade != null ? Number(r.acuracidade) : null);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.id_local || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.descricao}</TableCell>
                    <TableCell className="font-mono text-xs">{r.lote || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(Number(r.saldo_sistema))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(Number(r.contagem))}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded font-semibold text-xs ${cor.bg} ${cor.text}`}>{cor.label}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "PENDENTE_RECONTAGEM" ? "destructive" : "secondary"} className="text-[10px]">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => solicitarRecontagem(r)}>
                          <RotateCcw className="size-3.5 mr-1" /> Recontagem
                        </Button>
                        <Button size="sm" onClick={() => aprovar(r)}>
                          <CheckCircle2 className="size-3.5 mr-1" /> Aprovar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

