import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatNum } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/suprimentos/requisicoes/$id")({
  component: RequisicaoDetalhePage,
  head: () => ({ meta: [{ title: "Detalhe da Requisição" }] }),
});

type Req = {
  id: string; numero: string; origem_solicitante: string; origem_fornecedora: string;
  tipo: string; status: string; valor_total: number; observacao: string | null;
  motivo_rejeicao: string | null; created_at: string;
};
type Item = {
  id: string; requisicao_id: string; id_produto: string; descricao: string; unidade: string;
  quantidade_solicitada: number; quantidade_aprovada: number | null; quantidade_atendida: number | null;
  custo_unitario: number; valor_total: number; observacao: string | null;
};

function RequisicaoDetalhePage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const reqQ = useQuery({
    queryKey: ["requisicao", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requisicoes" as never).select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Req;
    },
  });

  const itensQ = useQuery({
    queryKey: ["requisicao_itens", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requisicao_itens" as never).select("*").eq("requisicao_id", id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });

  const [sku, setSku] = useState("");
  const [desc, setDesc] = useState("");
  const [un, setUn] = useState("UN");
  const [qtd, setQtd] = useState("");
  const [cu, setCu] = useState("");

  const buscarSku = async (valor: string) => {
    setSku(valor);
    if (valor.length < 3) return;
    const { data } = await supabase.from("estoque_sistemico")
      .select("descricao, unidade, custo_unitario").eq("id_produto", valor).limit(1);
    if (data && data[0]) {
      setDesc(data[0].descricao ?? "");
      setUn(data[0].unidade ?? "UN");
      setCu(String(data[0].custo_unitario ?? ""));
    }
  };

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("requisicao_itens" as never).insert({
        requisicao_id: id, id_produto: sku, descricao: desc, unidade: un,
        quantidade_solicitada: Number(qtd), custo_unitario: Number(cu || 0),
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Item adicionado");
      setSku(""); setDesc(""); setQtd(""); setCu("");
      await recomputeTotal();
      qc.invalidateQueries({ queryKey: ["requisicao_itens", id] });
      qc.invalidateQueries({ queryKey: ["requisicao", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("requisicao_itens" as never).delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await recomputeTotal();
      qc.invalidateQueries({ queryKey: ["requisicao_itens", id] });
      qc.invalidateQueries({ queryKey: ["requisicao", id] });
    },
  });

  async function recomputeTotal() {
    const { data } = await supabase.from("requisicao_itens" as never).select("valor_total").eq("requisicao_id", id);
    const total = (data ?? []).reduce((s: number, x: { valor_total: number }) => s + Number(x.valor_total ?? 0), 0);
    await supabase.from("requisicoes" as never).update({ valor_total: total } as never).eq("id", id);
  }

  const enviar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("requisicoes" as never).update({ status: "ENVIADA" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Requisição enviada para aprovação");
      qc.invalidateQueries({ queryKey: ["requisicao", id] });
      qc.invalidateQueries({ queryKey: ["requisicoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (reqQ.isLoading) return <Loader2 className="animate-spin" />;
  const r = reqQ.data;
  if (!r) return <div>Requisição não encontrada.</div>;

  const canEdit = r.status === "RASCUNHO";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/suprimentos/requisicoes"><ArrowLeft className="size-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Requisição {r.numero}</h1>
        <Badge>{r.status}</Badge>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Origem (fornecedor)</div><div className="font-medium">{r.origem_fornecedora}</div></div>
          <div><div className="text-xs text-muted-foreground">Destino (solicitante)</div><div className="font-medium">{r.origem_solicitante}</div></div>
          <div><div className="text-xs text-muted-foreground">Tipo</div><div className="font-medium">{r.tipo}</div></div>
          <div><div className="text-xs text-muted-foreground">Valor total</div><div className="font-medium">{formatBRL(Number(r.valor_total ?? 0))}</div></div>
          {r.observacao && <div className="col-span-full"><div className="text-xs text-muted-foreground">Observação</div><div>{r.observacao}</div></div>}
          {r.motivo_rejeicao && <div className="col-span-full"><div className="text-xs text-destructive">Motivo da rejeição</div><div>{r.motivo_rejeicao}</div></div>}
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Adicionar item</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs">SKU</Label>
              <Input value={sku} onChange={(e) => buscarSku(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Un.</Label>
              <Input value={un} onChange={(e) => setUn(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Qtd</Label>
              <Input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Custo unit.</Label>
              <Input type="number" step="0.01" value={cu} onChange={(e) => setCu(e.target.value)} />
            </div>
            <Button className="md:col-span-5" disabled={!sku || !qtd || addItem.isPending} onClick={() => addItem.mutate()}>
              <Plus className="size-4 mr-1" /> Adicionar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent>
          {itensQ.isLoading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {canEdit && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {(itensQ.data ?? []).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.id_produto}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{i.descricao}</TableCell>
                      <TableCell className="text-xs">{i.unidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(i.quantidade_solicitada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(Number(i.custo_unitario))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatBRL(Number(i.valor_total))}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => delItem.mutate(i.id)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(itensQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-sm text-muted-foreground py-6">Nenhum item.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (itensQ.data ?? []).length > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending}>
            <Send className="size-4 mr-1" /> Enviar para aprovação
          </Button>
        </div>
      )}
    </div>
  );
}
