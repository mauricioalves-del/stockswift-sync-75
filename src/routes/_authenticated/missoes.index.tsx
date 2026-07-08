import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missoes/")({
  component: MissoesPage,
  head: () => ({ meta: [{ title: "Missões de Inventário" }] }),
});

const TIPOS = ["DIARIA", "SEMANAL", "QUINZENAL", "MENSAL", "EXTRAORDINARIA"];
const STATUS = ["PLANEJADA", "EM_ANDAMENTO", "CONCLUIDA", "ATRASADA", "CANCELADA"];

function MissoesPage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "GERENTE";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Missões de Inventário</h1>
        <p className="text-sm text-muted-foreground">Contagens cíclicas programadas por Grupo, Família, SKU ou Local.</p>
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          {podeGerir && <TabsTrigger value="nova">Nova Missão</TabsTrigger>}
        </TabsList>
        <TabsContent value="lista"><ListaMissoes /></TabsContent>
        {podeGerir && <TabsContent value="nova"><NovaMissao /></TabsContent>}
      </Tabs>
    </div>
  );
}

function ListaMissoes() {
  const { data } = useQuery({
    queryKey: ["missoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("missoes").select("*").order("data_execucao", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Grupo / Família</TableHead>
              <TableHead>Almox</TableHead>
              <TableHead>Execução</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Abrir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma missão cadastrada</TableCell></TableRow>
            )}
            {(data ?? []).map((m) => (
              <TableRow key={m.id} className="cursor-pointer hover:bg-muted/40">
                <TableCell className="font-medium">{m.titulo}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{m.tipo}</Badge></TableCell>
                <TableCell className="text-xs">{[m.grupo, m.familia].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="text-xs">{m.origem || "—"}</TableCell>
                <TableCell className="text-xs">{m.data_execucao ? new Date(m.data_execucao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell><Badge className="text-[10px]">{m.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/missoes/$id" params={{ id: m.id }}>Executar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NovaMissao() {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    titulo: "", descricao: "", tipo: "EXTRAORDINARIA",
    grupo: "", familia: "", origem: "",
    data_execucao: new Date().toISOString().slice(0, 10),
    criterio_abc: "",
  });

  const origensQ = useQuery({
    queryKey: ["origens-ativas-nova-missao"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem, descricao")
        .eq("ativo", true).order("codigo_origem");
      return data ?? [];
    },
  });

  const gruposQ = useQuery({
    queryKey: ["grupos-distintos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("grupo_produtos").select("grupo");
      return Array.from(new Set((data ?? []).map((d: any) => d.grupo).filter(Boolean))) as string[];
    },
  });

  // Reusa a mesma lógica de Contagem: famílias filtradas pelo grupo selecionado
  const familiasQ = useQuery({
    queryKey: ["familias-por-grupo-nova-missao", form.grupo],
    queryFn: async () => {
      if (form.grupo) {
        const { data: cods } = await (supabase as any)
          .from("grupo_produtos").select("codigo_produto").eq("grupo", form.grupo);
        const codes = (cods ?? []).map((c: any) => c.codigo_produto);
        if (codes.length === 0) return [] as string[];
        const { data: fam } = await supabase.from("familias")
          .select("familia").in("codigo_produto", codes);
        return Array.from(new Set((fam ?? []).map((f: any) => f.familia).filter(Boolean))).sort() as string[];
      }
      const { data: fam } = await supabase.from("familias").select("familia");
      return Array.from(new Set((fam ?? []).map((f: any) => f.familia).filter(Boolean))).sort() as string[];
    },
  });

  async function gerar() {
    if (!form.titulo) return toast.error("Informe um título");
    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      // criar missão
      const { data: m, error } = await (supabase as any).from("missoes").insert({
        titulo: form.titulo, descricao: form.descricao, tipo: form.tipo,
        grupo: form.grupo || null, familia: form.familia || null,
        origem: form.origem || null,
        data_execucao: form.data_execucao, criado_por: user.id,
      }).select().single();
      if (error) throw error;

      // gerar itens
      let q = (supabase as any).from("estoque_sistemico").select("id_produto, descricao, lote, quantidade");
      if (form.origem) q = q.eq("origem", form.origem);
      if (form.grupo) {
        const { data: codigos } = await (supabase as any).from("grupo_produtos").select("codigo_produto").eq("grupo", form.grupo);
        const lista = (codigos ?? []).map((c: any) => c.codigo_produto);
        if (lista.length) q = q.in("id_produto", lista);
      }
      if (form.familia) {
        const { data: codigos } = await (supabase as any).from("familias").select("codigo_produto").eq("familia", form.familia);
        const lista = (codigos ?? []).map((c: any) => c.codigo_produto);
        if (lista.length) q = q.in("id_produto", lista);
      }
      if (form.criterio_abc) {
        const { data: abc } = await (supabase as any).from("classificacao_abc").select("codigo_produto").eq("classe", form.criterio_abc);
        const lista = (abc ?? []).map((c: any) => c.codigo_produto);
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

      await (supabase as any).from("audit_logs").insert({
        usuario: user.id, acao: "CRIAR_MISSAO", entidade: "missoes", entidade_id: m.id,
        payload: { ...form, itens_gerados: itens?.length ?? 0 },
      });
      toast.success(`Missão criada com ${itens?.length ?? 0} itens`);
      setForm({ ...form, titulo: "", descricao: "" });
      qc.invalidateQueries({ queryKey: ["missoes"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao criar missão");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Geração de Missão</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Título *</Label>
          <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data de Execução</Label>
          <Input type="date" value={form.data_execucao} onChange={(e) => setForm({ ...form, data_execucao: e.target.value })} />
        </div>
        <div>
          <Label>Grupo</Label>
          <Select value={form.grupo || "__all__"} onValueChange={(v) => setForm({ ...form, grupo: v === "__all__" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(gruposQ.data ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Família (opcional)</Label>
          <Input value={form.familia} onChange={(e) => setForm({ ...form, familia: e.target.value })} placeholder="ex.: Povos da Floresta" />
        </div>
        <div>
          <Label>Local (id_local)</Label>
          <Input value={form.id_local} onChange={(e) => setForm({ ...form, id_local: e.target.value })} />
        </div>
        <div>
          <Label>Almoxarifado</Label>
          <Select value={form.origem || "__all__"} onValueChange={(v) => setForm({ ...form, origem: v === "__all__" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(origensQ.data ?? []).map((o) => (
                <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.descricao || o.codigo_origem}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Critério ABC</Label>
          <Select value={form.criterio_abc || "__none__"} onValueChange={(v) => setForm({ ...form, criterio_abc: v === "__none__" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem filtro ABC</SelectItem>
              <SelectItem value="A">Classe A</SelectItem>
              <SelectItem value="B">Classe B</SelectItem>
              <SelectItem value="C">Classe C</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={gerar} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Criar Missão e Gerar Itens
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
