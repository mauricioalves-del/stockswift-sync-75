import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, PackageMinus, Loader2, Pencil, Check, X } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/motivos-baixa")({
  component: MotivosBaixaPage,
  head: () => ({ meta: [{ title: "Motivos de Baixa" }] }),
});

function MotivosBaixaPage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");

  const { data: motivos, isLoading } = useQuery({
    queryKey: ["motivos-baixa-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motivo_baixa").select("*").order("descricao");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add() {
    const d = descricao.trim();
    if (!d) { toast.error("Descrição obrigatória"); return; }
    setSaving(true);
    const { error } = await supabase.from("motivo_baixa").insert({ descricao: d });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Motivo cadastrado");
    setDescricao("");
    qc.invalidateQueries({ queryKey: ["motivos-baixa-all"] });
    qc.invalidateQueries({ queryKey: ["motivos-baixa"] });
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from("motivo_baixa").update({ ativo }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["motivos-baixa-all"] });
      qc.invalidateQueries({ queryKey: ["motivos-baixa"] });
    }
  }

  async function saveEdit(id: string) {
    const d = editDesc.trim();
    if (!d) { toast.error("Descrição obrigatória"); return; }
    const { error } = await supabase.from("motivo_baixa").update({ descricao: d }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Motivo atualizado");
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["motivos-baixa-all"] });
    qc.invalidateQueries({ queryKey: ["motivos-baixa"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><PackageMinus className="size-6" /> Motivos de Baixa</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro dos motivos usados nas solicitações de Baixas Operacionais.
        </p>
      </div>

      {podeGerir && (
        <Card>
          <CardHeader><CardTitle className="text-base">Novo Motivo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder="Ex.: Vencimento, Avaria, Uso Interno..."
              />
            </div>
            <Button onClick={add} disabled={saving || !descricao.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" /> Adicionar</>}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-28 text-center">Ativo</TableHead>
                {podeGerir && <TableHead className="w-28 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={podeGerir ? 3 : 2} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
              {(motivos ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    {editId === m.id ? (
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m.id); if (e.key === "Escape") setEditId(null); }}
                        autoFocus
                      />
                    ) : m.descricao}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={m.ativo} onCheckedChange={(v) => toggleAtivo(m.id, v)} disabled={!podeGerir} />
                  </TableCell>
                  {podeGerir && (
                    <TableCell className="text-right">
                      {editId === m.id ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => saveEdit(m.id)}><Check className="size-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditId(null)}><X className="size-4" /></Button>
                        </div>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => { setEditId(m.id); setEditDesc(m.descricao); }}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && (motivos ?? []).length === 0 && (
                <TableRow><TableCell colSpan={podeGerir ? 3 : 2} className="text-center text-muted-foreground py-8">Nenhum motivo cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
