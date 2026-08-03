import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { EyeOff, Shield, ChevronRight, Warehouse, MessageSquare, Mail } from "lucide-react";


export const Route = createFileRoute("/_authenticated/config/")({
  component: ConfigPage,
  head: () => ({ meta: [{ title: "Configurações" }] }),
});

function ConfigPage() {
  const { isAdmin, role } = useRole();
  const [cego, setCego] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const isCoord = role === "COORDENADOR_CONTROLE";
  const podeGerirInv = isAdmin || role === "GERENTE" || isCoord;
  const podeGerirWebhook = isAdmin || isCoord;

  useEffect(() => {
    supabase.from("app_config").select("valor").eq("chave", "inventario_cego").maybeSingle()
      .then(({ data }) => setCego(data?.valor === true || data?.valor === "true"));
    supabase.from("app_config").select("valor").eq("chave", "slack_webhook_baixas").maybeSingle()
      .then(({ data }) => {
        const v = data?.valor;
        setWebhook(typeof v === "string" ? v : "");
      });
  }, []);

  async function toggle(v: boolean) {
    setCego(v);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("app_config").upsert({ chave: "inventario_cego", valor: v, updated_by: me, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(v ? "Inventário cego ativado" : "Saldo sistêmico será exibido");
  }

  async function salvarWebhook() {
    setWebhookSaving(true);
    try {
      const me = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("app_config").upsert({
        chave: "slack_webhook_baixas", valor: webhook, updated_by: me, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Webhook do Slack atualizado");
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao salvar");
    } finally {
      setWebhookSaving(false);
    }
  }


  if (!isAdmin && !isCoord) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Parâmetros globais da operação</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><EyeOff className="size-4" /> Inventário Cego</CardTitle>
            <CardDescription>Quando ativado, oculta o saldo sistêmico do operador durante a contagem.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="cego-switch">Ocultar saldo sistêmico</Label>
              <Switch id="cego-switch" checked={cego} onCheckedChange={toggle} />
            </div>
          </CardContent>
        </Card>
      )}

      {(isCoord || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Shield className="size-4" /> Perfis e Permissões</CardTitle>
            <CardDescription>Matriz de acesso por perfil e módulo. Disponível para Administrador e Coordenador de Controle.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/config/perfis">Abrir matriz de permissões <ChevronRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {podeGerirInv && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Warehouse className="size-4" /> Parâmetros de Inventário</CardTitle>
            <CardDescription>Almoxarifado padrão por usuário — usado na contagem quando a missão não define um.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/config/inventario">Configurar almoxarifado padrão <ChevronRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {podeGerirWebhook && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" /> Webhook Slack — Baixas</CardTitle>
            <CardDescription>URL do canal do Slack que recebe a notificação de cada nova solicitação de baixa. Restrito a Administrador e Coordenador de Controle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="wh-baixas">URL do webhook</Label>
            <Input
              id="wh-baixas"
              type="url"
              value={webhook}
              placeholder="https://hooks.slack.com/services/..."
              onChange={(e) => setWebhook(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={salvarWebhook} disabled={webhookSaving}>
                {webhookSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {podeGerirWebhook && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" /> WhatsApp — Colaboradores</CardTitle>
            <CardDescription>
              Endpoint do bot próprio que posta no grupo de colaboradores quando uma ação de Desconto Colaborador é
              gerada. O envio é feito pelo backend; o token nunca vai para o navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="wa-url">URL do bot</Label>
            <Input id="wa-url" type="url" value={waUrl} placeholder="https://seu-bot/enviar" onChange={(e) => setWaUrl(e.target.value)} />
            <Label htmlFor="wa-token">Token (Bearer)</Label>
            <Input id="wa-token" type="password" value={waToken} placeholder="—" onChange={(e) => setWaToken(e.target.value)} />
            <Label htmlFor="wa-grupo">Nome do grupo</Label>
            <Input id="wa-grupo" value={waGrupo} placeholder="Colaboradores Magio" onChange={(e) => setWaGrupo(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={salvarWhatsapp} disabled={waSaving}>{waSaving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {podeGerirWebhook && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Percent className="size-4" /> Desconto Colaborador</CardTitle>
            <CardDescription>Percentual aplicado sobre o Preço de Venda nas ações de Shelf Life.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="pct-desc">% de desconto</Label>
            <Input id="pct-desc" type="number" step="0.1" value={pctDesc} onChange={(e) => setPctDesc(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={salvarDesconto} disabled={pctSaving}>{pctSaving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </CardContent>
        </Card>
      )}


      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4" /> Parâmetros do Resend</CardTitle>
            <CardDescription>Remetente, reply-to e prefixo de assunto para os e-mails de Baixa Fiscal. Inclui envio de teste. Restrito ao Administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/config/resend">Configurar Resend <ChevronRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

