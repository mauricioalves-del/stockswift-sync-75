import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/suprimentos/fefo/config")({
  component: ConfigFefoPage,
  head: () => ({
    meta: [
      { title: "Configurações do Controle FEFO" },
      { name: "description", content: "Cadastro do mapa de almoxarifados e das exceções aprovadas de FEFO." },
      { property: "og:title", content: "Configurações do Controle FEFO" },
      { property: "og:description", content: "Mantenha o de-para de almoxarifados e as exceções de FEFO sem depender de código." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Mapa = { id: string; nome: string; codigo: string; ativo: boolean };
type Excecao = { id: string; id_produto: string; lote_mais_antigo: string; motivo: string | null };

function ConfigFefoPage() {
  const { canWrite } = useRole();
  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <div className="w-full space-y-4">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to="/suprimentos/fefo"><ArrowLeft className="size-4 mr-1" /> Controle FEFO</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold">Configurações do Controle FEFO</h1>
        <p className="text-sm text-muted-foreground">De-para de almoxarifados e exceções aprovadas — usados pelo processamento automático diário.</p>
      </div>

      <Tabs defaultValue="mapa">
        <TabsList>
          <TabsTrigger value="mapa">Mapa de Almoxarifados</TabsTrigger>
          <TabsTrigger value="excecoes">Exceções de FEFO</TabsTrigger>
        </TabsList>
        <TabsContent value="mapa"><MapaTab /></TabsContent>
        <TabsContent value="excecoes"><ExcecoesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function MapaTab() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");

  const q = useQuery({
    queryKey: ["mapa-almoxarifados"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mapa_almoxarifados").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Mapa[];
    },
  });

  async function add() {
    if (!nome.trim() || !codigo.trim()) return toast.error("Preencha nome e código");
    const { error } = await (supabase as any).from("mapa_almoxarifados").insert({ nome: nome.trim(), codigo: codigo.trim() });
    if (error) return toast.error(error.message);
    setNome(""); setCodigo("");
    toast.success("Almoxarifado mapeado");
    qc.invalidateQueries({ queryKey: ["mapa-almoxarifados"] });
  }

  async function salvar(r: Mapa, patch: Partial<Mapa>) {
    const { error } = await (supabase as any).from("mapa_almoxarifados").update(patch).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    qc.invalidateQueries({ queryKey: ["mapa-almoxarifados"] });
  }

  async function excluir(id: string) {
    const { error } = await (supabase as any).from("mapa_almoxarifados").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mapa-almoxarifados"] });
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Mapa de Almoxarifados</CardTitle>
        <CardDescription>Traduz o nome usado na planilha (Desc_Almox) para o código do estoque (Origem).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-56">
            <label className="text-xs text-muted-foreground">Nome na planilha</label>
            <Input className="h-9" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Almox - SP Fabrica" />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">Código no estoque</label>
            <Input className="h-9" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Alm_SP_Fabrica" />
          </div>
          <Button onClick={add}><Plus className="size-4 mr-1" /> Adicionar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow><TableHead>Nome na planilha</TableHead><TableHead>Código</TableHead><TableHead className="w-24 text-right">Ações</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((r) => <LinhaMapa key={r.id} r={r} onSave={salvar} onDelete={excluir} />)}
            {q.data?.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum mapeamento</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LinhaMapa({ r, onSave, onDelete }: { r: Mapa; onSave: (r: Mapa, p: Partial<Mapa>) => void; onDelete: (id: string) => void }) {
  const [nome, setNome] = useState(r.nome);
  const [codigo, setCodigo] = useState(r.codigo);
  const dirty = nome !== r.nome || codigo !== r.codigo;
  return (
    <TableRow>
      <TableCell><Input className="h-8" value={nome} onChange={(e) => setNome(e.target.value)} /></TableCell>
      <TableCell><Input className="h-8 font-mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          {dirty && <Button size="sm" variant="secondary" onClick={() => onSave(r, { nome, codigo })}><Save className="size-3.5" /></Button>}
          <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}><Trash2 className="size-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ExcecoesTab() {
  const qc = useQueryClient();
  const [produto, setProduto] = useState("");
  const [lote, setLote] = useState("");
  const [motivo, setMotivo] = useState("");

  const q = useQuery({
    queryKey: ["excecoes-fefo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("excecoes_fefo").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Excecao[];
    },
  });

  async function add() {
    if (!produto.trim() || !lote.trim()) return toast.error("Preencha produto e lote");
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await (supabase as any).from("excecoes_fefo").insert({
      id_produto: produto.trim(), lote_mais_antigo: lote.trim(), motivo: motivo.trim() || null, criado_por: uid,
    });
    if (error) return toast.error(error.message);
    setProduto(""); setLote(""); setMotivo("");
    toast.success("Exceção cadastrada");
    qc.invalidateQueries({ queryKey: ["excecoes-fefo"] });
  }

  async function excluir(id: string) {
    const { error } = await (supabase as any).from("excecoes_fefo").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["excecoes-fefo"] });
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Exceções de FEFO</CardTitle>
        <CardDescription>Pares produto + lote mais antigo aprovados manualmente: deixam de ser contados como quebra.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-40">
            <label className="text-xs text-muted-foreground">Produto (SKU)</label>
            <Input className="h-9 font-mono" value={produto} onChange={(e) => setProduto(e.target.value)} />
          </div>
          <div className="min-w-40">
            <label className="text-xs text-muted-foreground">Lote mais antigo</label>
            <Input className="h-9 font-mono" value={lote} onChange={(e) => setLote(e.target.value)} />
          </div>
          <div className="flex-1 min-w-56">
            <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
            <Input className="h-9" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <Button onClick={add}><Plus className="size-4 mr-1" /> Adicionar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow><TableHead>Produto</TableHead><TableHead>Lote mais antigo</TableHead><TableHead>Motivo</TableHead><TableHead className="w-16" /></TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                <TableCell className="font-mono text-xs">{r.lote_mais_antigo}</TableCell>
                <TableCell className="text-xs">{r.motivo ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => excluir(r.id)}><Trash2 className="size-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {q.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma exceção cadastrada</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
