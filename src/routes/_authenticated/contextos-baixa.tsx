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
import { Plus, Loader2, Pencil, Check, X, Tags } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/contextos-baixa")({
  component: ContextosBaixaPage,
  head: () => ({
    meta: [
      { title: "Áreas e Operações de Baixa | Controle de Estoque" },
      { name: "description", content: "Cadastro das áreas solicitantes de Cortesia e das operações de Degustação usadas nas baixas operacionais." },
      { property: "og:title", content: "Áreas e Operações de Baixa" },
      { property: "og:description", content: "Cadastre as áreas de Cortesia e operações de Degustação das baixas operacionais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Opcao = { id: string; tipo: string; descricao: string; ativo: boolean };

function ContextosBaixaPage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "GERENTE";
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contexto-baixa-opcoes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contexto_baixa_opcoes")
        .select("*")
        .order("tipo")
        .order("descricao");
      if (error) throw error;
      return (data ?? []) as Opcao[];
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["contexto-baixa-opcoes-all"] });
    qc.invalidateQueries({ queryKey: ["contexto-baixa-opcoes"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tags className="size-6" /> Áreas e Operações de Baixa</h1>
        <p className="text-sm text-muted-foreground">
          Opções exibidas nas baixas operacionais quando o motivo for Cortesia (área solicitante) ou Degustação (operação).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco
          titulo="Áreas solicitantes (Cortesia)"
          tipo="CORTESIA"
          placeholder="Ex.: Comercial, Marketing, Diretoria..."
          itens={(data ?? []).filter((o) => o.tipo === "CORTESIA")}
          isLoading={isLoading}
          podeGerir={podeGerir}
          onChanged={invalidate}
        />
        <Bloco
          titulo="Operações (Degustação)"
          tipo="DEGUSTACAO"
          placeholder="Ex.: Shopping Eldorado, Loja Itaim..."
          itens={(data ?? []).filter((o) => o.tipo === "DEGUSTACAO")}
          isLoading={isLoading}
          podeGerir={podeGerir}
          onChanged={invalidate}
        />
      </div>
    </div>
  );
}

function Bloco({
  titulo, tipo, placeholder, itens, isLoading, podeGerir, onChanged,
}: {
  titulo: string; tipo: string; placeholder: string; itens: Opcao[];
  isLoading: boolean; podeGerir: boolean; onChanged: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");

  async function add() {
    const d = descricao.trim();
    if (!d) { toast.error("Descrição obrigatória"); return; }
    setSaving(true);
    const { error } = await supabase.from("contexto_baixa_opcoes").insert({ tipo, descricao: d });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Opção cadastrada");
    setDescricao("");
    onChanged();
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from("contexto_baixa_opcoes").update({ ativo }).eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  async function saveEdit(id: string) {
    const d = editDesc.trim();
    if (!d) { toast.error("Descrição obrigatória"); return; }
    const { error } = await supabase.from("contexto_baixa_opcoes").update({ descricao: d }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Opção atualizada");
    setEditId(null);
    onChanged();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {podeGerir && (
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Nova opção</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder={placeholder}
              />
            </div>
            <Button onClick={add} disabled={saving || !descricao.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" /> Adicionar</>}
            </Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24 text-center">Ativo</TableHead>
              {podeGerir && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={podeGerir ? 3 : 2} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && itens.length === 0 && (
              <TableRow><TableCell colSpan={podeGerir ? 3 : 2} className="text-center text-muted-foreground py-6">Nenhuma opção cadastrada.</TableCell></TableRow>
            )}
            {itens.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  {editId === o.id ? (
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(o.id); if (e.key === "Escape") setEditId(null); }}
                      autoFocus
                    />
                  ) : o.descricao}
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={o.ativo} onCheckedChange={(v) => toggleAtivo(o.id, v)} disabled={!podeGerir} />
                </TableCell>
                {podeGerir && (
                  <TableCell className="text-right">
                    {editId === o.id ? (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => saveEdit(o.id)}><Check className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditId(null)}><X className="size-4" /></Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={() => { setEditId(o.id); setEditDesc(o.descricao); }}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
