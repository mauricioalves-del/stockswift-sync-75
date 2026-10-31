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
import { Plus, Warehouse, Loader2 } from "lucide-react";
import { CentroCustoEdit } from "@/components/baixas/CentroCustoEdit";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/origens")({
  component: OrigensPage,
  head: () => ({ meta: [{ title: "Almox e centros de custo | Stock Savvy" }, { name: "description", content: "Cadastro de almoxarifados e seus centros de custo para baixas operacionais." }, { property: "og:title", content: "Almox e centros de custo | Stock Savvy" }, { property: "og:description", content: "Centros de custo por almoxarifado solicitante." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

function OrigensPage() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: origens, isLoading } = useQuery({
    queryKey: ["origens-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("origens").select("*").order("codigo_origem");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add() {
    if (!codigo.trim()) { toast.error("Código obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase.from("origens").insert({
      codigo_origem: codigo.trim().toUpperCase(),
      descricao: descricao.trim() || codigo.trim(),
      centro_custo: centroCusto.trim() || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Almox cadastrado");
      setCodigo(""); setDescricao(""); setCentroCusto("");
      qc.invalidateQueries({ queryKey: ["origens-all"] });
      qc.invalidateQueries({ queryKey: ["origens-ativas"] });
    }
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from("origens").update({ ativo }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["origens-all"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Warehouse className="size-6" /> Almox</h1>
        <p className="text-sm text-muted-foreground">
          Dimensão principal do sistema. Almox novos detectados na sincronização são cadastrados automaticamente.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Novo Almox</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-[200px_1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ALMOX_PA" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Almoxarifado Produto Acabado" />
            </div>
            <div><Label className="text-xs">Centro de custo</Label><Input aria-label="Centro de custo do novo almox" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} placeholder="Código - descrição" /></div>
            <Button onClick={add} disabled={saving || !codigo.trim()}>
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
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead className="w-24 text-center">Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
              {(origens ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs font-medium">{o.codigo_origem}</TableCell>
                  <TableCell>{o.descricao}</TableCell>
                  <TableCell><CentroCustoEdit tabela="origens" id={o.id} nome={o.codigo_origem} valor={o.centro_custo} podeEditar={isAdmin} onSaved={() => { qc.invalidateQueries({ queryKey: ["origens-all"] }); qc.invalidateQueries({ queryKey: ["origens-centros-custo"] }); }} /></TableCell>
                  <TableCell className="text-center">
                    <Switch checked={o.ativo} onCheckedChange={(v) => toggleAtivo(o.id, v)} disabled={!isAdmin} />
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (origens ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma origem cadastrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
