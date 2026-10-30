import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";

export function SlackShelfConfigCard() {
  const qc = useQueryClient();
  const [canal, setCanal] = useState("");
  const [novo, setNovo] = useState("");

  const q = useQuery({
    queryKey: ["shelf-slack-config"],
    queryFn: async () => {
      const [c, d, r, p, a] = await Promise.all([
        supabase.from("app_config").select("valor").eq("chave", "slack_canal_shelf").maybeSingle(),
        supabase.from("shelf_slack_departamentos").select("id, nome, almoxarifados").order("nome"),
        supabase.from("shelf_slack_responsaveis").select("departamento_id, user_id"),
        supabase.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
        supabase.from("estoque_sistemico").select("origem").gt("quantidade", 0).limit(10000),
      ]);
      const almoxs = [...new Set((a.data ?? []).map((x) => x.origem).filter(Boolean) as string[])].sort();
      return { almoxs, canal: typeof c.data?.valor === "string" ? c.data.valor : "", deps: d.data ?? [], resp: r.data ?? [], users: p.data ?? [] };
    },
  });
  useEffect(() => { if (q.data) setCanal(q.data.canal); }, [q.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["shelf-slack-config"] }); qc.invalidateQueries({ queryKey: ["shelf-slack-cadastro"] }); };

  async function salvarCanal() {
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("app_config").upsert({ chave: "slack_canal_shelf", valor: canal.trim(), updated_by: me, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Canal salvo"); refresh();
  }
  async function addDep() {
    if (!novo.trim()) return;
    const { error } = await supabase.from("shelf_slack_departamentos").insert({ nome: novo.trim() });
    if (error) return toast.error(error.message.includes("duplicate") ? "Departamento já existe" : error.message);
    setNovo(""); refresh();
  }
  async function delDep(id: string, nome: string) {
    if (!confirm(`Remover o departamento ${nome}?`)) return;
    const { error } = await supabase.from("shelf_slack_departamentos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function setResp(depId: string, ids: string[]) {
    const atuais = (q.data?.resp ?? []).filter((r) => r.departamento_id === depId).map((r) => r.user_id);
    const add = ids.filter((i) => !atuais.includes(i));
    const rem = atuais.filter((i) => !ids.includes(i));
    if (add.length) { const { error } = await supabase.from("shelf_slack_responsaveis").insert(add.map((u) => ({ departamento_id: depId, user_id: u }))); if (error) return toast.error(error.message); }
    if (rem.length) { const { error } = await supabase.from("shelf_slack_responsaveis").delete().eq("departamento_id", depId).in("user_id", rem); if (error) return toast.error(error.message); }
    refresh();
  }

  async function setAlmox(depId: string, v: string[]) {
    const { error } = await supabase.from("shelf_slack_departamentos").update({ almoxarifados: v }).eq("id", depId);
    if (error) return toast.error(error.message);
    refresh();
  }
  const almoxOpts = [...new Set([...(q.data?.almoxs ?? []), ...(q.data?.deps ?? []).flatMap((d) => d.almoxarifados ?? [])])].sort().map((x) => ({ value: x, label: x }));
  const userOpts = (q.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.nome || u.email} (${u.email})` }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" /> Slack — Risco de Shelf</CardTitle>
        <CardDescription>Canal que recebe as Trends do Mapeamento de Risco e responsáveis marcados por departamento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="canal-shelf">Canal (nome com # ou ID)</Label>
          <div className="flex gap-2">
            <Input id="canal-shelf" value={canal} placeholder="#shelf-life" onChange={(e) => setCanal(e.target.value)} />
            <Button onClick={salvarCanal}>Salvar</Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Departamentos, almoxarifados vinculados e responsáveis</Label>
          <p className="text-xs text-muted-foreground">Sem almox vinculado, o departamento é marcado para qualquer almox.</p>
          {(q.data?.deps ?? []).map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className="w-36 text-sm font-medium truncate">{d.nome}</span>
              <div className="w-48">
                <MultiSelect options={almoxOpts} value={d.almoxarifados ?? []} onChange={(v) => setAlmox(d.id, v)} allLabel="Todos os almox" />
              </div>
              <div className="flex-1">
                <MultiSelect options={userOpts} value={(q.data?.resp ?? []).filter((r) => r.departamento_id === d.id).map((r) => r.user_id)} onChange={(v) => setResp(d.id, v)} allLabel="Nenhum" />
              </div>
              <Button size="icon" variant="ghost" aria-label={`Remover ${d.nome}`} onClick={() => delDep(d.id, d.nome)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={novo} placeholder="Novo departamento (ex.: Qualidade)" onChange={(e) => setNovo(e.target.value)} />
            <Button variant="outline" onClick={addDep}>Adicionar</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
