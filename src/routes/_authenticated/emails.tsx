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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Plus, Pencil, X, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
  head: () => ({ meta: [{ title: "Cadastro de E-mails" }] }),
});

type Item = {
  id: string;
  finalidade: string;
  email: string;
  nome_contato: string | null;
  ativo: boolean;
};

function EmailsPage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();

  const [finalidade, setFinalidade] = useState("Baixa Fiscal");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editFinalidade, setEditFinalidade] = useState("");

  const { data } = useQuery({
    queryKey: ["cadastro_emails"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cadastro_emails").select("*").order("finalidade").order("email");
      if (error) throw error;
      return data as Item[];
    },
  });

  async function adicionar() {
    if (!email.trim() || !finalidade.trim()) return toast.error("Finalidade e e-mail são obrigatórios");
    setSaving(true);
    const { error } = await (supabase as any).from("cadastro_emails").insert({
      finalidade: finalidade.trim(),
      email: email.trim().toLowerCase(),
      nome_contato: nome.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setEmail(""); setNome("");
    toast.success("E-mail cadastrado");
    qc.invalidateQueries({ queryKey: ["cadastro_emails"] });
  }

  async function alternar(item: Item) {
    const { error } = await (supabase as any).from("cadastro_emails")
      .update({ ativo: !item.ativo }).eq("id", item.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cadastro_emails"] });
  }

  function iniciarEdicao(i: Item) {
    setEditId(i.id); setEditEmail(i.email); setEditNome(i.nome_contato ?? ""); setEditFinalidade(i.finalidade);
  }
  async function salvarEdicao() {
    if (!editId) return;
    const { error } = await (supabase as any).from("cadastro_emails").update({
      email: editEmail.trim().toLowerCase(),
      nome_contato: editNome.trim() || null,
      finalidade: editFinalidade.trim(),
    }).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["cadastro_emails"] });
  }

  if (!podeGerir) {
    return <div className="p-8 text-center text-muted-foreground">Acesso restrito a Administrador e Coordenador de Controle.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="size-6" /> Cadastro de E-mails</h1>
        <p className="text-sm text-muted-foreground">Destinatários de automações do sistema, agrupados por finalidade.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar destinatário</CardTitle>
          <CardDescription>Uma finalidade pode ter vários e-mails. Ex.: "Baixa Fiscal".</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_1fr_auto]">
            <div>
              <Label>Finalidade</Label>
              <Input value={finalidade} onChange={(e) => setFinalidade(e.target.value)} placeholder="Baixa Fiscal" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="fiscal@empresa.com" />
            </div>
            <div>
              <Label>Nome do contato</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="opcional" />
            </div>
            <div className="flex items-end">
              <Button onClick={adicionar} disabled={saving}>
                <Plus className="size-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Finalidade</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum e-mail cadastrado</TableCell></TableRow>
              )}
              {(data ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {editId === i.id
                      ? <Input value={editFinalidade} onChange={(e) => setEditFinalidade(e.target.value)} />
                      : <Badge variant="outline">{i.finalidade}</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {editId === i.id
                      ? <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                      : i.email}
                  </TableCell>
                  <TableCell className="text-sm">
                    {editId === i.id
                      ? <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                      : (i.nome_contato ?? "—")}
                  </TableCell>
                  <TableCell>
                    <Switch checked={i.ativo} onCheckedChange={() => alternar(i)} />
                  </TableCell>
                  <TableCell className="text-right">
                    {editId === i.id ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}><X className="size-3.5" /></Button>
                        <Button size="sm" onClick={salvarEdicao}><Check className="size-3.5" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => iniciarEdicao(i)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
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
