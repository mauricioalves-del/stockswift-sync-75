import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/abastecimento/parametros")({
  component: ParametrosPage,
  head: () => ({ meta: [{ title: "Parâmetros de Abastecimento" }] }),
});

type Parametro = {
  id: string;
  origem: string;
  origem_abastecimento: string;
  cobertura_dias: number;
  dias_seguranca: number;
  frequencia_abastecimento: string;
  ativo: boolean;
};

function ParametrosPage() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const [novaOrigem, setNovaOrigem] = useState("");

  const paramsQ = useQuery({
    queryKey: ["parametros_abastecimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_abastecimento" as never)
        .select("*")
        .order("origem");
      if (error) throw error;
      return (data ?? []) as unknown as Parametro[];
    },
  });

  const origensQ = useQuery({
    queryKey: ["origens_disponiveis_param"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem").order("codigo_origem");
      return (data ?? []).map((o) => o.codigo_origem);
    },
  });

  async function criar() {
    if (!novaOrigem) return;
    const { error } = await supabase.from("parametros_abastecimento" as never).insert({
      origem: novaOrigem,
      origem_abastecimento: "Alm_SP_Fabrica",
      cobertura_dias: 8,
      dias_seguranca: 1,
      frequencia_abastecimento: "SEMANAL",
      ativo: true,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Almox habilitado");
    setNovaOrigem("");
    qc.invalidateQueries({ queryKey: ["parametros_abastecimento"] });
  }

  async function salvar(p: Parametro) {
    const { error } = await supabase
      .from("parametros_abastecimento" as never)
      .update({
        origem_abastecimento: p.origem_abastecimento,
        cobertura_dias: p.cobertura_dias,
        dias_seguranca: p.dias_seguranca,
        frequencia_abastecimento: p.frequencia_abastecimento,
        ativo: p.ativo,
      } as never)
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Parâmetro atualizado");
    qc.invalidateQueries({ queryKey: ["parametros_abastecimento"] });
  }

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  const origensExistentes = new Set((paramsQ.data ?? []).map((p) => p.origem));
  const origensLivres = (origensQ.data ?? []).filter((o) => !origensExistentes.has(o));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="size-6" /> Parâmetros de Abastecimento
        </h1>
        <p className="text-sm text-muted-foreground">
          Cobertura desejada, dias de segurança e frequência de reposição por almoxarifado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="size-4" /> Habilitar novo almoxarifado
          </CardTitle>
          <CardDescription>Selecione um almox para participar do planejamento de cobertura.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Select value={novaOrigem} onValueChange={setNovaOrigem}>
            <SelectTrigger className="sm:w-80"><SelectValue placeholder="Selecione um almox…" /></SelectTrigger>
            <SelectContent>
              {origensLivres.length === 0
                ? <div className="px-3 py-2 text-xs text-muted-foreground">Todos os almox já estão habilitados</div>
                : origensLivres.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={criar} disabled={!novaOrigem}><Plus className="size-4 mr-1" /> Habilitar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Almoxarifados habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          {paramsQ.isLoading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem (Destino)</TableHead>
                    <TableHead className="w-56">Origem de Abastecimento</TableHead>
                    <TableHead className="w-32">Cobertura (dias)</TableHead>
                    <TableHead className="w-32">Segurança (dias)</TableHead>
                    <TableHead className="w-40">Frequência</TableHead>
                    <TableHead className="w-24">Ativo</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paramsQ.data ?? []).map((p) => (
                    <LinhaParam key={p.id} p={p} onSalvar={salvar} origens={origensQ.data ?? []} />
                  ))}
                  {(paramsQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">
                      Nenhum almox habilitado.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaParam({ p, onSalvar }: { p: Parametro; onSalvar: (p: Parametro) => void }) {
  const [local, setLocal] = useState(p);
  return (
    <TableRow>
      <TableCell className="font-medium">{p.origem}</TableCell>
      <TableCell>
        <Input type="number" min={1} value={local.cobertura_dias}
          onChange={(e) => setLocal({ ...local, cobertura_dias: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Input type="number" min={0} value={local.dias_seguranca}
          onChange={(e) => setLocal({ ...local, dias_seguranca: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Select value={local.frequencia_abastecimento} onValueChange={(v) => setLocal({ ...local, frequencia_abastecimento: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="DIARIA">Diária</SelectItem>
            <SelectItem value="SEMANAL">Semanal</SelectItem>
            <SelectItem value="QUINZENAL">Quinzenal</SelectItem>
            <SelectItem value="MENSAL">Mensal</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch checked={local.ativo} onCheckedChange={(v) => setLocal({ ...local, ativo: v })} />
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={() => onSalvar(local)}><Save className="size-3.5" /></Button>
      </TableCell>
    </TableRow>
  );
}
