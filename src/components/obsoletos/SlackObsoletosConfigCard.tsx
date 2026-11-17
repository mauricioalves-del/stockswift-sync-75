// Configurações › Slack — Risco sem Giro (Obsoletos): canal, webhook de reserva e equipes que se posicionam.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageX, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";

const sb = supabase as any;
const txt = (v: unknown) => (typeof v === "string" ? v : "");

export function SlackObsoletosConfigCard() {
  const qc = useQueryClient();
  const [canal, setCanal] = useState("");
  const [webhook, setWebhook] = useState("");
  const [nova, setNova] = useState("");
  const q = useQuery({
    queryKey: ["obsoletos-slack-config"],
    queryFn: async () => {
      const [c, cs, w, e, r, u] = await Promise.all([
        supabase.from("app_config").select("valor").eq("chave", "slack_canal_obsoletos").maybeSingle(),
        supabase.from("app_config").select("valor").eq("chave", "slack_canal_shelf").maybeSingle(),
        supabase.from("app_config").select("valor").eq("chave", "slack_webhook_obsoletos").maybeSingle(),
        sb.from("obsoletos_slack_equipes").select("id, nome, ativo, ordem").order("ordem"),
        sb.from("obsoletos_slack_responsaveis").select("equipe_id, user_id"),
        supabase.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
      ]);
      return { canal: txt(c.data?.valor), canalShelf: txt(cs.data?.valor), webhook: txt(w.data?.valor), equipes: (e.data ?? []) as { id: string; nome: string; ativo: boolean; ordem: number }[], resp: (r.data ?? []) as { equipe_id: string; user_id: string }[], users: u.data ?? [] };
    },
  });
  useEffect(() => { if (q.data) { setCanal(/^https?:/i.test(q.data.canal) ? "" : q.data.canal); setWebhook(q.data.webhook); } }, [q.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["obsoletos-slack-config"] }); qc.invalidateQueries({ queryKey: ["obsoletos-slack-parametros"] }); };

  async function salvar() {
    const c = canal.trim(), w = webhook.trim();
    if (/^https?:/i.test(c)) return toast.error("No campo Canal vai o nome (#canal) ou o ID do canal, não a URL. A URL do webhook vai no campo de baixo.");
    if (w && !/^https:\/\/hooks\.slack\.com\/services\//.test(w)) return toast.error("Webhook inválido: deve começar com https://hooks.slack.com/services/");
    const me = (await supabase.auth.getUser()).data.user?.id, agora = new Date().toISOString();
    const { error } = await supabase.from("app_config").upsert([{ chave: "slack_canal_obsoletos", valor: c, updated_by: me, updated_at: agora }, { chave: "slack_webhook_obsoletos", valor: w, updated_by: me, updated_at: agora }]);
    if (error) return toast.error(error.message);
    toast.success("Parâmetros do Risco sem Giro salvos"); refresh();
  }
  async function addEquipe() {
    if (!nova.trim()) return;
    const ordem = Math.max(0, ...(q.data?.equipes ?? []).map((e) => e.ordem)) + 1;
    const { error } = await sb.from("obsoletos_slack_equipes").insert({ nome: nova.trim(), ordem });
    if (error) return toast.error(error.message.includes("duplicate") ? "Equipe já existe" : error.message);
    setNova(""); refresh();
  }
  async function delEquipe(id: string, nome: string) {
    if (!confirm(`Remover a equipe ${nome}?`)) return;
    const { error } = await sb.from("obsoletos_slack_equipes").delete().eq("id", id);
    if (error) return toast.error(error.message); refresh();
  }
  async function alternar(id: string, ativo: boolean) {
    const { error } = await sb.from("obsoletos_slack_equipes").update({ ativo }).eq("id", id);
    if (error) return toast.error(error.message); refresh();
  }
  async function setResp(equipeId: string, ids: string[]) {
    const atuais = (q.data?.resp ?? []).filter((r) => r.equipe_id === equipeId).map((r) => r.user_id);
    const add = ids.filter((i) => !atuais.includes(i)), rem = atuais.filter((i) => !ids.includes(i));
    if (add.length) { const { error } = await sb.from("obsoletos_slack_responsaveis").insert(add.map((u) => ({ equipe_id: equipeId, user_id: u }))); if (error) return toast.error(error.message); }
    if (rem.length) { const { error } = await sb.from("obsoletos_slack_responsaveis").delete().eq("equipe_id", equipeId).in("user_id", rem); if (error) return toast.error(error.message); }
    refresh();
  }
  const userOpts = (q.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.nome || u.email} (${u.email})` }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PackageX className="size-4" /> Slack — Risco sem Giro (Obsoletos)</CardTitle>
        <CardDescription>Trends do Mapeamento de Risco — Obsoletos: mensagem principal no canal e, como resposta, os itens e o padrão de posicionamento das equipes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="canal-obs">Canal (nome com # ou ID)</Label>
          <Input id="canal-obs" value={canal} placeholder={q.data?.canalShelf ? `Vazio = mesmo canal do Risco de Shelf (${q.data.canalShelf})` : "#risco-sem-giro"} onChange={(e) => setCanal(e.target.value)} />
          <Label htmlFor="wh-obs">Webhook de reserva</Label>
          <p className="text-xs text-muted-foreground">Usado só se a conexão do Slack estiver indisponível — publica uma mensagem única, sem resposta na Trend.</p>
          <div className="flex gap-2">
            <Input id="wh-obs" type="password" autoComplete="off" value={webhook} placeholder="https://hooks.slack.com/services/…" onChange={(e) => setWebhook(e.target.value)} />
            <Button onClick={salvar}>Salvar</Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Equipes que se posicionam e responsáveis</Label>
          <p className="text-xs text-muted-foreground">Comercial e Produtos têm padrão de resposta próprio; outras equipes recebem um padrão genérico. Equipes inativas não aparecem no envio.</p>
          {(q.data?.equipes ?? []).map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <label className="flex w-40 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={e.ativo} onChange={(ev) => alternar(e.id, ev.target.checked)} />{e.nome}</label>
              <div className="flex-1"><MultiSelect options={userOpts} value={(q.data?.resp ?? []).filter((r) => r.equipe_id === e.id).map((r) => r.user_id)} onChange={(v) => setResp(e.id, v)} allLabel="Nenhum" /></div>
              <Button size="icon" variant="ghost" aria-label={`Remover ${e.nome}`} onClick={() => delEquipe(e.id, e.nome)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={nova} placeholder="Nova equipe (ex.: Marketing)" onChange={(e) => setNova(e.target.value)} />
            <Button variant="outline" onClick={addEquipe}>Adicionar</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
