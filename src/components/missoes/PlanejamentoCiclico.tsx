import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiSelect } from "@/components/ui/multi-select";
import { toast } from "sonner";
import { Loader2, Pencil, Play, Plus } from "lucide-react";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
type Form = { id?: string; nome: string; dias_semana: number[]; familias: string[]; grupos: string[]; origem: string; criterio_abc: string };
const vazio: Form = { nome: "", dias_semana: [], familias: [], grupos: [], origem: "", criterio_abc: "" };
const db = supabase as any;

export function PlanejamentoCiclico() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(vazio);
  const [saving, setSaving] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const planosQ = useQuery({
    queryKey: ["planos-ciclicos"],
    queryFn: async () => {
      const { data, error } = await db.from("planos_contagem_ciclica").select("*").order("nome");
      if (error) throw error;
      return data as any[];
    },
  });
  const familiasQ = useQuery({
    queryKey: ["pc-familias"],
    queryFn: async () => {
      const rows = await fetchAll<any>((f, t) => db.from("familias").select("familia").range(f, t));
      return Array.from(new Set(rows.map((r) => r.familia).filter(Boolean))).sort() as string[];
    },
  });
  const gruposQ = useQuery({
    queryKey: ["pc-grupos"],
    queryFn: async () => {
      const rows = await fetchAll<any>((f, t) => db.from("grupo_produtos").select("grupo").range(f, t));
      return Array.from(new Set(rows.map((r) => r.grupo).filter(Boolean))).sort() as string[];
    },
  });
  const origensQ = useQuery({
    queryKey: ["pc-origens"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem");
      return data ?? [];
    },
  });

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome");
    if (!form.dias_semana.length) return toast.error("Selecione ao menos um dia da semana");
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        dias_semana: [...form.dias_semana].sort(),
        familias: form.familias.length ? form.familias : null,
        grupos: form.grupos.length ? form.grupos : null,
        origem: form.origem || null,
        criterio_abc: form.criterio_abc || null,
      };
      if (form.id) {
        const { error } = await db.from("planos_contagem_ciclica").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        const { error } = await db.from("planos_contagem_ciclica").insert({ ...payload, criado_por: uid });
        if (error) throw error;
      }
      toast.success("Plano salvo");
      setForm(vazio);
      qc.invalidateQueries({ queryKey: ["planos-ciclicos"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: any, ativo: boolean) {
    const { error } = await db.from("planos_contagem_ciclica").update({ ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["planos-ciclicos"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{form.id ? "Editar plano" : "Novo plano cíclico"}</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Dias da semana *</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DIAS.map((d, i) => {
                const on = form.dias_semana.includes(i);
                return (
                  <Button key={d} type="button" size="sm" variant={on ? "default" : "outline"}
                    onClick={() => setForm({ ...form, dias_semana: on ? form.dias_semana.filter((x) => x !== i) : [...form.dias_semana, i] })}>
                    {d}
                  </Button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Famílias</Label>
            <MultiSelect options={(familiasQ.data ?? []).map((f) => ({ value: f, label: f }))}
              value={form.familias} onChange={(v: string[]) => setForm({ ...form, familias: v })}
              placeholder="Selecionar famílias…" allLabel="Nenhuma" />
          </div>
          <div>
            <Label>Grupos</Label>
            <MultiSelect options={(gruposQ.data ?? []).map((g) => ({ value: g, label: g }))}
              value={form.grupos} onChange={(v: string[]) => setForm({ ...form, grupos: v })}
              placeholder="Selecionar grupos…" allLabel="Nenhum" />
          </div>
          <div>
            <Label>Almoxarifado</Label>
            <Select value={form.origem || "__all__"} onValueChange={(v) => setForm({ ...form, origem: v === "__all__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(origensQ.data ?? []).map((o: any) => (
                  <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.descricao || o.codigo_origem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Critério ABC</Label>
            <Select value={form.criterio_abc || "__all__"} onValueChange={(v) => setForm({ ...form, criterio_abc: v === "__all__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="A">Classe A</SelectItem>
                <SelectItem value="B">Classe B</SelectItem>
                <SelectItem value="C">Classe C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            {form.id && <Button variant="outline" onClick={() => setForm(vazio)}>Cancelar</Button>}
            <Button onClick={salvar} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {form.id ? "Salvar alterações" : "Criar plano"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Grupos / Famílias</TableHead>
                <TableHead>Almox</TableHead>
                <TableHead>ABC</TableHead>
                <TableHead>Última execução</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(planosQ.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhum plano cadastrado</TableCell></TableRow>
              )}
              {(planosQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="text-xs">{(p.dias_semana ?? []).map((d: number) => DIAS[d]).join(", ")}</TableCell>
                  <TableCell className="text-xs max-w-xs">
                    {[...(p.grupos ?? []), ...(p.familias ?? [])].join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{p.origem || "Todos"}</TableCell>
                  <TableCell>{p.criterio_abc ? <Badge variant="outline">{p.criterio_abc}</Badge> : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {p.ultima_execucao ? new Date(p.ultima_execucao + "T12:00:00").toLocaleDateString("pt-BR") : "Nunca"}
                  </TableCell>
                  <TableCell><Switch checked={p.ativo} onCheckedChange={(v) => toggle(p, v)} /></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" aria-label="Editar plano" onClick={() => setForm({
                      id: p.id, nome: p.nome, dias_semana: p.dias_semana ?? [], familias: p.familias ?? [],
                      grupos: p.grupos ?? [], origem: p.origem ?? "", criterio_abc: p.criterio_abc ?? "",
                    })}><Pencil className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
