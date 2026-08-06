import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, CalendarRange, Loader2, Trash2 } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/config/sazonalidade")({
  component: SazonalidadePage,
  head: () => ({ meta: [{ title: "Sazonalidade" }] }),
});

type Periodo = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  recorrente_anual: boolean;
  escopo_tipo: "EMPRESA" | "GRUPO" | "FAMILIA" | "SKU";
  escopo_valor: string | null;
  indice_multiplicador: number;
  origem_indice: "MANUAL" | "AUTOMATICO";
  ativo: boolean;
};

const ESCOPO_LABEL: Record<string, string> = { EMPRESA: "Empresa", GRUPO: "Grupo", FAMILIA: "Família", SKU: "SKU" };

function SazonalidadePage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    data_inicio: new Date().toISOString().slice(0, 10),
    data_fim: new Date().toISOString().slice(0, 10),
    recorrente_anual: false,
    escopo_tipo: "EMPRESA" as Periodo["escopo_tipo"],
    escopo_valor: "",
    indice_multiplicador: 1.2,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["periodos_sazonais"],
    queryFn: async () => {
      const { data, error } = await (supabase as never as { from: (t: string) => { select: (c: string) => { order: (col: string) => Promise<{ data: Periodo[] | null; error: Error | null }> } } })
        .from("periodos_sazonais").select("*").order("data_inicio");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add() {
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    if (form.data_fim < form.data_inicio) return toast.error("Data final antes da inicial");
    if (form.escopo_tipo !== "EMPRESA" && !form.escopo_valor.trim()) return toast.error("Informe o valor do escopo");
    if (!(form.indice_multiplicador > 0)) return toast.error("Índice deve ser > 0");
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as never as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: Error | null }> } })
      .from("periodos_sazonais").insert({
        nome: form.nome.trim(),
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        recorrente_anual: form.recorrente_anual,
        escopo_tipo: form.escopo_tipo,
        escopo_valor: form.escopo_tipo === "EMPRESA" ? null : form.escopo_valor.trim(),
        indice_multiplicador: form.indice_multiplicador,
        origem_indice: "MANUAL",
        ativo: true,
        criado_por: uid,
      });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Período cadastrado");
    setForm({ ...form, nome: "", escopo_valor: "" });
    qc.invalidateQueries({ queryKey: ["periodos_sazonais"] });
  }

  async function toggle(id: string, ativo: boolean) {
    const { error } = await (supabase as never as { from: (t: string) => { update: (r: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } } })
      .from("periodos_sazonais").update({ ativo }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["periodos_sazonais"] });
  }

  async function remover(id: string) {
    if (!confirm("Excluir período?")) return;
    const { error } = await (supabase as never as { from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } } })
      .from("periodos_sazonais").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["periodos_sazonais"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarRange className="size-6" /> Sazonalidade</h1>
        <p className="text-sm text-muted-foreground">
          Períodos com maior/menor demanda que ajustam o CMD e o Mín/Ideal/Máx do Abastecimento.
        </p>
      </div>

      {podeGerir && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Período</CardTitle>
            <CardDescription>
              Índice &gt; 1 aumenta a demanda esperada (ex.: 1.30 = +30%). Índice &lt; 1 reduz (ex.: 0.7 = −30%).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Páscoa, Dia das Mães, Natal…" />
            </div>
            <div>
              <Label className="text-xs">Índice multiplicador</Label>
              <Input type="number" step="0.05" min={0.1} value={form.indice_multiplicador}
                onChange={(e) => setForm({ ...form, indice_multiplicador: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Data início</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Data fim</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={form.recorrente_anual} onCheckedChange={(v) => setForm({ ...form, recorrente_anual: v })} />
              <Label className="text-xs">Recorrente todo ano</Label>
            </div>
            <div>
              <Label className="text-xs">Escopo</Label>
              <Select value={form.escopo_tipo} onValueChange={(v) => setForm({ ...form, escopo_tipo: v as Periodo["escopo_tipo"], escopo_valor: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPRESA">Empresa (todos os SKUs)</SelectItem>
                  <SelectItem value="GRUPO">Grupo de produto</SelectItem>
                  <SelectItem value="FAMILIA">Família</SelectItem>
                  <SelectItem value="SKU">SKU específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Valor do escopo</Label>
              <Input
                value={form.escopo_valor}
                disabled={form.escopo_tipo === "EMPRESA"}
                onChange={(e) => setForm({ ...form, escopo_valor: e.target.value })}
                placeholder={form.escopo_tipo === "EMPRESA" ? "—" : `Informe o ${ESCOPO_LABEL[form.escopo_tipo]?.toLowerCase()}`}
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={add} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" /> Cadastrar</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Períodos cadastrados</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Escopo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Índice</TableHead>
                <TableHead className="text-center">Recorrente</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                {podeGerir && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {(data ?? []).map((p) => {
                const efeito = p.indice_multiplicador > 1 ? "text-success" : p.indice_multiplicador < 1 ? "text-destructive" : "";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{ESCOPO_LABEL[p.escopo_tipo]}</Badge>
                      {p.escopo_valor && <span className="ml-1 font-mono">{p.escopo_valor}</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(p.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")} → {new Date(p.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${efeito}`}>
                      {p.indice_multiplicador.toFixed(2)}×
                    </TableCell>
                    <TableCell className="text-center">{p.recorrente_anual ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={p.ativo} onCheckedChange={(v) => toggle(p.id, v)} disabled={!podeGerir} />
                    </TableCell>
                    {podeGerir && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => remover(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum período cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
